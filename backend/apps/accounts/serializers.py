from django.contrib.auth import authenticate
from django.db.models.functions import Lower
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from django.conf import settings as django_settings
from django.db import transaction

from .models import (
    ApiToken,
    FeatureInterest,
    InviteCode,
    InviteRedemption,
    Profile,
    ShareLink,
    User,
    UserSettings,
)
from .validators import validate_username


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        exclude = ["id", "user"]


class UserSettingsSerializer(serializers.ModelSerializer):
    leave_gym_by = serializers.SerializerMethodField()

    class Meta:
        model = UserSettings
        exclude = ["id", "user", "diary_pin_hash"]
        read_only_fields = ["created_at", "updated_at"]

    def get_leave_gym_by(self, obj) -> str:
        """Во сколько выйти из зала, чтобы лечь вовремя."""
        return obj.leave_gym_by().strftime("%H:%M")


class UserSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer(read_only=True)
    handle = serializers.CharField(read_only=True)
    initials = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "handle", "email", "phone", "display_name",
            "initials", "date_joined", "profile", "is_staff",
        ]
        read_only_fields = ["id", "date_joined", "username", "is_staff"]


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(validators=[validate_username])
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8)
    display_name = serializers.CharField(required=False, allow_blank=True)
    invite_code = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs):
        if not attrs.get("email") and not attrs.get("phone"):
            raise serializers.ValidationError("Нужен email или телефон.")
        raw_code = attrs.get("invite_code") or ""
        if django_settings.REGISTRATION_INVITE_ONLY or raw_code:
            invite = InviteCode.objects.filter(code=InviteCode.normalize(raw_code)).first()
            if invite is None or not invite.is_usable:
                raise serializers.ValidationError(
                    {"invite_code": "Код приглашения не подошёл или уже использован."}
                )
            attrs["invite"] = invite
        if User.objects.annotate(u=Lower("username")).filter(
            u=attrs["username"].lower()
        ).exists():
            raise serializers.ValidationError({"username": "Ник занят."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        invite = validated_data.get("invite")
        if invite is not None:
            # Блокировка строки: два человека с одним одноразовым кодом
            # не должны зарегистрироваться оба.
            invite = InviteCode.objects.select_for_update().get(pk=invite.pk)
            if not invite.is_usable:
                raise serializers.ValidationError(
                    {"invite_code": "Код приглашения уже использован."}
                )
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email") or None,
            phone=validated_data.get("phone") or None,
            password=validated_data["password"],
            display_name=validated_data.get("display_name", ""),
        )
        Profile.objects.create(user=user)
        UserSettings.objects.create(user=user)
        from apps.notify.models import NotificationSettings

        NotificationSettings.objects.create(user=user)
        if invite is not None:
            invite.used_count += 1
            invite.save(update_fields=["used_count", "updated_at"])
            InviteRedemption.objects.create(invite=invite, user=user)
        return user


class LoginSerializer(serializers.Serializer):
    """Вход по нику, email или телефону — одним полем."""

    login = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        login = attrs["login"].lstrip("@")
        candidates = User.objects.annotate(u=Lower("username")).filter(u=login.lower())
        user = candidates.first()
        if user is None:
            user = User.objects.filter(email__iexact=login).first()
        if user is None:
            user = User.objects.filter(phone=login).first()
        if user is None or not user.check_password(attrs["password"]):
            raise serializers.ValidationError("Неверный логин или пароль.")
        if not user.is_active:
            raise serializers.ValidationError("Аккаунт отключён.")
        attrs["user"] = user
        return attrs

    @staticmethod
    def tokens_for(user):
        refresh = RefreshToken.for_user(user)
        return {"access": str(refresh.access_token), "refresh": str(refresh)}


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Текущий пароль неверен.")
        return value


class ApiTokenSerializer(serializers.ModelSerializer):
    token = serializers.CharField(read_only=True)
    is_valid = serializers.BooleanField(read_only=True)

    class Meta:
        model = ApiToken
        fields = ["id", "name", "scope", "prefix", "created_at", "last_used_at",
                  "expires_at", "revoked_at", "token", "is_valid"]
        read_only_fields = ["prefix", "created_at", "last_used_at", "revoked_at"]


class ShareLinkSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = ShareLink
        fields = ["id", "slug", "kind", "object_id", "period_from", "period_to",
                  "expires_at", "revoked_at", "view_count", "url", "is_active"]
        read_only_fields = ["slug", "view_count", "revoked_at"]

    def get_url(self, obj) -> str:
        request = self.context.get("request")
        path = f"/s/{obj.slug}"
        return request.build_absolute_uri(path) if request else path


class FeatureInterestSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeatureInterest
        fields = ["id", "feature", "message", "created_at"]
        read_only_fields = ["created_at"]


class OnboardingSerializer(serializers.Serializer):
    """Ответы стартового опроса. Обязательна только цель — остальное по желанию."""

    goal = serializers.ChoiceField(choices=["lose", "gain", "maintain", "health"])
    sex = serializers.ChoiceField(
        choices=["male", "female", "other", "unspecified"], required=False
    )
    birth_date = serializers.DateField(required=False, allow_null=True)
    height_cm = serializers.DecimalField(
        max_digits=5, decimal_places=1, min_value=100, max_value=250, required=False, allow_null=True
    )
    weight_kg = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=30, max_value=300, required=False, allow_null=True
    )
    goal_weight_kg = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=30, max_value=300, required=False, allow_null=True
    )
    place = serializers.ChoiceField(choices=["gym", "home"], required=False)
    experience = serializers.ChoiceField(
        choices=["beginner", "intermediate", "advanced"], required=False
    )
    training_days = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), required=False, max_length=7
    )
    session_minutes = serializers.ChoiceField(choices=[30, 45, 60, 75, 90], required=False)
    quit_habits = serializers.ListField(child=serializers.CharField(max_length=40), required=False)
    build_habits = serializers.ListField(child=serializers.CharField(max_length=40), required=False)
    supplements = serializers.ListField(child=serializers.CharField(max_length=40), required=False)
    custom_supplements = serializers.ListField(
        child=serializers.CharField(max_length=80), required=False, max_length=10
    )
    bedtime = serializers.TimeField(required=False, allow_null=True, format="%H:%M")
    wake_time = serializers.TimeField(required=False, allow_null=True, format="%H:%M")
    commute_minutes = serializers.IntegerField(min_value=0, max_value=240, required=False)


class InviteCodeSerializer(serializers.ModelSerializer):
    uses_left = serializers.IntegerField(read_only=True)
    is_usable = serializers.BooleanField(read_only=True)
    redeemed_by = serializers.SerializerMethodField()

    class Meta:
        model = InviteCode
        fields = [
            "id", "code", "note", "max_uses", "used_count", "uses_left", "is_usable",
            "expires_at", "is_active", "created_at", "redeemed_by",
        ]
        read_only_fields = ["code", "used_count", "created_at"]

    def get_redeemed_by(self, obj) -> list[str]:
        return [f"@{item.user.username}" for item in obj.redemptions.select_related("user")]
