import secrets
import uuid
from datetime import time

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.models import OwnedModel, TimeStampedModel

from .validators import validate_username


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, username, email, phone, password, **extra):
        if not username:
            raise ValueError("Нужен ник.")
        if not email and not phone:
            raise ValueError("Нужен email или телефон.")
        user = self.model(
            username=username,
            email=self.normalize_email(email) if email else None,
            phone=phone or None,
            **extra,
        )
        user.set_password(password)
        user.full_clean(exclude=["password"])
        user.save(using=self._db)
        return user

    def create_user(self, username, email=None, phone=None, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create(username, email, phone, password, **extra)

    def create_superuser(self, username, email=None, phone=None, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self._create(username, email, phone, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """Аккаунт.

    Вход по email **или** телефону (хотя бы одно обязательно на уровне БД).
    Ник — публичный идентификатор, уникален регистронезависимо.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(
        "ник", max_length=32, unique=True, validators=[validate_username]
    )
    email = models.EmailField("email", unique=True, null=True, blank=True)
    phone = models.CharField("телефон", max_length=20, unique=True, null=True, blank=True)
    display_name = models.CharField("отображаемое имя", max_length=80, blank=True)
    apple_sub = models.CharField(max_length=255, unique=True, null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("username"), name="user_username_ci_uniq"),
            models.CheckConstraint(
                condition=models.Q(email__isnull=False) | models.Q(phone__isnull=False),
                name="user_email_or_phone_required",
            ),
        ]

    def __str__(self):
        return f"@{self.username}"

    @property
    def handle(self) -> str:
        return f"@{self.username}"

    def save(self, *args, **kwargs):
        if not self.display_name:
            self.display_name = self.username
        super().save(*args, **kwargs)

    @property
    def initials(self) -> str:
        """Заглушка аватара считается из инициалов — файл не создаётся."""
        parts = [p for p in (self.display_name or self.username).split() if p]
        if not parts:
            return "?"
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[1][0]).upper()


class Profile(models.Model):
    class Sex(models.TextChoices):
        MALE = "male", "мужской"
        FEMALE = "female", "женский"
        OTHER = "other", "другой"
        UNSPECIFIED = "unspecified", "не указан"

    class UnitSystem(models.TextChoices):
        METRIC = "metric", "метрическая"
        IMPERIAL = "imperial", "имперская"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    sex = models.CharField(max_length=12, choices=Sex.choices, default=Sex.UNSPECIFIED)
    birth_date = models.DateField(null=True, blank=True)
    height_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    start_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    timezone = models.CharField(max_length=64, default="Europe/Moscow")
    unit_system = models.CharField(
        max_length=10, choices=UnitSystem.choices, default=UnitSystem.METRIC
    )
    language = models.CharField(max_length=5, choices=[("ru", "ru"), ("en", "en")], default="ru")
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    avatar_seed = models.CharField(max_length=16, blank=True)

    goal_weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    goal_bodyfat_pct = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    goal_deadline = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"профиль {self.user.username}"

    def save(self, *args, **kwargs):
        if not self.avatar_seed:
            self.avatar_seed = secrets.token_hex(4)
        super().save(*args, **kwargs)


DEFAULT_TODAY_BLOCKS = [
    {"block_id": "weight", "visible": True},
    {"block_id": "workout", "visible": True},
    {"block_id": "quick_checks", "visible": True},
    {"block_id": "habits", "visible": True},
    {"block_id": "sleep", "visible": True},
    {"block_id": "mood_energy", "visible": True},
    {"block_id": "evening_plan", "visible": True},
    {"block_id": "day_progress", "visible": True},
    {"block_id": "journal_quick", "visible": False},
    {"block_id": "measurements_due", "visible": False},
    {"block_id": "photo_due", "visible": False},
]

DEFAULT_REST_PRESETS = [
    {"label": "изоляция", "seconds": 60},
    {"label": "изоляция+", "seconds": 90},
    {"label": "тяги и жимы", "seconds": 120},
    {"label": "тяжёлое", "seconds": 180},
]


def default_today_blocks():
    return [dict(item, order=index) for index, item in enumerate(DEFAULT_TODAY_BLOCKS)]


def default_rest_presets():
    return [dict(item) for item in DEFAULT_REST_PRESETS]


class UserSettings(TimeStampedModel):
    """Все пользовательские настройки в одном месте.

    Умолчания подобраны по принципу «минимум обязательного ввода»:
    калории выключены, RIR не спрашивается, уведомлений не больше двух.
    """

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="settings")

    today_blocks = models.JSONField(default=default_today_blocks)

    # питание
    protein_target_g = models.PositiveIntegerField(default=150)
    track_calories = models.BooleanField(default=False)  # намеренно выключено
    calorie_target = models.PositiveIntegerField(null=True, blank=True)
    water_target_ml = models.PositiveIntegerField(default=2000)
    water_glass_ml = models.PositiveIntegerField(default=250)
    free_meal_weekday = models.PositiveSmallIntegerField(null=True, blank=True)

    # сон и вечер
    bedtime_goal = models.TimeField(default=time(23, 30))
    wake_goal = models.TimeField(default=time(7, 0))
    sleep_target_minutes = models.PositiveIntegerField(default=480)
    commute_home_minutes = models.PositiveIntegerField(default=60)
    wind_down_minutes = models.PositiveIntegerField(default=60)

    # тренировки
    default_gym = models.ForeignKey(
        "training.Gym", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    rest_default_seconds = models.PositiveIntegerField(default=90)
    rest_presets = models.JSONField(default=default_rest_presets)
    ask_rir = models.BooleanField(default=True)
    count_bodyweight_in_tonnage = models.BooleanField(default=False)
    fail_reason_overrides = models.JSONField(
        default=dict,
        help_text="Переопределение того, какие причины «не смог» влияют на дисциплину.",
    )

    # дневник
    diary_lock_enabled = models.BooleanField(default=False)
    diary_pin_hash = models.CharField(max_length=128, blank=True)
    diary_biometric = models.BooleanField(default=False)

    week_starts_on = models.PositiveSmallIntegerField(default=1)
    theme = models.CharField(
        max_length=8,
        choices=[("auto", "auto"), ("light", "light"), ("dark", "dark")],
        default="auto",
    )

    def __str__(self):
        return f"настройки {self.user.username}"

    def leave_gym_by(self):
        """Во сколько выйти из зала, чтобы лечь вовремя (раздел 6)."""
        from datetime import datetime, timedelta

        goal = self.bedtime_goal
        if isinstance(goal, str):
            from django.utils.dateparse import parse_time

            goal = parse_time(goal)
        base = datetime.combine(timezone.now().date(), goal)
        return (base - timedelta(minutes=self.commute_home_minutes + self.wind_down_minutes)).time()


class ApiToken(OwnedModel):
    """Токен для ИИ-интеграций. Хранится только хэш — сам токен показывается один раз."""

    class Scope(models.TextChoices):
        READ = "read", "только чтение"
        WRITE = "write", "чтение и запись"

    name = models.CharField(max_length=80)
    token_hash = models.CharField(max_length=64, unique=True)
    prefix = models.CharField(max_length=12)
    scope = models.CharField(max_length=5, choices=Scope.choices, default=Scope.READ)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.scope})"

    @property
    def is_valid(self) -> bool:
        if self.revoked_at:
            return False
        return not (self.expires_at and self.expires_at < timezone.now())

    @staticmethod
    def generate() -> tuple[str, str, str]:
        """Возвращает (raw_token, token_hash, prefix)."""
        import hashlib

        raw = "twk_" + secrets.token_urlsafe(32)
        return raw, hashlib.sha256(raw.encode()).hexdigest(), raw[:12]


class ShareLink(OwnedModel):
    """Публичная ссылка только на чтение, с возможностью отозвать."""

    class Kind(models.TextChoices):
        WEEKLY_REPORT = "weekly_report", "недельный отчёт"
        WORKOUT = "workout", "тренировка"
        CONTEXT = "context", "контекст для ИИ"

    slug = models.CharField(max_length=32, unique=True, db_index=True)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    object_id = models.CharField(max_length=64, blank=True)
    period_from = models.DateField(null=True, blank=True)
    period_to = models.DateField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    view_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = secrets.token_urlsafe(16)[:22]
        super().save(*args, **kwargs)

    @property
    def is_active(self) -> bool:
        if self.revoked_at:
            return False
        return not (self.expires_at and self.expires_at < timezone.now())

    def __str__(self):
        return f"/s/{self.slug}"


class FeatureInterest(OwnedModel):
    """Сигнал интереса к ещё не сделанной функции (вкладка «Друзья»).

    Таблица из задания: user_id, feature, timestamp (+ свободное предложение).
    """

    feature = models.CharField(max_length=64, db_index=True)
    message = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "feature"],
                condition=models.Q(message=""),
                name="feature_interest_unique_subscription",
            )
        ]

    def __str__(self):
        return f"{self.user.username} → {self.feature}"


class PasswordResetToken(OwnedModel):
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_valid(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()
