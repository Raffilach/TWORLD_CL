"""Логика безопасности: автометки, лимиты, рецидивы."""
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Q

from .models import Injury, InjuryExerciseFlag, RecurrenceNotice, WeightLimit, WeightLimitOverride

CONF = settings.TWORLD


def auto_flag_exercises(injury: Injury) -> int:
    """Отметил травму плеча → всё над головой помечено «осторожно».

    Связь идёт через теги движения, а не через список упражнений:
    новое упражнение с тегом `overhead` автоматически попадёт под метку.
    """
    from apps.catalog.models import BodyPartMovementRisk
    from apps.training.models import Exercise

    risks = BodyPartMovementRisk.objects.filter(body_part=injury.body_part).select_related(
        "movement_tag"
    )
    created = 0
    for risk in risks:
        exercises = Exercise.objects.filter(
            movement_tags=risk.movement_tag, is_archived=False
        ).filter(Q(owner__isnull=True) | Q(owner=injury.user))
        for exercise in exercises:
            _, is_new = InjuryExerciseFlag.objects.get_or_create(
                injury=injury, exercise=exercise, defaults={"level": risk.level, "is_auto": True}
            )
            created += int(is_new)
    return created


def check_recurrence(injury: Injury) -> RecurrenceNotice | None:
    """Вторая травма той же зоны за 60 дней.

    Приложение не должно делать вид, что «прошло и ладно».
    """
    window = CONF["INJURY_RECURRENCE_DAYS"]
    previous = (
        Injury.objects.filter(
            user=injury.user,
            body_part=injury.body_part,
            started_on__gte=injury.started_on - timedelta(days=window),
            started_on__lt=injury.started_on,
        )
        .exclude(pk=injury.pk)
        .order_by("-started_on")
        .first()
    )
    if previous is None:
        return None
    notice, _ = RecurrenceNotice.objects.get_or_create(
        user=injury.user,
        second_injury=injury,
        defaults={
            "body_part": injury.body_part,
            "first_injury": previous,
            "days_between": (injury.started_on - previous.started_on).days,
        },
    )
    return notice


def limits_for_exercise(user, exercise) -> list[dict]:
    """Персональные лимиты веса, относящиеся к упражнению."""
    limits = WeightLimit.objects.filter(user=user, is_active=True).filter(
        Q(exercise=exercise) | Q(movement_tag__in=exercise.movement_tags.all())
    )
    return [
        {
            "id": limit.id,
            "max_weight_kg": limit.max_weight_kg,
            "reason": limit.reason,
            "scope": "exercise" if limit.exercise_id else "movement",
        }
        for limit in limits.distinct()
    ]


def check_weight_limit(user, exercise, weight_kg, set_log=None) -> dict | None:
    """Не блокировка, а напоминание: в момент подхода про лимит никто не помнит."""
    weight = Decimal(str(weight_kg))
    for limit in WeightLimit.objects.filter(user=user, is_active=True).filter(
        Q(exercise=exercise) | Q(movement_tag__in=exercise.movement_tags.all())
    ).distinct():
        if weight > limit.max_weight_kg:
            WeightLimitOverride.objects.create(
                user=user, limit=limit, set_log=set_log, entered_weight_kg=weight
            )
            return {
                "type": "weight_limit",
                "limit_kg": limit.max_weight_kg,
                "entered_kg": weight,
                "reason": limit.reason,
                "message": (
                    f"Записано {weight} кг при личном лимите {limit.max_weight_kg} кг. "
                    f"Причина лимита: {limit.reason}."
                ),
                "blocking": False,
            }
    return None


def exercise_cautions(user, exercise) -> list[dict]:
    """Метки «осторожно» от активных травм + статус теста возврата."""
    flags = InjuryExerciseFlag.objects.filter(
        injury__user=user, exercise=exercise, dismissed_at__isnull=True,
        injury__resolved_on__isnull=True,
    ).select_related("injury__body_part")
    result = []
    for flag in flags:
        latest_test = flag.injury.return_tests.filter(exercise=exercise).order_by("-date").first()
        result.append({
            "injury_id": flag.injury_id,
            "body_part": flag.injury.body_part.name_ru,
            "level": flag.level,
            "unlocked": bool(latest_test and latest_test.unlocked),
            "needs_return_test": latest_test is None or not latest_test.unlocked,
        })
    return result
