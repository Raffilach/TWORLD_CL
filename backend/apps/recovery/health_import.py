"""Приём данных Apple Health.

PWA не имеет прямого доступа к HealthKit — это ограничение iOS.
Поддерживаются два пути без нативного приложения:
  1. Apple Shortcuts → вебхук (автоматизация «каждое утро отправить сон и шаги»);
  2. выгрузка export.zip из приложения «Здоровье» (разовый импорт истории).

Оба пути приходят в один эндпоинт и дедуплицируются по `external_id`.
"""
from datetime import datetime

from django.utils.dateparse import parse_date, parse_datetime

from .models import HealthImport, HealthMetric, SleepEntry

METRIC_ALIASES = {
    "steps": HealthMetric.Kind.STEPS,
    "step_count": HealthMetric.Kind.STEPS,
    "resting_heart_rate": HealthMetric.Kind.RESTING_HR,
    "resting_hr": HealthMetric.Kind.RESTING_HR,
    "heart_rate": HealthMetric.Kind.HR_AVG,
    "active_energy": HealthMetric.Kind.ACTIVE_ENERGY,
    "active_energy_burned": HealthMetric.Kind.ACTIVE_ENERGY,
    "workout_minutes": HealthMetric.Kind.WORKOUT_MINUTES,
    "exercise_minutes": HealthMetric.Kind.WORKOUT_MINUTES,
    "distance": HealthMetric.Kind.DISTANCE,
    "walking_running_distance": HealthMetric.Kind.DISTANCE,
    "hrv": HealthMetric.Kind.HRV,
}


def ingest(user, payload: dict, source: str = "shortcut") -> HealthImport:
    """payload = {"metrics": [...], "sleep": [...], "workouts": [...]}"""
    created = skipped = 0

    for item in payload.get("metrics", []):
        kind = METRIC_ALIASES.get(str(item.get("type", "")).lower())
        day = parse_date(str(item.get("date", "")))
        if kind is None or day is None or item.get("value") is None:
            skipped += 1
            continue
        _, is_new = HealthMetric.objects.get_or_create(
            user=user,
            date=day,
            kind=kind,
            source=source,
            external_id=str(item.get("id", "")),
            defaults={"value": item["value"], "payload": item},
        )
        created += int(is_new)
        skipped += int(not is_new)

    for item in payload.get("sleep", []):
        night = parse_date(str(item.get("night_of", "")))
        bed = parse_datetime(str(item.get("bed_time", ""))) if item.get("bed_time") else None
        wake = parse_datetime(str(item.get("wake_time", ""))) if item.get("wake_time") else None
        if night is None and bed is not None:
            night = bed.date() if bed.hour >= 12 else (bed.date() - _one_day())
        if night is None:
            skipped += 1
            continue
        # Ручной ввод — источник истины: импорт его не затирает.
        if SleepEntry.objects.filter(
            user=user, night_of=night, source=SleepEntry.Source.MANUAL, deleted_at__isnull=True
        ).exists():
            skipped += 1
            continue
        _, is_new = SleepEntry.objects.update_or_create(
            user=user,
            night_of=night,
            source=source if source in SleepEntry.Source.values else SleepEntry.Source.SHORTCUT,
            defaults={
                "bed_time": bed,
                "wake_time": wake,
                "duration_minutes": item.get("duration_minutes"),
                "external_id": str(item.get("id", "")),
            },
        )
        created += int(is_new)

    created += _ingest_challenges(user, payload.get("workouts", []))

    return HealthImport.objects.create(
        user=user, source=source, records_created=created, records_skipped=skipped
    )


def _one_day():
    from datetime import timedelta

    return timedelta(days=1)


def _ingest_challenges(user, workouts: list) -> int:
    """Автозачёт челленджей: «дистанция ≥ 4 км без остановки»."""
    from apps.habits.models import Challenge, ChallengeEntry

    created = 0
    challenges = list(Challenge.objects.filter(user=user, is_active=True).exclude(auto_rule={}))
    for workout in workouts:
        day = parse_date(str(workout.get("date", "")))
        if day is None:
            continue
        for challenge in challenges:
            rule = challenge.auto_rule or {}
            metric = rule.get("metric", "distance_m")
            value = workout.get(metric)
            if value is None:
                continue
            if rule.get("min_value") is not None and float(value) < float(rule["min_value"]):
                continue
            if rule.get("activity_type") and workout.get("type") != rule["activity_type"]:
                continue
            _, is_new = ChallengeEntry.objects.get_or_create(
                user=user,
                challenge=challenge,
                external_id=str(workout.get("id", f"{day}-{metric}")),
                defaults={
                    "date": day,
                    "value": 1 if challenge.unit == "count" else value,
                    "source": "health",
                },
            )
            created += int(is_new)
    return created
