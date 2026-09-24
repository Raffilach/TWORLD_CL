"""Сборка недельного отчёта."""
from datetime import date, timedelta

from django.utils import timezone

from apps.analytics.services import week_bounds, week_metrics, weak_link, what_worked


def collect_report_data(user, week_start: date) -> dict:
    """Все цифры отчёта одним снимком.

    Снапшот хранится в `WeeklyReport.stats`: отчёт за прошлую неделю
    не должен меняться, если сегодня поправить старую запись.
    """
    from apps.body.services import trend_summary
    from apps.habits.models import Habit
    from apps.habits.services import habit_stats
    from apps.journal.models import LifeEvent
    from apps.nutrition.models import DietExceptionLog
    from apps.safety.models import InjuryLog
    from apps.training.models import PersonalRecord, SessionExercise, WorkoutSession
    from apps.training.services import volume_by_muscle

    week_end = week_start + timedelta(days=6)
    metrics = week_metrics(user, week_start, week_end)
    previous = week_metrics(user, week_start - timedelta(days=7), week_end - timedelta(days=7))

    sessions = (
        WorkoutSession.objects.filter(
            user=user, date__range=(week_start, week_end), deleted_at__isnull=True
        )
        .select_related("template", "gym")
        .prefetch_related("exercises__sets", "exercises__exercise", "exercises__fail_reason")
        .order_by("date")
    )

    workouts = []
    for session in sessions:
        exercises = []
        for entry in session.exercises.all():
            exercises.append({
                "name": entry.exercise.name,
                "status": entry.status,
                "block": entry.block_priority,
                "fail_reason": entry.fail_reason.name_ru if entry.fail_reason else None,
                "note": entry.notes,
                "sets": [
                    {
                        "number": item.set_number, "warmup": item.is_warmup,
                        "weight_kg": item.weight_kg, "reps": item.reps,
                        "duration_seconds": item.duration_seconds, "rir": item.rir,
                        "per_side": item.weight_is_per_side,
                    }
                    for item in entry.sets.filter(deleted_at__isnull=True)
                ],
            })
        workouts.append({
            "date": session.date,
            "template": session.template.name if session.template else "Без плана",
            "gym": session.gym.name if session.gym else None,
            "duration_seconds": session.duration_seconds,
            "tonnage_kg": float(session.tonnage_kg),
            "wellbeing": session.wellbeing_1_10,
            "while_injured": session.is_training_while_injured,
            "note": session.notes,
            "exercises": exercises,
        })

    skipped = [
        {
            "date": entry.session.date,
            "exercise": entry.exercise.name,
            "status": entry.status,
            "reason": entry.fail_reason.name_ru if entry.fail_reason else "",
            "counts": entry.counts_against_discipline,
        }
        for entry in SessionExercise.objects.filter(
            user=user, session__date__range=(week_start, week_end), deleted_at__isnull=True
        ).exclude(status=SessionExercise.Status.DONE).select_related("exercise", "fail_reason", "session")
    ]

    records = PersonalRecord.objects.filter(
        user=user, achieved_on__range=(week_start, week_end)
    ).select_related("exercise")

    weekday_names = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
    day_rows = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        day_sessions = [w for w in workouts if w["date"] == day]
        day_rows.append({
            "date": day,
            "weekday": weekday_names[day.weekday()],
            "workout": day_sessions[0]["template"] if day_sessions else None,
            "tonnage_kg": day_sessions[0]["tonnage_kg"] if day_sessions else None,
        })

    headline = _headline(metrics, previous)
    return {
        "period": {"from": week_start, "to": week_end, "iso_week": week_start.isocalendar().week},
        "generated_at": timezone.now(),
        "metrics": metrics,
        "previous": previous,
        "headline": headline,
        "verdict": _verdict(metrics, previous),
        "weak_link": weak_link(user, week_start, week_end),
        "what_worked": what_worked(user, week_start, week_end),
        "trend": trend_summary(user, week_end),
        "volume": volume_by_muscle(user, week_start, week_end),
        "workouts": workouts,
        "skipped": skipped,
        "records": [
            {"exercise": record.exercise.name, "kind": record.get_kind_display(),
             "value": float(record.value), "date": record.achieved_on}
            for record in records
        ],
        "days": day_rows,
        "pain_log": [
            {"date": log.date, "body_part": log.injury.body_part.name_ru,
             "severity": log.severity_1_10, "note": log.note}
            for log in InjuryLog.objects.filter(
                injury__user=user, date__range=(week_start, week_end)
            ).select_related("injury__body_part")
        ],
        "exceptions": [
            {"at": item.at, "kind": item.get_kind_display(), "note": item.amount_note}
            for item in DietExceptionLog.objects.filter(
                user=user, at__date__range=(week_start, week_end), deleted_at__isnull=True
            )
        ],
        "habits": [
            {"name": habit.name, **habit_stats(habit, week_end)}
            for habit in Habit.objects.filter(user=user, is_active=True)
        ],
        "events": [
            {"date": event.date_from, "title": event.title, "kind": event.get_kind_display()}
            for event in LifeEvent.objects.filter(
                user=user, date_from__range=(week_start, week_end)
            )
        ],
    }


def _headline(metrics: dict, previous: dict) -> dict:
    """Одна главная цифра недели крупно."""
    change = metrics["weight"]["change_kg"]
    if change is not None:
        return {
            "value": f"{change:+.2f} кг",
            "label": "тренд-вес за неделю",
            "hint": "Тренд, а не вес одного дня — он не скачет от воды и еды.",
        }
    if metrics["workouts"]["count"]:
        return {
            "value": str(metrics["workouts"]["count"]),
            "label": "тренировок за неделю",
            "hint": None,
        }
    return {"value": "—", "label": "данных за неделю мало", "hint": None}


def _verdict(metrics: dict, previous: dict) -> str:
    """Вердикт одной строкой. Без оценок «плохо» и «ты подвёл»."""
    workouts = metrics["workouts"]["count"]
    sleep = metrics["sleep"]["average_minutes"]
    target = metrics["sleep"]["target_minutes"]
    parts = []
    if workouts:
        parts.append(f"{workouts} тренировк{'а' if workouts == 1 else 'и' if workouts < 5 else ''}")
    if sleep:
        parts.append(f"сон в среднем {sleep // 60} ч {sleep % 60:02d} мин"
                     + (" — ниже цели" if sleep < target else " — в норме"))
    protein = metrics["protein"]
    if protein["days_logged"]:
        parts.append(f"белок в норме {protein['days_on_target']} из {protein['days_logged']} дней")
    return "; ".join(parts) if parts else "Данных за неделю немного — это тоже нормально."
