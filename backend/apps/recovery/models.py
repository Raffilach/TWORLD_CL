"""Сон, болезни, метрики из Apple Health."""
from django.db import models

from apps.core.models import OwnedModel, SyncableModel


class SleepEntry(SyncableModel):
    """Одна ночь.

    Отбой и подъём вводятся как время, а не галочкой «лёг вовремя»:
    галочка не показывает, промахнулся ты на 10 минут или на два часа.
    """

    class Source(models.TextChoices):
        MANUAL = "manual", "вручную"
        SHORTCUT = "shortcut", "Apple Shortcuts"
        HEALTHKIT = "healthkit", "Apple Health"

    night_of = models.DateField(db_index=True, help_text="Дата вечера, а не утра.")
    bed_time = models.DateTimeField(null=True, blank=True)
    wake_time = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    quality_1_5 = models.PositiveSmallIntegerField(null=True, blank=True)
    awakenings = models.PositiveSmallIntegerField(null=True, blank=True)
    source = models.CharField(max_length=12, choices=Source.choices, default=Source.MANUAL)
    external_id = models.CharField(max_length=128, blank=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-night_of"]
        constraints = SyncableModel.Meta.constraints + [
            models.UniqueConstraint(
                fields=["user", "night_of", "source"], name="sleep_entry_night_source_uniq"
            )
        ]

    def __str__(self):
        return f"{self.night_of}: {self.duration_minutes or '?'} мин"

    def save(self, *args, **kwargs):
        if self.bed_time and self.wake_time and self.duration_minutes is None:
            self.duration_minutes = max(
                0, int((self.wake_time - self.bed_time).total_seconds() // 60)
            )
        super().save(*args, **kwargs)


class HealthMetric(OwnedModel):
    """Данные из Apple Health. `external_id` защищает от дублей при повторном импорте."""

    class Kind(models.TextChoices):
        STEPS = "steps", "шаги"
        RESTING_HR = "resting_hr", "пульс покоя"
        HR_AVG = "hr_avg", "средний пульс"
        ACTIVE_ENERGY = "active_energy_kcal", "активные калории"
        WORKOUT_MINUTES = "workout_minutes", "минуты тренировок"
        DISTANCE = "distance_m", "дистанция"
        HRV = "hrv_ms", "вариабельность пульса"

    date = models.DateField(db_index=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    source = models.CharField(max_length=20, default="shortcut")
    external_id = models.CharField(max_length=128, blank=True)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-date"]
        indexes = [models.Index(fields=["user", "kind", "date"])]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date", "kind", "source", "external_id"],
                name="health_metric_dedupe",
            )
        ]


class IllnessPeriod(OwnedModel):
    """Дни болезни исключаются из статистики дисциплины."""

    date_from = models.DateField()
    date_to = models.DateField(null=True, blank=True)
    label = models.CharField(max_length=80, blank=True)
    note = models.TextField(blank=True)

    class Meta:
        ordering = ["-date_from"]

    def __str__(self):
        return f"болезнь {self.date_from}–{self.date_to or 'сейчас'}"


class HealthImport(OwnedModel):
    class Source(models.TextChoices):
        SHORTCUT = "shortcut", "Apple Shortcuts"
        XML = "xml", "export.zip из «Здоровья»"

    source = models.CharField(max_length=12, choices=Source.choices)
    records_created = models.PositiveIntegerField(default=0)
    records_skipped = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=12, default="ok")
    error = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
