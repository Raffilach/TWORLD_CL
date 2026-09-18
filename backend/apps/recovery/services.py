"""Сон и восстановление: долг сна, связь с залом, арифметика вечера."""
from datetime import date, datetime, timedelta

from django.conf import settings
from django.db.models import Q

from .models import IllnessPeriod, SleepEntry

CONF = settings.TWORLD


def sleep_debt(user, date_from: date, date_to: date) -> dict:
    """Накопленный долг сна за период. Учитываются только недосыпы."""
    target = getattr(getattr(user, "settings", None), "sleep_target_minutes", 480)
    entries = SleepEntry.objects.filter(
        user=user, night_of__range=(date_from, date_to), deleted_at__isnull=True
    )
    debt = 0
    nights = 0
    total = 0
    for entry in entries:
        if entry.duration_minutes is None:
            continue
        nights += 1
        total += entry.duration_minutes
        if entry.duration_minutes < target:
            debt += target - entry.duration_minutes
    return {
        "target_minutes": target,
        "nights_logged": nights,
        "average_minutes": round(total / nights) if nights else None,
        "debt_minutes": debt,
    }


def bedtime_hits(user, date_from: date, date_to: date, tolerance_minutes: int = 15) -> dict:
    """Попадания в целевой отбой — тренд, а не галочка «лёг вовремя»."""
    settings_obj = getattr(user, "settings", None)
    goal = _as_time(getattr(settings_obj, "bedtime_goal", None))
    entries = SleepEntry.objects.filter(
        user=user, night_of__range=(date_from, date_to),
        bed_time__isnull=False, deleted_at__isnull=True,
    )
    hits = 0
    total = 0
    deviations = []
    for entry in entries:
        if goal is None:
            continue
        total += 1
        local_bed = entry.bed_time
        goal_dt = datetime.combine(local_bed.date(), goal, tzinfo=local_bed.tzinfo)
        # отбой после полуночи сравнивается с целью предыдущего вечера
        if local_bed.hour < 12:
            goal_dt -= timedelta(days=1)
        delta = round((local_bed - goal_dt).total_seconds() / 60)
        deviations.append(delta)
        if delta <= tolerance_minutes:
            hits += 1
    return {
        "goal": goal.strftime("%H:%M") if goal else None,
        "nights": total,
        "hits": hits,
        "percent": round(hits / total * 100) if total else None,
        "average_deviation_minutes": round(sum(deviations) / len(deviations)) if deviations else None,
    }


def short_sleep_warning(user, today: date | None = None) -> dict | None:
    """Три подряд ночи меньше 6 часов — предупреждение о риске заболеть.

    Формулировка про риск, а не упрёк: «ты мало спишь» тут не помогает.
    """
    today = today or date.today()
    streak_needed = CONF["SHORT_SLEEP_STREAK"]
    limit = CONF["SHORT_SLEEP_MINUTES"]
    nights = []
    for offset in range(1, streak_needed + 1):
        night = today - timedelta(days=offset)
        entry = SleepEntry.objects.filter(
            user=user, night_of=night, deleted_at__isnull=True
        ).order_by("-updated_at").first()
        if entry is None or entry.duration_minutes is None or entry.duration_minutes >= limit:
            return None
        nights.append({"night_of": night, "minutes": entry.duration_minutes})
    average = round(sum(n["minutes"] for n in nights) / len(nights))
    return {
        "nights": nights,
        "average_minutes": average,
        "message": (
            f"{streak_needed} ночи подряд меньше {limit // 60} часов "
            f"(в среднем {average // 60} ч {average % 60} мин). "
            "На таком фоне выше шанс заболеть и просесть в силе — "
            "сегодня имеет смысл лечь раньше."
        ),
    }


def sleep_vs_wellbeing(user, date_from: date, date_to: date) -> list[dict]:
    """Связь «сон → самочувствие в зале» на одних осях.

    Самая убедительная визуализация: человек своими глазами видит
    зависимость, которую словами объяснить не получается.
    """
    from apps.training.models import WorkoutSession

    sessions = WorkoutSession.objects.filter(
        user=user, date__range=(date_from, date_to),
        wellbeing_1_10__isnull=False, deleted_at__isnull=True,
    ).order_by("date")
    points = []
    for session in sessions:
        night = SleepEntry.objects.filter(
            user=user, night_of=session.date - timedelta(days=1), deleted_at__isnull=True
        ).order_by("-updated_at").first()
        points.append({
            "date": session.date,
            "sleep_minutes": night.duration_minutes if night else None,
            "wellbeing_1_10": session.wellbeing_1_10,
            "tonnage_kg": session.tonnage_kg,
        })
    return points


def _as_time(value):
    """Время может прийти строкой из JSON — приводим к datetime.time."""
    if isinstance(value, str):
        from django.utils.dateparse import parse_time

        return parse_time(value)
    return value


def evening_plan(user, gym_arrival=None) -> dict:
    """Во сколько выйти из зала, чтобы лечь вовремя.

    Реальная причина хронического недосыпа — не лень, а арифметика вечера:
    работа до 18, два часа зала, час дороги.
    """
    settings_obj = getattr(user, "settings", None)
    if settings_obj is None:
        return {}
    bedtime = _as_time(settings_obj.bedtime_goal)
    commute = settings_obj.commute_home_minutes
    wind_down = settings_obj.wind_down_minutes
    base = datetime.combine(date.today(), bedtime)
    leave_by = base - timedelta(minutes=commute + wind_down)
    return {
        "bedtime_goal": bedtime.strftime("%H:%M"),
        "commute_home_minutes": commute,
        "wind_down_minutes": wind_down,
        "leave_gym_by": leave_by.strftime("%H:%M"),
        "explanation": (
            f"Дорога {commute} мин + сборы и душ {wind_down} мин. "
            f"Чтобы лечь в {bedtime.strftime('%H:%M')}, выйти нужно в "
            f"{leave_by.strftime('%H:%M')}."
        ),
    }


def illness_days(user, date_from: date, date_to: date) -> set[date]:
    """Дни болезни исключаются из статистики дисциплины."""
    periods = IllnessPeriod.objects.filter(user=user, date_from__lte=date_to).filter(
        Q(date_to__isnull=True) | Q(date_to__gte=date_from)
    )
    days = set()
    for period in periods:
        current = max(period.date_from, date_from)
        end = min(period.date_to or date_to, date_to)
        while current <= end:
            days.add(current)
            current += timedelta(days=1)
    return days
