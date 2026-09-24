"""Глобальные справочники. Заполняются сидами, пользователем не меняются."""
from django.db import models


class Muscle(models.Model):
    class Group(models.TextChoices):
        CHEST = "chest", "грудь"
        BACK = "back", "спина"
        SHOULDERS = "shoulders", "плечи"
        BICEPS = "biceps", "бицепс"
        TRICEPS = "triceps", "трицепс"
        QUADS = "quads", "квадрицепс"
        HAMSTRINGS = "hamstrings", "бицепс бедра"
        GLUTES = "glutes", "ягодицы"
        CALVES = "calves", "икры"
        CORE = "core", "кор"
        FOREARMS = "forearms", "предплечья"
        NECK = "neck", "шея"

    code = models.SlugField(max_length=40, unique=True)
    name_ru = models.CharField(max_length=60)
    name_en = models.CharField(max_length=60)
    group = models.CharField(max_length=20, choices=Group.choices)

    class Meta:
        ordering = ["group", "code"]

    def __str__(self):
        return self.name_ru


class Equipment(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    name_ru = models.CharField(max_length=60)
    name_en = models.CharField(max_length=60)

    class Meta:
        ordering = ["code"]
        verbose_name_plural = "equipment"

    def __str__(self):
        return self.name_ru


class BodyPart(models.Model):
    """Зона тела для карты травм (тап по схематичной карте)."""

    code = models.SlugField(max_length=40, unique=True)
    name_ru = models.CharField(max_length=60)
    name_en = models.CharField(max_length=60)
    region = models.CharField(max_length=20)  # upper / lower / trunk / head
    svg_path_id = models.CharField(max_length=40, blank=True)
    view = models.CharField(
        max_length=10,
        choices=[("front", "спереди"), ("back", "сзади"), ("both", "обе")],
        default="both",
    )

    class Meta:
        ordering = ["region", "code"]

    def __str__(self):
        return self.name_ru


class MovementTag(models.Model):
    """Характер движения — связующее звено «травма ↔ упражнения».

    Отметил травму плеча → все упражнения с тегом `overhead`
    получают метку «осторожно» автоматически.
    """

    code = models.SlugField(max_length=40, unique=True)
    name_ru = models.CharField(max_length=60)
    name_en = models.CharField(max_length=60)
    is_push = models.BooleanField(default=False)
    is_pull = models.BooleanField(default=False)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.name_ru


class BodyPartMovementRisk(models.Model):
    class Level(models.TextChoices):
        CAUTION = "caution", "осторожно"
        AVOID = "avoid", "лучше исключить"

    body_part = models.ForeignKey(BodyPart, on_delete=models.CASCADE, related_name="risks")
    movement_tag = models.ForeignKey(MovementTag, on_delete=models.CASCADE, related_name="risks")
    level = models.CharField(max_length=10, choices=Level.choices, default=Level.CAUTION)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["body_part", "movement_tag"], name="bodypart_movement_uniq"
            )
        ]

    def __str__(self):
        return f"{self.body_part} × {self.movement_tag} = {self.level}"


class FailReason(models.Model):
    """Причина «не смог».

    `counts_against_discipline` — ключевое поле: пропуск по внешней причине
    не должен портить статистику дисциплины, иначе цифры перестают
    отражать реальность.
    """

    code = models.SlugField(max_length=40, unique=True)
    name_ru = models.CharField(max_length=80)
    name_en = models.CharField(max_length=80)
    counts_against_discipline = models.BooleanField(default=True)
    suggests_alternative = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "code"]

    def __str__(self):
        return self.name_ru


class HealthTimelineItem(models.Model):
    """Таймлайн улучшений здоровья по срокам отказа от привычки."""

    habit_kind = models.SlugField(max_length=40)  # smoking / alcohol / sugar / ...
    hours_after = models.PositiveIntegerField()
    title_ru = models.CharField(max_length=120)
    title_en = models.CharField(max_length=120)
    description_ru = models.TextField(blank=True)
    description_en = models.TextField(blank=True)

    class Meta:
        ordering = ["habit_kind", "hours_after"]

    def __str__(self):
        return f"{self.habit_kind}: {self.title_ru}"


class CravingTrigger(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    name_ru = models.CharField(max_length=60)
    name_en = models.CharField(max_length=60)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "code"]

    def __str__(self):
        return self.name_ru
