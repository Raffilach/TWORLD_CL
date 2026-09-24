"""Сбор полного контекста пользователя для языковой модели.

Текстовые заметки включаются намеренно: «заболело левое плечо после
разведений» часто важнее, чем цифры подходов.
"""
from datetime import date, timedelta

from django.utils import timezone

from apps.core.units import seconds_to_label


def build_context(user, date_from: date | None = None, date_to: date | None = None,
                  sections: set[str] | None = None, include_journal: bool = False) -> dict:
    today = timezone.localdate()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=90))
    sections = sections or {
        "profile", "goals", "measurements", "workouts", "habits",
        "sleep", "nutrition", "injuries", "limits", "analytics",
    }

    data: dict = {
        "generated_at": timezone.now().isoformat(),
        "period": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "units": {
            "weight": "kg", "length": "cm", "volume": "ml",
            "duration": "seconds (integer)", "distance": "m",
        },
    }

    if "profile" in sections:
        data["profile"] = _profile(user)
    if "goals" in sections:
        data["goals"] = _goals(user)
    if "measurements" in sections:
        data["measurements"] = _measurements(user, date_from, date_to)
    if "workouts" in sections:
        data["workouts"] = _workouts(user, date_from, date_to)
    if "habits" in sections:
        data["habits"] = _habits(user)
    if "sleep" in sections:
        data["sleep"] = _sleep(user, date_from, date_to)
    if "nutrition" in sections:
        data["nutrition"] = _nutrition(user, date_from, date_to)
    if "injuries" in sections:
        data["injuries"] = _injuries(user)
    if "limits" in sections:
        data["limits"] = _limits(user)
    if "analytics" in sections:
        data["analytics"] = _analytics(user, date_from, date_to)
    if include_journal:
        data["journal"] = _journal(user, date_from, date_to)
    return data


def _profile(user):
    profile = getattr(user, "profile", None)
    settings_obj = getattr(user, "settings", None)
    return {
        "username": user.username,
        "display_name": user.display_name,
        "sex": getattr(profile, "sex", None),
        "birth_date": getattr(profile, "birth_date", None),
        "height_cm": getattr(profile, "height_cm", None),
        "timezone": getattr(profile, "timezone", None),
        "unit_system": getattr(profile, "unit_system", None),
        "tracks_calories": getattr(settings_obj, "track_calories", False),
        "protein_target_g": getattr(settings_obj, "protein_target_g", None),
        "sleep_target_minutes": getattr(settings_obj, "sleep_target_minutes", None),
        "bedtime_goal": str(getattr(settings_obj, "bedtime_goal", "")) or None,
    }


def _goals(user):
    profile = getattr(user, "profile", None)
    from apps.analytics.models import Standard

    return {
        "goal_weight_kg": getattr(profile, "goal_weight_kg", None),
        "goal_bodyfat_pct": getattr(profile, "goal_bodyfat_pct", None),
        "goal_deadline": getattr(profile, "goal_deadline", None),
        "standards": [
            {
                "name": item.name, "target": item.target_value,
                "current": item.current_value, "unit": item.unit, "deadline": item.deadline,
            }
            for item in Standard.objects.filter(user=user)
        ],
    }


def _measurements(user, date_from, date_to):
    from apps.body.models import BodyCompositionScan, BodyMeasurement, WeightTrendPoint
    from apps.body.services import trend_summary

    scans = BodyCompositionScan.objects.filter(
        user=user, at__date__range=(date_from, date_to)
    ).prefetch_related("segments").order_by("at")
    return {
        "weight_trend": trend_summary(user),
        "weight_points": [
            {"date": point.date, "trend_kg": float(point.trend_kg),
             "raw_kg": float(point.raw_kg) if point.raw_kg else None}
            for point in WeightTrendPoint.objects.filter(user=user, date__range=(date_from, date_to))
        ],
        "tape": [
            {"date": item.date, "site": item.site, "value_cm": float(item.value_cm)}
            for item in BodyMeasurement.objects.filter(user=user, date__range=(date_from, date_to))
        ],
        "composition_scans": [
            {
                "at": scan.at, "body_fat_pct": scan.body_fat_pct,
                "skeletal_muscle_kg": scan.skeletal_muscle_kg,
                "total_water_l": scan.total_water_l,
                "visceral_fat_level": scan.visceral_fat_level,
                "segments": [
                    {"segment": seg.segment, "lean_mass_kg": seg.lean_mass_kg,
                     "fat_mass_kg": seg.fat_mass_kg}
                    for seg in scan.segments.all()
                ],
            }
            for scan in scans
        ],
    }


