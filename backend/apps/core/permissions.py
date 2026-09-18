from rest_framework import permissions


class IsOwner(permissions.BasePermission):
    """Объектный уровень: доступ только к своим записям.

    Дублирует фильтрацию в `get_queryset` намеренно — защита в два слоя.
    """

    message = "Объект принадлежит другому пользователю."

    def has_object_permission(self, request, view, obj):
        owner = getattr(obj, "user", None)
        return owner is not None and owner == request.user


class TokenScopePermission(permissions.BasePermission):
    """Токены со скоупом `read` не имеют права на изменение данных."""

    message = "Токен доступен только на чтение."

    def has_permission(self, request, view):
        token = getattr(request, "api_token", None)
        if token is None:
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        return token.scope == "write"
