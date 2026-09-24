"""Привычки.

Ключевое требование: срыв не стирает историю. Обе цифры — «дней с решения»
и «текущая серия» — считаются из событий, а не хранятся счётчиками,
поэтому отметка задним числом пересчитывает всё честно.
"""
from datetime import date as date_cls

from django.db import models

from apps.core.models import OwnedModel, SyncableModel


class Habit(OwnedModel):
    class Kind(models.TextChoices):
        QUIT = "quit", "отказ"
        BUILD = "build", "полезная"

    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=6, choices=Kind.choices, default=Kind.QUIT)
    decision_date = models.DateField(help_text="Дата решения. Никогда не сбрасывается.")
    timeline_kind = models.SlugField(max_length=40, blank=True)
    unit = models.CharField(max_length=10, default="days")
    target_per_week = models.PositiveSmallIntegerField(null=True, blank=True)
    money_per_day = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    icon_token = models.CharField(max_length=40, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name

    # --- производные метрики -------------------------------------------------
    def days_since_decision(self, today: date_cls | None = None) -> int:
        today = today or date_cls.today()
        return max(0, (today - self.decision_date).days)

    def current_streak(self, today: date_cls | None = None) -> int:
        """Серия с последнего эпизода. Обнуляется только она."""
        today = today or date_cls.today()
        last = self.episodes.order_by("-occurred_at").first()
        if last is None:
            return self.days_since_decision(today)
        return max(0, (today - last.occurred_at.date()).days)

    def total_clean_days(self, today: date_cls | None = None) -> int:
        """Накопленная статистика остаётся при срыве."""
        today = today or date_cls.today()
        dirty = {e.occurred_at.date() for e in self.episodes.all()}
        return max(0, self.days_since_decision(today) - len(dirty))

    def money_saved(self, today: date_cls | None = None):
        if not self.money_per_day:
            return None
        return self.money_per_day * self.total_clean_days(today)


class HabitEpisode(SyncableModel):
    """Срыв: точка на таймлайне, а не стёртая история.

    Можно отметить задним числом — серии пересчитаются честно.
    """

    habit = models.ForeignKey(Habit, on_delete=models.CASCADE, related_name="episodes")
    occurred_at = models.DateTimeField(db_index=True)
    amount = models.CharField(max_length=80, blank=True)
    trigger = models.ForeignKey(
        "catalog.CravingTrigger", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    note = models.TextField(blank=True, help_text="«Что случилось» — без осуждающих формулировок.")

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-occurred_at"]
        constraints = SyncableModel.Meta.constraints


class HabitCheckin(SyncableModel):
    """Отметка полезной привычки за день."""

    habit = models.ForeignKey(Habit, on_delete=models.CASCADE, related_name="checkins")
    date = models.DateField(db_index=True)
    done = models.BooleanField(default=True)
    value = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-date"]
        constraints = SyncableModel.Meta.constraints + [
            models.UniqueConstraint(fields=["habit", "date"], name="habit_checkin_uniq")
        ]


class CravingLog(SyncableModel):
    """Журнал тяги — источник карты триггеров и персонального рискового времени."""

    habit = models.ForeignKey(
        Habit, null=True, blank=True, on_delete=models.CASCADE, related_name="cravings"
    )
    occurred_at = models.DateTimeField(db_index=True)
    intensity_1_10 = models.PositiveSmallIntegerField()
    trigger = models.ForeignKey(
        "catalog.CravingTrigger", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    place = models.CharField(max_length=80, blank=True)
    what_helped = models.CharField(max_length=200, blank=True)
    resisted = models.BooleanField(default=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-occurred_at"]
        constraints = SyncableModel.Meta.constraints


class Replacement(OwnedModel):
    """Личные заменители — быстрый доступ в момент тяги."""

    habit = models.ForeignKey(
        Habit, null=True, blank=True, on_delete=models.CASCADE, related_name="replacements"
    )
    text = models.CharField(max_length=160)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]


class SosSession(OwnedModel):
    """Таймер на 5 минут: тяга проходит сама."""

    class Outcome(models.TextChoices):
        PASSED = "passed", "прошло"
        GAVE_IN = "gave_in", "не удержался"
        UNKNOWN = "unknown", "неизвестно"

    habit = models.ForeignKey(
        Habit, null=True, blank=True, on_delete=models.CASCADE, related_name="sos_sessions"
    )
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    outcome = models.CharField(max_length=8, choices=Outcome.choices, default=Outcome.UNKNOWN)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-started_at"]


class Challenge(OwnedModel):
    """Произвольная цель с числом и дедлайном.

    `auto_rule` задаёт критерий автозачёта из Apple Health,
    например «дистанция ≥ 4 км без остановки».
    """

    title = models.CharField(max_length=120)
    target_value = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=16, default="count")
    started_on = models.DateField()
    deadline = models.DateField(null=True, blank=True)
    auto_rule = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-started_on"]

    def __str__(self):
        return self.title

    def progress(self):
        from django.db.models import Sum

        done = self.entries.aggregate(total=Sum("value"))["total"] or 0
        return {
            "done": done,
            "target": self.target_value,
            "percent": float(done) / float(self.target_value) * 100 if self.target_value else 0,
        }


class ChallengeEntry(SyncableModel):
    challenge = models.ForeignKey(Challenge, on_delete=models.CASCADE, related_name="entries")
    date = models.DateField(db_index=True)
    value = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    source = models.CharField(max_length=10, default="manual")
    external_id = models.CharField(max_length=128, blank=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-date"]
        constraints = SyncableModel.Meta.constraints
