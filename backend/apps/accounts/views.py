import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db.models.functions import Lower
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from rest_framework.views import APIView

from apps.core.viewsets import OwnedModelViewSet, SingletonOwnedView

from .models import (
    ApiToken,
    FeatureInterest,
    PasswordResetToken,
    Profile,
    ShareLink,
    User,
    UserSettings,
)
from .serializers import (
    ApiTokenSerializer,
    FeatureInterestSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    ProfileSerializer,
    RegisterSerializer,
    ShareLinkSerializer,
    UserSerializer,
    UserSettingsSerializer,
)
from .validators import suggest_usernames


class RegisterView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=RegisterSerializer, responses=UserSerializer)
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"user": UserSerializer(user).data, **LoginSerializer.tokens_for(user)},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=LoginSerializer, responses=UserSerializer)
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        return Response({"user": UserSerializer(user).data, **LoginSerializer.tokens_for(user)})


@extend_schema(
    parameters=[OpenApiParameter("u", str, description="Проверяемый ник")],
    responses={200: dict},
)
@api_view(["GET"])
@permission_classes([AllowAny])
def username_available(request):
    """Проверка занятости ника в реальном времени + подсказки свободных."""
    from django.core.exceptions import ValidationError

    from .validators import validate_username

    raw = (request.query_params.get("u") or "").lstrip("@").strip()
    try:
        validate_username(raw)
    except ValidationError as exc:
        return Response({
            "username": raw,
            "valid": False,
            "available": False,
            "reason": exc.messages[0],
            "suggestions": suggest_usernames(raw, _username_taken),
        })
    taken = _username_taken(raw)
    return Response({
        "username": raw,
        "valid": True,
        "available": not taken,
        "suggestions": [] if not taken else suggest_usernames(raw, _username_taken),
    })


def _username_taken(candidate: str) -> bool:
    return User.objects.annotate(u=Lower("username")).filter(u=candidate.lower()).exists()


@extend_schema(responses=UserSerializer)  # schema: MeView
class MeView(APIView):
    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(request=UserSerializer, responses=UserSerializer)
    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ProfileView(SingletonOwnedView):
    model = Profile
    serializer_class = ProfileSerializer


class SettingsView(SingletonOwnedView):
    model = UserSettings
    serializer_class = UserSettingsSerializer


class PasswordChangeView(APIView):
    @extend_schema(request=PasswordChangeSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={202: None})
    def post(self, request):
        email = (request.data.get("email") or "").strip()
        user = User.objects.filter(email__iexact=email).first()
        if user:
            raw = secrets.token_urlsafe(32)
            PasswordResetToken.objects.create(
                user=user,
                token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                expires_at=timezone.now() + timedelta(minutes=30),
            )
            send_mail(
                "Восстановление доступа",
                f"Ссылка действует 30 минут:\n{settings.FRONTEND_URL}/reset?token={raw}",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=True,
            )
        # Ответ одинаковый независимо от наличия аккаунта — не раскрываем базу.
        return Response(status=status.HTTP_202_ACCEPTED)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        raw = request.data.get("token") or ""
        new_password = request.data.get("new_password") or ""
        if len(new_password) < 8:
            return Response({"new_password": ["Минимум 8 символов."]}, status=400)
        digest = hashlib.sha256(raw.encode()).hexdigest()
        token = PasswordResetToken.objects.filter(token_hash=digest).first()
        if token is None or not token.is_valid:
            return Response({"token": ["Ссылка недействительна."]}, status=400)
        token.user.set_password(new_password)
        token.user.save()
        token.used_at = timezone.now()
        token.save(update_fields=["used_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeleteAccountView(APIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        """Удаление аккаунта со всеми данными одной кнопкой.

        Подтверждение — ввод собственного ника, чтобы это не случилось
        случайным тапом.
        """
        confirm = (request.data.get("confirm_username") or "").lstrip("@")
        if confirm.lower() != request.user.username.lower():
            return Response(
                {"confirm_username": ["Введите свой ник для подтверждения."]}, status=400
            )
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ApiTokenViewSet(OwnedModelViewSet):
    """Токены для ИИ-интеграций. Сырое значение показывается один раз."""

    serializer_class = ApiTokenSerializer
    queryset = ApiToken.objects.all()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        raw, digest, prefix = ApiToken.generate()
        token = serializer.save(user=request.user, token_hash=digest, prefix=prefix)
        data = self.get_serializer(token).data
        data["token"] = raw
        data["warning"] = "Токен показывается один раз — сохраните его сейчас."
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        token = self.get_object()
        token.revoked_at = timezone.now()
        token.save(update_fields=["revoked_at", "updated_at"])
        return Response(self.get_serializer(token).data)


class ShareLinkViewSet(OwnedModelViewSet):
    serializer_class = ShareLinkSerializer
    queryset = ShareLink.objects.all()

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        link = self.get_object()
        link.revoked_at = timezone.now()
        link.save(update_fields=["revoked_at", "updated_at"])
        return Response(self.get_serializer(link).data)


class FeatureInterestViewSet(OwnedModelViewSet):
    """Сигнал интереса со вкладки «Друзья»."""

    serializer_class = FeatureInterestSerializer
    queryset = FeatureInterest.objects.all()
    http_method_names = ["get", "post", "delete", "head", "options"]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        feature = serializer.validated_data["feature"]
        message = serializer.validated_data.get("message", "")
        if not message:
            obj, _ = FeatureInterest.objects.get_or_create(
                user=request.user, feature=feature, message=""
            )
        else:
            obj = FeatureInterest.objects.create(
                user=request.user, feature=feature, message=message
            )
        return Response(self.get_serializer(obj).data, status=status.HTTP_201_CREATED)


class ExportView(APIView):
    """Экспорт всех своих данных в JSON или CSV (zip)."""

    @extend_schema(
        parameters=[OpenApiParameter("format", str, description="json | csv")],
        responses={200: None},
    )
    def get(self, request):
        from .export import export_csv_zip, export_json

        fmt = request.query_params.get("format", "json")
        if fmt == "csv":
            return export_csv_zip(request.user)
        return export_json(request.user)
