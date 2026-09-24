"""Тренировки: библиотека, залы, шаблоны, сессии, подходы, прогрессия."""
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import OwnedModel, SyncableModel, TimeStampedModel


class LoadType(models.TextChoices):
    WEIGHT_REPS = "weight_reps", "вес × повторы"
    TIME = "time", "время"
    BODYWEIGHT_REPS = "bodyweight_reps", "повторы без веса"
    DISTANCE = "distance", "дистанция"


class Exercise(TimeStampedModel):
    """Упражнение. `owner=NULL` — предзаполненная база, иначе своё."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="exercises",
    )
    name = models.CharField(max_length=120)
    aliases = models.JSONField(default=list, blank=True)
    load_type = models.CharField(
        max_length=20, choices=LoadType.choices, default=LoadType.WEIGHT_REPS
    )
    equipment = models.ForeignKey(
        "catalog.Equipment", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="exercises",
    )
    muscles = models.ManyToManyField(
        "catalog.Muscle", through="ExerciseMuscle", related_name="exercises"
    )
    movement_tags = models.ManyToManyField(
        "catalog.MovementTag", blank=True, related_name="exercises"
    )

    is_unilateral = models.BooleanField(
        default=False,
        help_text="Вес указывается на одну сторону. Без этого флага тоннаж "
                  "считается вдвое меньше реального (молотки «16 кг на руку»).",
    )
    bodyweight_factor = models.DecimalField(
        max_digits=3, decimal_places=2, null=True, blank=True,
        help_text="Доля веса тела для подтягиваний/отжиманий.",
    )
    default_rest_seconds = models.PositiveIntegerField(default=90)
    instructions = models.TextField(blank=True)
    video_url = models.URLField(blank=True)
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "name"], name="exercise_owner_name_uniq"
            )
        ]
        indexes = [models.Index(fields=["owner", "is_archived"])]

    def __str__(self):
        return self.name

    @property
    def is_global(self) -> bool:
        return self.owner_id is None

    @property
    def tracks_weight(self) -> bool:
        return self.load_type == LoadType.WEIGHT_REPS

    @property
    def tracks_duration(self) -> bool:
        return self.load_type == LoadType.TIME


class ExerciseMuscle(models.Model):
    class Role(models.TextChoices):
        PRIMARY = "primary", "первичная"
        SECONDARY = "secondary", "вторичная"

    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="muscle_links")
    muscle = models.ForeignKey("catalog.Muscle", on_delete=models.CASCADE)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.PRIMARY)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["exercise", "muscle"], name="exercise_muscle_uniq")
        ]


class ExerciseAlternative(models.Model):
    """Что делать, если тренажёр занят. Задаётся заранее, а не в панике в зале."""

    exercise = models.ForeignKey(
        Exercise, on_delete=models.CASCADE, related_name="alternatives"
    )
    alternative = models.ForeignKey(
        Exercise, on_delete=models.CASCADE, related_name="alternative_for"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
        related_name="exercise_alternatives",
    )
    order = models.PositiveSmallIntegerField(default=0)
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["order"]
        constraints = [
            models.UniqueConstraint(
                fields=["exercise", "alternative", "owner"], name="exercise_alt_uniq"
            ),
            models.CheckConstraint(
                condition=~Q(exercise=models.F("alternative")),
                name="exercise_alt_not_self",
            ),
        ]


class Gym(OwnedModel):
    """Профиль зала. Один тренажёр в разных залах даёт разные цифры."""

    class Kind(models.TextChoices):
        WORK = "work", "рабочий"
        HOME = "home", "домашний"
        TRAVEL = "travel", "в поездке"
        OTHER = "other", "другой"

    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.WORK)
    is_default = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-is_default", "name"]
        constraints = [
            models.UniqueConstraint(fields=["user", "name"], name="gym_user_name_uniq")
        ]

    def __str__(self):
        return self.name


class GymExerciseProfile(OwnedModel):
    """Настройки упражнения в конкретном зале.

    `weight_steps` — фактическая сетка тренажёра, например
    [36.2, 40.8, 45.3, 49.8, 54.4, 58.9]. Кнопки +/- ходят по этому массиву,
    а не прибавляют условные 2,5 кг.
    """

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name="exercise_profiles")
    exercise = models.ForeignKey(
        Exercise, on_delete=models.CASCADE, related_name="gym_profiles"
    )
    weight_steps = models.JSONField(default=list, blank=True)
    step_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    last_weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    last_reps = models.PositiveSmallIntegerField(null=True, blank=True)
    last_duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    machine_number = models.CharField(max_length=20, blank=True)
    seat_settings = models.CharField(max_length=120, blank=True)
    grip = models.CharField(max_length=80, blank=True)
    notes = models.TextField(blank=True)
    photo = models.ImageField(upload_to="gym_setups/", null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "gym", "exercise"], name="gym_exercise_profile_uniq"
            )
        ]

    def __str__(self):
        return f"{self.exercise} @ {self.gym}"

    def next_step(self, current: Decimal | float | None, direction: int = 1):
        """Следующее значение по фактической сетке этого тренажёра."""
        steps = sorted(Decimal(str(s)) for s in (self.weight_steps or []))
        if not steps:
            step = self.step_kg or Decimal("2.5")
            base = Decimal(str(current or 0))
            return max(Decimal("0"), base + step * direction)
        if current is None:
            return steps[0]
        current = Decimal(str(current))
        if direction > 0:
            higher = [s for s in steps if s > current]
            return higher[0] if higher else steps[-1]
        lower = [s for s in steps if s < current]
        return lower[-1] if lower else steps[0]


class BlockPriority(models.TextChoices):
    REQUIRED = "required", "обязательный"
    MAIN = "main", "основной"
    OPTIONAL = "optional", "по остатку сил"


class WorkoutTemplate(OwnedModel):
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    duration_limit_minutes = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    def estimated_minutes(self, seconds_per_set: int = 45) -> int:
        """Прикидка по числу подходов и времени отдыха."""
        total = 0
        for block in self.blocks.all():
            for item in block.exercises.all():
                rest = item.rest_seconds or item.exercise.default_rest_seconds
                total += item.target_sets * (seconds_per_set + rest)
        return round(total / 60)


class TemplateBlock(models.Model):
    """Блок с приоритетом.

    Если сделан только `required`, день считается выполненным,
    а не проваленным — это резко снижает вероятность бросить.
    """

    template = models.ForeignKey(
        WorkoutTemplate, on_delete=models.CASCADE, related_name="blocks"
    )
    name = models.CharField(max_length=60, blank=True)
    priority = models.CharField(
        max_length=10, choices=BlockPriority.choices, default=BlockPriority.MAIN
    )
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.name or self.get_priority_display()


class TemplateExercise(models.Model):
    """Порядок важен: упражнение в конце списка пропускается чаще."""

    block = models.ForeignKey(TemplateBlock, on_delete=models.CASCADE, related_name="exercises")
    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="+")
    order = models.PositiveSmallIntegerField(default=0)
    target_sets = models.PositiveSmallIntegerField(default=3)
    target_reps_min = models.PositiveSmallIntegerField(null=True, blank=True)
    target_reps_max = models.PositiveSmallIntegerField(null=True, blank=True)
    target_seconds = models.PositiveIntegerField(null=True, blank=True)
    target_weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    rest_seconds = models.PositiveIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.exercise} ×{self.target_sets}"


class TemplateSchedule(models.Model):
    template = models.ForeignKey(
        WorkoutTemplate, on_delete=models.CASCADE, related_name="schedules"
    )
    weekday = models.PositiveSmallIntegerField()  # 0=пн
    is_auto_repeating = models.BooleanField(default=True)
    start_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["weekday"]
        constraints = [
            models.UniqueConstraint(
                fields=["template", "weekday"], name="template_schedule_uniq"
            )
        ]


class PlannedExclusion(OwnedModel):
    """«Сегодня НЕ делаем» — сознательное решение, а не забывчивость."""

    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="exclusions")
    template = models.ForeignKey(
        WorkoutTemplate, null=True, blank=True, on_delete=models.CASCADE,
        related_name="exclusions",
    )
    date_from = models.DateField()
    date_to = models.DateField(null=True, blank=True)
    reason = models.CharField(max_length=200)

    class Meta:
        ordering = ["-date_from"]

    def __str__(self):
        return f"не делаем {self.exercise}: {self.reason}"


class WorkoutSession(SyncableModel):
    """Тренировка.

    Обрати внимание: статуса «провалено» нет by design.
    «Выполнено» определяется закрытием обязательного блока.
    """

    class Status(models.TextChoices):
        PLANNED = "planned", "запланирована"
        IN_PROGRESS = "in_progress", "идёт"
        COMPLETED = "completed", "завершена"
        ABANDONED = "abandoned", "прервана"

    gym = models.ForeignKey(Gym, null=True, blank=True, on_delete=models.SET_NULL, related_name="sessions")
    template = models.ForeignKey(
        WorkoutTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name="sessions"
    )
    date = models.DateField(db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PLANNED)
    wellbeing_1_10 = models.PositiveSmallIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)
    is_training_while_injured = models.BooleanField(default=False)

    tonnage_kg = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    working_sets_count = models.PositiveSmallIntegerField(default=0)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-date", "-started_at"]
        indexes = [models.Index(fields=["user", "date"])]
        constraints = SyncableModel.Meta.constraints

    def __str__(self):
        return f"{self.date} {self.template or 'без плана'}"

    def recalculate(self, save: bool = True):
        """Пересчёт тоннажа. Разминочные подходы не входят в рабочий объём."""
        tonnage = Decimal("0")
        working = 0
        for set_log in SetLog.objects.filter(
            session_exercise__session=self, is_warmup=False, deleted_at__isnull=True
        ):
            working += 1
            tonnage += set_log.tonnage()
        self.tonnage_kg = tonnage
        self.working_sets_count = working
        if self.started_at and self.ended_at:
            self.duration_seconds = int((self.ended_at - self.started_at).total_seconds())
        if save:
            self.save(update_fields=["tonnage_kg", "working_sets_count", "duration_seconds", "updated_at"])
        return self

    @property
    def required_done(self) -> bool:
        """День засчитан, если закрыт обязательный блок."""
        required = self.exercises.filter(block_priority=BlockPriority.REQUIRED)
        if not required.exists():
            return self.exercises.filter(status=SessionExercise.Status.DONE).exists()
        return not required.exclude(status=SessionExercise.Status.DONE).exists()


class SessionExercise(SyncableModel):
    """Упражнение в тренировке. Три состояния, не два."""

    class Status(models.TextChoices):
        PENDING = "pending", "не начато"
        DONE = "done", "сделано"
        SKIPPED = "skipped", "пропущено"
        FAILED = "failed", "не смог"

    session = models.ForeignKey(
        WorkoutSession, on_delete=models.CASCADE, related_name="exercises"
    )
    exercise = models.ForeignKey(Exercise, on_delete=models.PROTECT, related_name="session_entries")
    template_exercise = models.ForeignKey(
        TemplateExercise, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    block_priority = models.CharField(
        max_length=10, choices=BlockPriority.choices, default=BlockPriority.MAIN
    )
    order = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    fail_reason = models.ForeignKey(
        "catalog.FailReason", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    fail_reason_note = models.CharField(max_length=200, blank=True)
    substituted_for = models.ForeignKey(
        Exercise, null=True, blank=True, on_delete=models.SET_NULL, related_name="substitutions"
    )
    notes = models.TextField(blank=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["order"]
        constraints = SyncableModel.Meta.constraints

    def __str__(self):
        return f"{self.exercise} — {self.get_status_display()}"

    @property
    def counts_against_discipline(self) -> bool:
        """Пропуск по внешней причине не портит статистику дисциплины."""
        if self.status != self.Status.FAILED:
            return False
        if self.fail_reason is None:
            return True
        overrides = getattr(self.session.user, "settings", None)
        if overrides and isinstance(overrides.fail_reason_overrides, dict):
            override = overrides.fail_reason_overrides.get(self.fail_reason.code)
            if override is not None:
                return bool(override)
        return self.fail_reason.counts_against_discipline


class SetLog(SyncableModel):
    """Подход. Он же — отдельная попытка статики.

    `duration_seconds` — **целое число секунд**. В схеме намеренно нет
    TimeField/DurationField: «1:15:37» сюда физически не записать.
    """

    session_exercise = models.ForeignKey(
        SessionExercise, on_delete=models.CASCADE, related_name="sets"
    )
    set_number = models.PositiveSmallIntegerField(default=1)
    is_warmup = models.BooleanField(default=False)
    weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    weight_is_per_side = models.BooleanField(
        default=False,
        help_text="Снапшот флага «одностороннее» на момент записи — "
                  "изменение упражнения потом не ломает историю.",
    )
    reps = models.PositiveSmallIntegerField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    distance_m = models.PositiveIntegerField(null=True, blank=True)
    rir = models.PositiveSmallIntegerField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    notes = models.CharField(max_length=200, blank=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["set_number", "id"]
        constraints = SyncableModel.Meta.constraints + [
            models.CheckConstraint(
                condition=Q(rir__isnull=True) | Q(rir__lte=10), name="setlog_rir_range"
            ),
        ]

    def __str__(self):
        if self.duration_seconds is not None:
            return f"{self.duration_seconds} с"
        return f"{self.weight_kg or 0} × {self.reps or 0}"

    def tonnage(self) -> Decimal:
        """Разминочные не считаются; односторонние считаются ×2."""
        if self.is_warmup or self.weight_kg is None or self.reps is None:
            return Decimal("0")
        multiplier = Decimal("2") if self.weight_is_per_side else Decimal("1")
        return Decimal(self.weight_kg) * Decimal(self.reps) * multiplier

    def estimated_1rm(self) -> Decimal | None:
        """Эпли. Всегда помечается в интерфейсе как оценка."""
        if self.weight_kg is None or not self.reps:
            return None
        return Decimal(self.weight_kg) * (Decimal(1) + Decimal(self.reps) / Decimal(30))


class PersonalRecord(OwnedModel):
    class Kind(models.TextChoices):
        MAX_WEIGHT = "max_weight", "максимальный вес"
        MAX_REPS = "max_reps", "максимум повторов"
        MAX_DURATION = "max_duration_seconds", "максимальное удержание"
        EST_1RM = "est_1rm", "расчётный 1ПМ"
        MAX_SET_VOLUME = "max_set_volume", "максимальный объём подхода"

    exercise = models.ForeignKey(Exercise, on_delete=models.CASCADE, related_name="records")
    kind = models.CharField(max_length=24, choices=Kind.choices)
    value = models.DecimalField(max_digits=9, decimal_places=2)
    achieved_on = models.DateField()
    set_log = models.ForeignKey(SetLog, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    gym = models.ForeignKey(Gym, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-achieved_on"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "exercise", "kind"], name="personal_record_uniq"
            )
        ]

    def __str__(self):
        return f"{self.exercise} {self.get_kind_display()} = {self.value}"


class ProgressionSuggestion(OwnedModel):
    """Подсказки автопрогрессии и предупреждения безопасности."""

    class Kind(models.TextChoices):
        INCREASE = "increase", "можно прибавить"
        STALL = "stall", "застой"
        DELOAD = "deload", "пора разгрузиться"
        SPIKE = "spike_warning", "резкий скачок"
        IMBALANCE = "imbalance", "дисбаланс объёма"
        ORDER_HINT = "order_hint", "переставить выше"

    exercise = models.ForeignKey(
        Exercise, null=True, blank=True, on_delete=models.CASCADE, related_name="suggestions"
    )
    gym = models.ForeignKey(Gym, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    suggested_weight_kg = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    message = models.CharField(max_length=300)
    payload = models.JSONField(default=dict, blank=True)
    created_on = models.DateField(auto_now_add=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_on"]
        indexes = [models.Index(fields=["user", "kind", "created_on"])]

    def __str__(self):
        return self.message
