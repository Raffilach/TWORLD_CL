"""Аналитика: корреляции, слабое звено, сравнения, прогнозы.

Принцип раздела: показываем тренды и выводы, а не сырые цифры.
Один плохой день ничего не значит, поэтому всё считается по неделям.
"""
from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Avg, Count, Sum
from django.utils import timezone


# --------------------------------------------------------------------------
# корреляция рангов (Спирмен) без внешних зависимостей
# --------------------------------------------------------------------------
def _ranks(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    index = 0
    while index < len(order):
        same = index
        while same + 1 < len(order) and values[order[same + 1]] == values[order[index]]:
            same += 1
        average = (index + same) / 2 + 1
        for position in range(index, same + 1):
            ranks[order[position]] = average
        index = same + 1
    return ranks


def spearman(pairs: list[tuple[float, float]]) -> float | None:
    if len(pairs) < 4:
        return None
    xs = _ranks([p[0] for p in pairs])
    ys = _ranks([p[1] for p in pairs])
    n = len(pairs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    denominator = (
        sum((x - mean_x) ** 2 for x in xs) * sum((y - mean_y) ** 2 for y in ys)
    ) ** 0.5
    if denominator == 0:
        return None
    return round(numerator / denominator, 3)


def _strength(rho: float | None) -> str:
    if rho is None:
        return "мало данных"
    value = abs(rho)
    if value < 0.2:
        return "связи не видно"
    if value < 0.4:
        return "слабая связь"
    if value < 0.6:
        return "заметная связь"
    return "сильная связь"


# --------------------------------------------------------------------------
# сбор дневных рядов
# --------------------------------------------------------------------------
def daily_series(user, date_from: date, date_to: date) -> dict[str, dict[date, float]]:
    from apps.body.models import WeightTrendPoint
    from apps.journal.models import DailyLog
    from apps.nutrition.models import DietExceptionLog, MealEntry
    from apps.recovery.models import SleepEntry
    from apps.training.models import WorkoutSession

    series: dict[str, dict[date, float]] = {
        "sleep_minutes": {}, "mood": {}, "energy": {}, "trend_weight": {},
        "protein_g": {}, "sweets": {}, "tonnage": {}, "wellbeing": {},
    }
    for entry in SleepEntry.objects.filter(
        user=user, night_of__range=(date_from, date_to), deleted_at__isnull=True
    ):
        if entry.duration_minutes:
            # сон ночи N влияет на день N+1
            series["sleep_minutes"][entry.night_of + timedelta(days=1)] = entry.duration_minutes
    for log in DailyLog.objects.filter(
        user=user, date__range=(date_from, date_to), deleted_at__isnull=True
    ):
        if log.mood_1_5:
            series["mood"][log.date] = log.mood_1_5
        if log.energy_1_5:
            series["energy"][log.date] = log.energy_1_5
    for point in WeightTrendPoint.objects.filter(user=user, date__range=(date_from, date_to)):
        series["trend_weight"][point.date] = float(point.trend_kg)
    for row in (
        MealEntry.objects.filter(user=user, at__date__range=(date_from, date_to), deleted_at__isnull=True)
        .values("at__date")
        .annotate(total=Sum("protein_g"))
    ):
        series["protein_g"][row["at__date"]] = float(row["total"] or 0)
    for row in (
        DietExceptionLog.objects.filter(
            user=user, at__date__range=(date_from, date_to), deleted_at__isnull=True
        )
        .values("at__date")
        .annotate(count=Count("id"))
    ):
        series["sweets"][row["at__date"]] = row["count"]
    for session in WorkoutSession.objects.filter(
        user=user, date__range=(date_from, date_to), deleted_at__isnull=True
    ):
        series["tonnage"][session.date] = float(session.tonnage_kg or 0)
        if session.wellbeing_1_10:
            series["wellbeing"][session.date] = session.wellbeing_1_10
    return series


CORRELATION_PAIRS = [
    ("sleep_minutes", "wellbeing", "Сон → самочувствие в зале"),
    ("sleep_minutes", "mood", "Сон → настроение"),
    ("sleep_minutes", "trend_weight", "Сон → тренд веса"),
    ("sweets", "trend_weight", "Сладкое → тренд веса"),
    ("tonnage", "mood", "Тренировки → настроение"),
    ("protein_g", "trend_weight", "Белок → тренд веса"),
]


def correlations(user, date_from: date, date_to: date) -> list[dict]:
    series = daily_series(user, date_from, date_to)
    result = []
    for left, right, title in CORRELATION_PAIRS:
        common = sorted(set(series[left]) & set(series[right]))
        pairs = [(series[left][day], series[right][day]) for day in common]
        rho = spearman(pairs)
        result.append({
            "key": f"{left}__{right}",
            "title": title,
            "samples": len(pairs),
            "rho": rho,
            "strength": _strength(rho),
            "points": [
                {"date": day, "x": series[left][day], "y": series[right][day]}
                for day in common
            ],
            "note": "Связь не означает причину — это подсказка, что посмотреть.",
        })
    return result


# --------------------------------------------------------------------------
# недельные метрики
# --------------------------------------------------------------------------
def week_bounds(any_day: date) -> tuple[date, date]:
    start = any_day - timedelta(days=any_day.weekday())
    return start, start + timedelta(days=6)


def week_metrics(user, start: date, end: date) -> dict:
    from apps.body.models import WeightTrendPoint
    from apps.habits.models import HabitEpisode
    from apps.nutrition.models import DietExceptionLog, MealEntry
    from apps.recovery.services import bedtime_hits, sleep_debt
    from apps.training.models import WorkoutSession
    from apps.training.services import discipline_stats

    sessions = WorkoutSession.objects.filter(
        user=user, date__range=(start, end), deleted_at__isnull=True,
        status=WorkoutSession.Status.COMPLETED,
    )
    aggregate = sessions.aggregate(
        count=Count("id"), tonnage=Sum("tonnage_kg"),
        duration=Avg("duration_seconds"), wellbeing=Avg("wellbeing_1_10"),
    )
    trend_start = WeightTrendPoint.objects.filter(user=user, date__lte=start).order_by("-date").first()
    trend_end = WeightTrendPoint.objects.filter(user=user, date__lte=end).order_by("-date").first()
    protein_rows = (
        MealEntry.objects.filter(user=user, at__date__range=(start, end), deleted_at__isnull=True)
        .values("at__date").annotate(total=Sum("protein_g"))
    )
    target = getattr(getattr(user, "settings", None), "protein_target_g", 150)
    protein_days = [float(row["total"] or 0) for row in protein_rows]
    sleep = sleep_debt(user, start, end)

    return {
        "period": {"from": start, "to": end},
        "workouts": {
            "count": aggregate["count"] or 0,
            "tonnage_kg": float(aggregate["tonnage"] or 0),
            "avg_duration_seconds": int(aggregate["duration"] or 0),
            "avg_wellbeing": round(float(aggregate["wellbeing"]), 1) if aggregate["wellbeing"] else None,
        },
        "weight": {
            "trend_start_kg": float(trend_start.trend_kg) if trend_start else None,
            "trend_end_kg": float(trend_end.trend_kg) if trend_end else None,
            "change_kg": (
                round(float(trend_end.trend_kg - trend_start.trend_kg), 2)
                if trend_start and trend_end else None
            ),
        },
        "sleep": {
            **sleep,
            "bedtime": bedtime_hits(user, start, end),
        },
        "protein": {
            "target_g": target,
            "days_on_target": sum(1 for value in protein_days if value >= target),
            "days_logged": len(protein_days),
            "average_g": round(sum(protein_days) / len(protein_days)) if protein_days else None,
        },
        "exceptions": {
            row["kind"]: row["count"]
            for row in DietExceptionLog.objects.filter(
                user=user, at__date__range=(start, end), deleted_at__isnull=True
            ).values("kind").annotate(count=Count("id"))
        },
        "habit_episodes": HabitEpisode.objects.filter(
            user=user, occurred_at__date__range=(start, end), deleted_at__isnull=True
        ).count(),
        "discipline": discipline_stats(user, start, end),
    }


def weak_link(user, start: date, end: date) -> dict:
    """Одна метрика, тянущая остальные вниз — и один фокус на неделю.

    Намеренно возвращается ровно один пункт: список из десяти проблем
    не выполняется, а демотивирует.
    """
    current = week_metrics(user, start, end)
    previous = week_metrics(user, start - timedelta(days=7), end - timedelta(days=7))

    candidates = []

    sleep_avg = current["sleep"]["average_minutes"]
    if sleep_avg is not None and sleep_avg < current["sleep"]["target_minutes"]:
        gap = current["sleep"]["target_minutes"] - sleep_avg
        candidates.append({
            "metric": "sleep",
            "severity": gap / 60,
            "title": "Сон",
            "detail": f"В среднем {sleep_avg // 60} ч {sleep_avg % 60:02d} мин при цели "
                      f"{current['sleep']['target_minutes'] // 60} ч.",
            "focus": "На следующей неделе — лечь вовремя хотя бы 4 ночи из 7.",
        })

    protein = current["protein"]
    if protein["days_logged"] and protein["days_on_target"] < protein["days_logged"] / 2:
        candidates.append({
            "metric": "protein",
            "severity": 1.5,
            "title": "Белок",
            "detail": f"Норма выполнена {protein['days_on_target']} из {protein['days_logged']} дней.",
            "focus": "Добавить один белковый приём в день — проще всего в завтрак.",
        })

    if current["workouts"]["count"] < previous["workouts"]["count"]:
        candidates.append({
            "metric": "workouts",
            "severity": previous["workouts"]["count"] - current["workouts"]["count"],
            "title": "Число тренировок",
            "detail": f"{current['workouts']['count']} против {previous['workouts']['count']} "
                      "на прошлой неделе.",
            "focus": "Поставить в календарь конкретные дни и время.",
        })

    sweets = sum(current["exceptions"].values())
    previous_sweets = sum(previous["exceptions"].values())
    if sweets > previous_sweets and sweets >= 3:
        candidates.append({
            "metric": "exceptions",
            "severity": (sweets - previous_sweets) / 2,
            "title": "Исключения по питанию",
            "detail": f"{sweets} эпизодов против {previous_sweets} на прошлой неделе.",
            "focus": "Запланировать один свободный приём вместо стихийных.",
        })

    if not candidates:
        return {
            "found": False,
            "title": "Слабого звена не видно",
            "detail": "Ключевые метрики держатся на уровне прошлой недели.",
            "focus": "Продолжай в том же режиме.",
        }
    top = max(candidates, key=lambda item: item["severity"])
    return {"found": True, **top, "considered": len(candidates)}


def what_worked(user, start: date, end: date) -> list[str]:
    """2–3 пункта автоматически по цифрам."""
    current = week_metrics(user, start, end)
    previous = week_metrics(user, start - timedelta(days=7), end - timedelta(days=7))
    notes = []

    if current["workouts"]["count"] >= previous["workouts"]["count"] and current["workouts"]["count"]:
        notes.append(f"Тренировок: {current['workouts']['count']} — не меньше, чем неделей раньше.")
    if current["workouts"]["tonnage_kg"] > previous["workouts"]["tonnage_kg"]:
        delta = current["workouts"]["tonnage_kg"] - previous["workouts"]["tonnage_kg"]
        notes.append(f"Тоннаж вырос на {delta:.0f} кг.")
    if (
        current["sleep"]["average_minutes"]
        and previous["sleep"]["average_minutes"]
        and current["sleep"]["average_minutes"] > previous["sleep"]["average_minutes"]
    ):
        delta = current["sleep"]["average_minutes"] - previous["sleep"]["average_minutes"]
        notes.append(f"Спал в среднем на {delta} мин больше.")
    if current["protein"]["days_on_target"] > previous["protein"]["days_on_target"]:
        notes.append(
            f"Белок в норме {current['protein']['days_on_target']} дней "
            f"против {previous['protein']['days_on_target']}."
        )
    if current["habit_episodes"] < previous["habit_episodes"]:
        notes.append("Срывов по привычкам меньше, чем на прошлой неделе.")
    return notes[:3]


def compare_periods(user, a_start: date, a_end: date, b_start: date, b_end: date) -> dict:
    return {
        "a": week_metrics(user, a_start, a_end),
        "b": week_metrics(user, b_start, b_end),
    }


def heatmap(user, year: int) -> list[dict]:
    """Календарь-теплокарта: сколько «закрыто» в каждый день года."""
    from apps.body.models import WeightEntry
    from apps.journal.models import DailyLog
    from apps.nutrition.models import MealEntry
    from apps.recovery.models import SleepEntry
    from apps.training.models import WorkoutSession

    start = date(year, 1, 1)
    end = date(year, 12, 31)
    days: dict[date, int] = {}

    def bump(day):
        days[day] = days.get(day, 0) + 1

    for value in WeightEntry.objects.filter(
        user=user, at__date__range=(start, end), deleted_at__isnull=True
    ).values_list("at__date", flat=True):
        bump(value)
    for value in SleepEntry.objects.filter(
        user=user, night_of__range=(start, end), deleted_at__isnull=True
    ).values_list("night_of", flat=True):
        bump(value)
    for value in WorkoutSession.objects.filter(
        user=user, date__range=(start, end), status="completed", deleted_at__isnull=True
    ).values_list("date", flat=True):
        bump(value)
    for value in MealEntry.objects.filter(
        user=user, at__date__range=(start, end), deleted_at__isnull=True
    ).values_list("at__date", flat=True):
        bump(value)
    for value in DailyLog.objects.filter(
        user=user, date__range=(start, end), deleted_at__isnull=True
    ).values_list("date", flat=True):
        bump(value)

    return [{"date": day, "score": min(score, 5)} for day, score in sorted(days.items())]


def forecast_to_date(user, target_date: date) -> dict | None:
    """Прогноз к заданной дате по текущему темпу тренда."""
    from apps.body.models import WeightTrendPoint

    points = list(
        WeightTrendPoint.objects.filter(user=user).order_by("-date")[:28]
    )
    if len(points) < 7:
        return None
    newest, oldest = points[0], points[-1]
    days = (newest.date - oldest.date).days or 1
    rate = float(newest.trend_kg - oldest.trend_kg) / days
    horizon = (target_date - newest.date).days
    projected = float(newest.trend_kg) + rate * horizon
    profile = getattr(user, "profile", None)
    goal = float(profile.goal_weight_kg) if profile and profile.goal_weight_kg else None
    return {
        "from_date": newest.date,
        "target_date": target_date,
        "current_trend_kg": float(newest.trend_kg),
        "weekly_rate_kg": round(rate * 7, 2),
        "projected_kg": round(projected, 1),
        "goal_kg": goal,
        "reaches_goal": None if goal is None else (
            projected <= goal if rate < 0 else projected >= goal
        ),
    }
