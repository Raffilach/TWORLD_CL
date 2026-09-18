"""Замеры тела. Основная цифра — тренд, а не сырой вес."""
from django.db import models

from apps.core.models import OwnedModel, SyncableModel


def default_conditions():
    return {"morning": True, "fasted": True, "after_toilet": False, "undressed": False}


class WeightEntry(SyncableModel):
    """Взвешивание.

    `conditions` фиксирует условия замера: разница между утренним
    и вечерним весом у одного человека — до 3 кг.
    """

    class Source(models.TextChoices):
        MANUAL = "manual", "вручную"
        SCALE = "scale", "умные весы"
        HEALTHKIT = "healthkit", "Apple Health"

    at = models.DateTimeField(db_index=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2)
    conditions = models.JSONField(default=default_conditions, blank=True)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.MANUAL)
    note = models.CharField(max_length=200, blank=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-at"]
        indexes = [models.Index(fields=["user", "at"])]
        constraints = SyncableModel.Meta.constraints

    def __str__(self):
        return f"{self.weight_kg} кг {self.at:%d.%m}"

    def conditions_key(self) -> str:
        """Ключ сопоставимости: замеры с разными условиями сравнивать нельзя."""
        data = self.conditions or {}
        return ",".join(sorted(k for k, v in data.items() if v))


class WeightTrendPoint(OwnedModel):
    """Скользящее среднее за 7 дней — основная отображаемая цифра."""

    date = models.DateField(db_index=True)
    raw_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    trend_kg = models.DecimalField(max_digits=6, decimal_places=3)
    points_used = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["date"]
        constraints = [
            models.UniqueConstraint(fields=["user", "date"], name="weight_trend_uniq")
        ]


class BodyMeasurement(OwnedModel):
    """Замеры сантиметром. Талия часто показывает прогресс раньше весов."""

    class Site(models.TextChoices):
        WAIST = "waist", "талия"
        CHEST = "chest", "грудь"
        HIPS = "hips", "бёдра"
        ARM_L = "arm_l", "рука левая"
        ARM_R = "arm_r", "рука правая"
        THIGH_L = "thigh_l", "бедро левое"
        THIGH_R = "thigh_r", "бедро правое"
        NECK = "neck", "шея"
        CALF = "calf", "икра"

    date = models.DateField(db_index=True)
    site = models.CharField(max_length=10, choices=Site.choices)
    value_cm = models.DecimalField(max_digits=5, decimal_places=1)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(fields=["user", "date", "site"], name="body_measurement_uniq")
        ]


class BodyCompositionScan(OwnedModel):
    """Данные анализатора состава тела (InBody и аналоги)."""

    at = models.DateTimeField(db_index=True)
    device = models.CharField(max_length=40, default="InBody")
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    body_fat_pct = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    body_fat_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    skeletal_muscle_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    total_water_l = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    intracellular_water_l = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    extracellular_water_l = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    protein_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    minerals_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    visceral_fat_level = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    bmr_kcal = models.PositiveIntegerField(null=True, blank=True)
    score = models.PositiveSmallIntegerField(null=True, blank=True)
    photo = models.ImageField(upload_to="scans/", null=True, blank=True)
    conditions_note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-at"]

    def __str__(self):
        return f"замер состава {self.at:%d.%m.%Y}"


class BodyCompositionSegment(models.Model):
    class Segment(models.TextChoices):
        ARM_L = "arm_l", "рука левая"
        ARM_R = "arm_r", "рука правая"
        TRUNK = "trunk", "туловище"
        LEG_L = "leg_l", "нога левая"
        LEG_R = "leg_r", "нога правая"

    scan = models.ForeignKey(BodyCompositionScan, on_delete=models.CASCADE, related_name="segments")
    segment = models.CharField(max_length=8, choices=Segment.choices)
    lean_mass_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    fat_mass_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    lean_pct_of_norm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["scan", "segment"], name="scan_segment_uniq")
        ]


class ProgressPhoto(OwnedModel):
    class Pose(models.TextChoices):
        FRONT = "front", "спереди"
        SIDE = "side", "сбоку"
        BACK = "back", "сзади"

    date = models.DateField(db_index=True)
    pose = models.CharField(max_length=6, choices=Pose.choices, default=Pose.FRONT)
    photo = models.ImageField(upload_to="progress/")
    outline_used = models.BooleanField(default=False)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-date"]


class PhotoSchedule(OwnedModel):
    interval_days = models.PositiveSmallIntegerField(default=14)
    next_due_on = models.DateField(null=True, blank=True)
