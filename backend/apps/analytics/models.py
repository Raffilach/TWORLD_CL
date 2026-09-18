"""Аналитика: кэш выводов и пользовательские нормативы."""
from django.db import models

from apps.core.models import OwnedModel


class Insight(OwnedModel):
    class Kind(models.TextChoices):
        CORRELATION = "correlation", "корреляция"
        WEAK_LINK = "weak_link", "слабое звено"
        WHAT_WORKED = "what_worked", "что сработало"
        FORECAST = "forecast", "прогноз"

    period_from = models.DateField()
    period_to = models.DateField()
    kind = models.CharField(max_length=12, choices=Kind.choices)
    payload = models.JSONField(default=dict)

    class Meta:
        ordering = ["-period_to"]
        indexes = [models.Index(fields=["user", "kind", "period_to"])]


class Standard(OwnedModel):
    """Норматив: произвольная цель с текущим статусом (планка, подтягивания, бег)."""

    class Source(models.TextChoices):
        EXERCISE_MAX_DURATION = "exercise_max_duration", "удержание, сек"
        EXERCISE_MAX_REPS = "exercise_max_reps", "повторы"
        EXERCISE_MAX_WEIGHT = "exercise_max_weight", "вес"
        MANUAL = "manual", "вручную"

    name = models.CharField(max_length=120)
    source = models.CharField(max_length=24, choices=Source.choices, default=Source.MANUAL)
    exercise = models.ForeignKey(
        "training.Exercise", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    target_value = models.DecimalField(max_digits=9, decimal_places=2)
    unit = models.CharField(max_length=16, default="")
    deadline = models.DateField(null=True, blank=True)
    current_value = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
