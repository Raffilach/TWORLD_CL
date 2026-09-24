"""Обмен с языковыми моделями: приём планов обратно."""
from django.db import models

from apps.core.models import OwnedModel


class PlanImport(OwnedModel):
    class Format(models.TextChoices):
        MARKDOWN = "markdown", "markdown"
        JSON = "json", "json"

    raw_text = models.TextField()
    format = models.CharField(max_length=8, choices=Format.choices, default=Format.MARKDOWN)
    parsed = models.JSONField(default=dict, blank=True)
    created_template = models.ForeignKey(
        "training.WorkoutTemplate", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
    )
    status = models.CharField(max_length=12, default="pending")
    errors = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-created_at"]