def _workouts(user, date_from, date_to):
    from apps.training.models import PersonalRecord, WorkoutSession

    sessions = (
        WorkoutSession.objects.filter(
            user=user, date__range=(date_from, date_to), deleted_at__isnull=True
        )
        .select_related("template", "gym")
        .prefetch_related("exercises__sets", "exercises__exercise", "exercises__fail_reason")
        .order_by("date")
    )
    result = []
    for session in sessions:
        exercises = []
        for entry in session.exercises.all():
            sets = [
                {
                    "set": item.set_number,
                    "warmup": item.is_warmup,
                    "weight_kg": float(item.weight_kg) if item.weight_kg is not None else None,
                    "per_side": item.weight_is_per_side,
                    "reps": item.reps,
                    "duration_seconds": item.duration_seconds,
                    "rir": item.rir,
                    "note": item.notes or None,
                }
                for item in entry.sets.filter(deleted_at__isnull=True)
            ]
            exercises.append({
                "exercise": entry.exercise.name,
                "block": entry.block_priority,
                "status": entry.status,
                "fail_reason": entry.fail_reason.code if entry.fail_reason else None,
                "counts_against_discipline": entry.counts_against_discipline,
                "unilateral": entry.exercise.is_unilateral,
                "note": entry.notes or None,
                "sets": sets,
            })
        result.append({
            "date": session.date,
            "template": session.template.name if session.template else None,
            "gym": session.gym.name if session.gym else None,
            "duration_seconds": session.duration_seconds,
            "tonnage_kg": float(session.tonnage_kg),
            "wellbeing_1_10": session.wellbeing_1_10,
            "trained_while_injured": session.is_training_while_injured,
            "note": session.notes or None,
            "exercises": exercises,
        })
    return {
        "sessions": result,
        "personal_records": [
            {"exercise": record.exercise.name, "kind": record.kind,
             "value": float(record.value), "date": record.achieved_on}
            for record in PersonalRecord.objects.filter(user=user).select_related("exercise")
        ],
    }


def _habits(user):
    from apps.habits.models import Habit
    from apps.habits.services import craving_patterns, habit_stats

    return {
        "items": [
            {
                "name": habit.name, "kind": habit.kind,
                "decision_date": habit.decision_date, **habit_stats(habit),
                "episodes": [
                    {"at": episode.occurred_at, "trigger":
                     episode.trigger.code if episode.trigger else None,
                     "note": episode.note or None}
                    for episode in habit.episodes.filter(deleted_at__isnull=True)
                ],
            }
            for habit in Habit.objects.filter(user=user, is_active=True)
        ],
        "craving_patterns": craving_patterns(user),
    }


def _sleep(user, date_from, date_to):
    from apps.recovery.models import SleepEntry
    from apps.recovery.services import bedtime_hits, sleep_debt

    return {
        "debt": sleep_debt(user, date_from, date_to),
        "bedtime": bedtime_hits(user, date_from, date_to),
        "nights": [
            {"night_of": entry.night_of, "minutes": entry.duration_minutes,
             "quality": entry.quality_1_5, "source": entry.source}
            for entry in SleepEntry.objects.filter(
                user=user, night_of__range=(date_from, date_to), deleted_at__isnull=True
            ).order_by("night_of")
        ],
    }


def _nutrition(user, date_from, date_to):
    from django.db.models import Count, Sum

    from apps.nutrition.models import DietExceptionLog, MealEntry

    protein_by_day = (
        MealEntry.objects.filter(
            user=user, at__date__range=(date_from, date_to), deleted_at__isnull=True
        )
        .values("at__date")
        .annotate(total=Sum("protein_g"))
        .order_by("at__date")
    )
    return {
        "protein_by_day": [
            {"date": row["at__date"], "protein_g": float(row["total"] or 0)}
            for row in protein_by_day
        ],
        "exceptions": [
            {"kind": row["kind"], "count": row["count"]}
            for row in DietExceptionLog.objects.filter(
                user=user, at__date__range=(date_from, date_to), deleted_at__isnull=True
            ).values("kind").annotate(count=Count("id"))
        ],
    }


def _injuries(user):
    from apps.safety.models import Injury, RecurrenceNotice

    return {
        "items": [
            {
                "body_part": injury.body_part.name_ru,
                "side": injury.side,
                "started_on": injury.started_on,
                "resolved_on": injury.resolved_on,
                "severity": injury.initial_severity,
                "note": injury.notes or None,
                "history": [
                    {"date": log.date, "severity": log.severity_1_10, "note": log.note or None}
                    for log in injury.logs.all()
                ],
            }
            for injury in Injury.objects.filter(user=user).select_related("body_part")
        ],
        "recurrences": [
            {"body_part": notice.body_part.name_ru, "days_between": notice.days_between}
            for notice in RecurrenceNotice.objects.filter(user=user).select_related("body_part")
        ],
    }


