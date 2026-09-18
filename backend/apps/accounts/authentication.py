"""Аутентификация по персональному API-токену (для ИИ-интеграций и MCP)."""
import hashlib

from django.utils import timezone
from rest_framework import authentication, exceptions

from .models import ApiToken


class ApiTokenAuthentication(authentication.BaseAuthentication):
    """`Authorization: Token twk_...`

    Скоуп проверяется отдельно (`TokenScopePermission`): токен `read`
    не может ничего изменить, даже если знает эндпоинт.
    """

    keyword = "Token"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).split()
        if not header or header[0].lower() != self.keyword.lower().encode():
            return None
        if len(header) != 2:
            raise exceptions.AuthenticationFailed("Некорректный заголовок Authorization.")

        raw = header[1].decode()
        digest = hashlib.sha256(raw.encode()).hexdigest()
        try:
            token = ApiToken.objects.select_related("user").get(token_hash=digest)
        except ApiToken.DoesNotExist:
            raise exceptions.AuthenticationFailed("Токен не найден.")
        if not token.is_valid:
            raise exceptions.AuthenticationFailed("Токен отозван или истёк.")
        if not token.user.is_active:
            raise exceptions.AuthenticationFailed("Аккаунт отключён.")

        ApiToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        request.api_token = token
        return token.user, token

    def authenticate_header(self, request):
        return self.keyword
