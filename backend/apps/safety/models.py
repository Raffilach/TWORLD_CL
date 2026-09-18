"""Травмы и безопасность. Раздела нет в готовых трекерах, но он обязателен."""
from django.db import models

from apps.core.models import OwnedModel


class Injury(OwnedModel):
    class Side(models.TextChoices):
        LEFT = "left", "левая"
        RIGHT = "right", "правая"
        BOTH = "both", "обе"
        NA = "na", "не применимо"

    class Character(models.TextChoices):
        SHARP = "sharp", "острая"
        DULL = "dull", "тупая"
        ACHE = "ache", "ноющая"
        NUMBNESS = "numbness", "онемение"
        STIFFNESS = "stiffness", "скованность"
        OTHER = "other", "другое"

    body_part = models.ForeignKey(
        "catalog.BodyPart", on_delete=models.PROTECT, related_name="injuries"
    )
    side = models.CharField(max_length=6, choices=Side.choices, default=Side.NA)
    character = models.CharField(max_length=12, choices=Character.choices, default=Character.ACHE)
    started_on = models.DateField()
    resolved_on = models.DateField(null=True, blank=True)
    initial_severity = models.PositiveSmallIntegerField(default=5)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-started_on"]
        indexes = [models.Index(fields=["user", "body_part", "started_on"])]

    def __str__(self):
        return f"{self.body_part} с {self.started_on}"

    @property
    def is_active(self) -> bool:
        return self.resolved_on is None


class InjuryLog(models.Model):
    """Динамика по дням."""

    injury = models.ForeignKey(Injury, on_delete=models.CASCADE, related_name="logs")
    date = models.DateField()
    severity_1_10 = models.PositiveSmallIntegerField()
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(fields=["injury", "date"], name="injury_log_uniq")
        ]


class InjuryExerciseFlag(models.Model):
    """Травма плеча → всё над головой помечено «осторожно» автоматически."""

    class Level(models.TextChoices):
        CAUTION = "caution", "осторожно"
        AVOID = "avoid", "лучше исключить"

    injury = models.ForeignKey(Injury, on_delete=models.CASCADE, related_name="exercise_flags")
    exercise = models.ForeignKey(
        "training.Exercise", on_delete=models.CASCADE, related_name="injury_flags"
    )
    level = models.CharField(max_length=8, choices=Level.choices, default=Level.CAUTION)
    is_auto = models.BooleanField(default=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["injury", "exercise"], name="injury_exercise_uniq")
        ]


class WeightLimit(OwnedModel):
    """Персональный лимит веса с причиной.

    Не блокировка, а напоминание: в момент подхода про лимит никто не помнит.
    """

    exercise = models.ForeignKey(
        "training.Exercise", null=True, blank=True, on_delete=models.CASCADE,
        related_name="weight_limits",
    )
    movement_tag = models.ForeignKey(
        "catalog.MovementTag", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    max_weight_kg = models.DecimalField(max_digits=6, decimal_places=2)
    reason = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(exercise__isnull=False) | models.Q(movement_tag__isnull=False),
                name="weight_limit_target_required",
            )
        ]

    def __str__(self):
        return f"{self.exercise or self.movement_tag} ≤ {self.max_weight_kg} кг — {self.reason}"


class WeightLimitOverride(OwnedModel):
    """Факт превышения лимита. Полезно увидеть, как часто он игнорируется."""

    limit = models.ForeignKey(WeightLimit, on_delete=models.CASCADE, related_name="overrides")
    set_log = models.ForeignKey(
        "training.SetLog", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    entered_weight_kg = models.DecimalField(max_digits=6, decimal_places=2)

    class Meta:
        ordering = ["-created_at"]


class ReturnTest(OwnedModel):
    """Перед разблокировкой упражнения после травмы."""

    injury = models.ForeignKey(Injury, on_delete=models.CASCADE, related_name="return_tests")
    exercise = models.ForeignKey(
        "training.Exercise", on_delete=models.CASCADE, related_name="return_tests"
    )
    date = models.DateField()
    pain_without_weight = models.BooleanField()
    answer_note = models.CharField(max_length=200, blank=True)
    unlocked = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date"]

    def save(self, *args, **kwargs):
        self.unlocked = not self.pain_without_weight
        super().save(*args, **kwargs)


class RecurrenceNotice(OwnedModel):
    """Вторая травма той же зоны за 60 дней — не делаем вид, что «прошло и ладно»."""

    body_part = models.ForeignKey("catalog.BodyPart", on_delete=models.CASCADE, related_name="+")
    first_injury = models.ForeignKey(Injury, on_delete=models.CASCADE, related_name="+")
    second_injury = models.ForeignKey(Injury, on_delete=models.CASCADE, related_name="recurrence_notices")
    days_between = models.PositiveSmallIntegerField()
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "second_injury"], name="recurrence_notice_uniq"
            )
        ]
