"""Дневник, метки событий и дневные шкалы настроения/энергии."""
from django.db import models

from apps.core.models import OwnedModel, SyncableModel


class Tag(OwnedModel):
    name = models.CharField(max_length=40)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["user", "name"], name="journal_tag_uniq")
        ]

    def __str__(self):
        return self.name


class JournalEntry(SyncableModel):
    date = models.DateField(db_index=True)
    at = models.DateTimeField()
    text = models.TextField(blank=True)
    photo = models.ImageField(upload_to="journal/", null=True, blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="entries")
    is_locked = models.BooleanField(default=False)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-at"]
        constraints = SyncableModel.Meta.constraints


class QuickAnswer(models.Model):
    """Быстрые вопросы. Все необязательные."""

    class Question(models.TextChoices):
        WENT_WELL = "went_well", "что получилось"
        WAS_HARD = "was_hard", "что было тяжело"
        PROUD_OF = "proud_of", "чем горжусь"

    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="answers")
    question = models.CharField(max_length=12, choices=Question.choices)
    text = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["entry", "question"], name="quick_answer_uniq")
        ]


class VoiceNote(models.Model):
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name="voice_notes")
    audio = models.FileField(upload_to="voice/")
    duration_seconds = models.PositiveIntegerField(default=0)
    transcript = models.TextField(blank=True)
    status = models.CharField(max_length=10, default="pending")


class LifeEvent(OwnedModel):
    """Метки значимых событий.

    Появляются вертикальными линиями на всех графиках — это даёт
    объяснение провалам вместо самобичевания.
    """

    class Kind(models.TextChoices):
        INJURY = "injury", "травма"
        TRIP = "trip", "поездка"
        ILLNESS = "illness", "болезнь"
        EXAM = "exam", "экзамен"
        MOVE = "move", "переезд"
        OTHER = "other", "другое"

    date_from = models.DateField(db_index=True)
    date_to = models.DateField(null=True, blank=True)
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.OTHER)
    title = models.CharField(max_length=120)
    note = models.TextField(blank=True)
    show_on_charts = models.BooleanField(default=True)

    class Meta:
        ordering = ["-date_from"]

    def __str__(self):
        return f"{self.date_from} {self.title}"


class DailyLog(SyncableModel):
    """Настроение и энергия с экрана «Сегодня» — по тапу, шкала 1–5."""

    date = models.DateField(db_index=True)
    mood_1_5 = models.PositiveSmallIntegerField(null=True, blank=True)
    energy_1_5 = models.PositiveSmallIntegerField(null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-date"]
        constraints = SyncableModel.Meta.constraints + [
            models.UniqueConstraint(fields=["user", "date"], name="daily_log_uniq")
        ]