def _limits(user):
    from apps.safety.models import WeightLimit
    from apps.training.models import PlannedExclusion

    return {
        "weight_limits": [
            {
                "exercise": limit.exercise.name if limit.exercise else None,
                "movement_tag": limit.movement_tag.code if limit.movement_tag else None,
                "max_weight_kg": float(limit.max_weight_kg),
                "reason": limit.reason,
            }
            for limit in WeightLimit.objects.filter(user=user, is_active=True)
            .select_related("exercise", "movement_tag")
        ],
        "planned_exclusions": [
            {"exercise": item.exercise.name, "from": item.date_from,
             "to": item.date_to, "reason": item.reason}
            for item in PlannedExclusion.objects.filter(user=user).select_related("exercise")
        ],
    }


def _analytics(user, date_from, date_to):
    from apps.analytics.services import correlations, weak_link, week_bounds

    start, end = week_bounds(date_to)
    return {
        "correlations": [
            {k: v for k, v in item.items() if k != "points"}
            for item in correlations(user, date_from, date_to)
        ],
        "weak_link": weak_link(user, start, end),
    }


def _journal(user, date_from, date_to):
    from apps.journal.models import JournalEntry, LifeEvent

    return {
        "entries": [
            {"date": entry.date, "text": entry.text,
             "tags": [tag.name for tag in entry.tags.all()]}
            for entry in JournalEntry.objects.filter(
                user=user, date__range=(date_from, date_to), deleted_at__isnull=True
            ).prefetch_related("tags")
        ],
        "life_events": [
            {"date_from": event.date_from, "date_to": event.date_to,
             "kind": event.kind, "title": event.title}
            for event in LifeEvent.objects.filter(user=user)
        ],
    }


