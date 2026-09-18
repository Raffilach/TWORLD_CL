"""Недельный отчёт."""
from django.db import models

from apps.core.models import OwnedModel


def default_blocks_config():
    return {
        "summary": True,
        "days_table": True,
        "workouts": True,
        "skipped": True,
        "records": True,
        "exercise_charts": True,
        "pain_log": True,
        "nutrition_exceptions": True,
        "habits": True,
        "conclusions": True,
    }


class WeeklyReport(OwnedModel):
    class Variant(models.TextChoices):
        COACH = "coach", "подробная, для тренера"
        SELF = "self", "короткая, для себя"

    week_start = models.DateField(db_index=True)
    variant = models.CharField(max_length=6, choices=Variant.choices, default=Variant.SELF)
    blocks_config = models.JSONField(default=default_blocks_config)
    stats = models.JSONField(default=dict, help_text="Снапшот цифр: отчёт не меняется задним числом.")
    headline_metric = models.CharField(max_length=120, blank=True)
    verdict = models.CharField(max_length=200, blank=True)
    weak_link = models.CharField(max_length=200, blank=True)
    focus_next_week = models.CharField(max_length=200, blank=True)
    pdf = models.FileField(upload_to="reports/", null=True, blank=True)
    share_link = models.ForeignKey(
        "accounts.ShareLink", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    generated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-week_start"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "week_start", "variant"], name="weekly_report_uniq"
            )
        ]

    def __str__(self):
        return f"отчёт за неделю с {self.week_start}"
