from rest_framework import permissions


class IsOwner(permissions.BasePermission):
    """Объектный уровень: доступ только к своим записям.

    Дублирует фильтрацию в `get_queryset` намеренно — защита в два слоя.
    """

    message = "Объект принадлежит другому пользователю."

    def has_object_permission(self, request, view, obj):
        owner = getattr(obj, "user", None)
        return owner is not None and owner == request.user


class IsOwnerOrGlobalReadOnly(permissions.BasePermission):
    """Для таблиц с общей частью: библиотека упражнений, база продуктов.

    Записи без владельца (owner=NULL) доступны всем — это общий сид.
    Изменение таких записей блокируется во вьюсете отдельно, с понятным
    сообщением «скопируйте в свои, чтобы изменить».
    """

    message = "Объект принадлежит другому пользователю."

    def has_object_permission(self, request, view, obj):
        owner_id = getattr(obj, "owner_id", None)
        if owner_id is None and hasattr(obj, "user_id"):
            owner_id = obj.user_id
        if owner_id is None:
            return True
        return owner_id == request.user.id


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