# --------------------------------------------------------------------------
# markdown — компактная версия для вставки в диалог
# --------------------------------------------------------------------------
def to_markdown(data: dict) -> str:
    lines: list[str] = []
    period = data.get("period", {})
    lines.append(f"# Контекст TWORLD ({period.get('from')} — {period.get('to')})")
    lines.append("")
    lines.append("Единицы: кг, см, мл, длительности — целые секунды.")
    lines.append("")

    profile = data.get("profile")
    if profile:
        lines.append("## Профиль")
        lines.append(
            f"- @{profile['username']}, {profile.get('sex') or 'пол не указан'}, "
            f"рост {profile.get('height_cm') or '?'} см"
        )
        lines.append(f"- Цель по белку: {profile.get('protein_target_g')} г/день")
        lines.append(f"- Цель отбоя: {profile.get('bedtime_goal')}")
        lines.append(f"- Калории считаются: {'да' if profile.get('tracks_calories') else 'нет'}")
        lines.append("")

    goals = data.get("goals")
    if goals:
        lines.append("## Цели")
        if goals.get("goal_weight_kg"):
            lines.append(f"- Целевой вес: {goals['goal_weight_kg']} кг к {goals.get('goal_deadline') or '—'}")
        if goals.get("goal_bodyfat_pct"):
            lines.append(f"- Целевой процент жира: {goals['goal_bodyfat_pct']}%")
        for standard in goals.get("standards", []):
            lines.append(
                f"- Норматив «{standard['name']}»: {standard.get('current') or '—'} "
                f"из {standard['target']} {standard.get('unit') or ''}"
            )
        lines.append("")

    measurements = data.get("measurements")
    if measurements:
        trend = measurements.get("weight_trend") or {}
        lines.append("## Вес и состав тела")
        lines.append(
            f"- Тренд-вес: {trend.get('trend_kg')} кг "
            f"(за 7 дней {trend.get('change_7d')}, за 30 дней {trend.get('change_30d')})"
        )
        for scan in measurements.get("composition_scans", [])[-3:]:
            lines.append(
                f"- Анализ {scan['at']:%d.%m.%Y}: жир {scan.get('body_fat_pct')}%, "
                f"мышцы {scan.get('skeletal_muscle_kg')} кг, вода {scan.get('total_water_l')} л"
            )
        lines.append("")

    injuries = data.get("injuries")
    if injuries and injuries.get("items"):
        lines.append("## Травмы и ограничения")
        for injury in injuries["items"]:
            state = "активна" if not injury["resolved_on"] else f"закрыта {injury['resolved_on']}"
            lines.append(
                f"- {injury['body_part']} ({injury['side']}), с {injury['started_on']}, {state}, "
                f"интенсивность {injury['severity']}/10"
            )
            if injury.get("note"):
                lines.append(f"  - заметка: {injury['note']}")
        lines.append("")

    limits = data.get("limits")
    if limits and limits.get("weight_limits"):
        lines.append("## Персональные лимиты веса")
        for limit in limits["weight_limits"]:
            target = limit["exercise"] or limit["movement_tag"]
            lines.append(f"- {target}: не выше {limit['max_weight_kg']} кг — {limit['reason']}")
        lines.append("")

    workouts = data.get("workouts")
    if workouts:
        lines.append("## Тренировки")
        for session in workouts["sessions"][-12:]:
            duration = seconds_to_label(session["duration_seconds"]) if session["duration_seconds"] else "—"
            lines.append(
                f"### {session['date']} · {session.get('template') or 'без плана'} · "
                f"{duration} · тоннаж {session['tonnage_kg']:.0f} кг · "
                f"самочувствие {session.get('wellbeing_1_10') or '—'}/10"
            )
            for entry in session["exercises"]:
                if entry["status"] == "done":
                    sets = ", ".join(_format_set(item) for item in entry["sets"])
                    mark = " (на одну сторону)" if entry["unilateral"] else ""
                    lines.append(f"- {entry['exercise']}{mark}: {sets or '—'}")
                else:
                    reason = f", причина: {entry['fail_reason']}" if entry["fail_reason"] else ""
                    lines.append(f"- {entry['exercise']}: {entry['status']}{reason}")
                if entry.get("note"):
                    lines.append(f"  - заметка: {entry['note']}")
            if session.get("note"):
                lines.append(f"- заметка к тренировке: {session['note']}")
            lines.append("")

    sleep = data.get("sleep")
    if sleep:
        debt = sleep.get("debt", {})
        bedtime = sleep.get("bedtime", {})
        lines.append("## Сон")
        lines.append(
            f"- Средняя длительность: {debt.get('average_minutes')} мин, "
            f"долг за период: {debt.get('debt_minutes')} мин"
        )
        lines.append(
            f"- Попадания в целевой отбой: {bedtime.get('hits')} из {bedtime.get('nights')}"
        )
        lines.append("")

    nutrition = data.get("nutrition")
    if nutrition:
        lines.append("## Питание")
        exceptions = ", ".join(
            f"{item['kind']}: {item['count']}" for item in nutrition.get("exceptions", [])
        )
        lines.append(f"- Исключения за период: {exceptions or 'нет'}")
        lines.append("")

    habits = data.get("habits")
    if habits and habits.get("items"):
        lines.append("## Привычки")
        for habit in habits["items"]:
            lines.append(
                f"- {habit['name']}: с решения {habit['days_since_decision']} дней, "
                f"текущая серия {habit['current_streak']}, чистых дней {habit['total_clean_days']}"
            )
        patterns = habits.get("craving_patterns", {})
        if patterns.get("riskiest_hour") is not None:
            lines.append(
                f"- Самое рискованное время: около {patterns['riskiest_hour']}:00 "
                f"({patterns['riskiest_hour_share']}% эпизодов тяги)"
            )
        lines.append("")

    analytics = data.get("analytics")
    if analytics:
        lines.append("## Выводы")
        for item in analytics.get("correlations", []):
            if item.get("rho") is not None:
                lines.append(f"- {item['title']}: ρ={item['rho']} ({item['strength']}, n={item['samples']})")
        weak = analytics.get("weak_link") or {}
        if weak.get("found"):
            lines.append(f"- Слабое звено недели: {weak['title']} — {weak['detail']}")
            lines.append(f"- Фокус на следующую неделю: {weak['focus']}")
        lines.append("")

    journal = data.get("journal")
    if journal and journal.get("entries"):
        lines.append("## Дневник")
        for entry in journal["entries"][-14:]:
            lines.append(f"- {entry['date']}: {entry['text'][:400]}")
        lines.append("")

    return "\n".join(lines)


def _format_set(item: dict) -> str:
    prefix = "разм. " if item.get("warmup") else ""
    if item.get("duration_seconds") is not None:
        return f"{prefix}{item['duration_seconds']} с"
    weight = item.get("weight_kg")
    reps = item.get("reps")
    rir = f" @RIR{item['rir']}" if item.get("rir") is not None else ""
    side = "/сторону" if item.get("per_side") else ""
    if weight is None:
        return f"{prefix}{reps} повт.{rir}"
    return f"{prefix}{weight:g}{side}×{reps}{rir}"
