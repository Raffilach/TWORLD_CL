from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response

from .permissions import IsOwner, TokenScopePermission


class OwnedModelViewSet(viewsets.ModelViewSet):
    """Базовый вьюсет для пользовательских данных.

    Изоляция обеспечивается здесь, а не в сериализаторе и не в UI:
      * queryset всегда сужается до request.user;
      * user при создании берётся из запроса, тело запроса игнорируется;
      * объектное разрешение проверяется повторно.
    """

    permission_classes = [IsOwner, TokenScopePermission]
    owned = True

    def get_queryset(self):
        qs = super().get_queryset()
        if getattr(self, "swagger_fake_view", False) or not self.request.user.is_authenticated:
            return qs.none()
        qs = qs.filter(user=self.request.user)
        if hasattr(qs.model, "deleted_at") and self.request.query_params.get(
            "include_deleted"
        ) != "1":
            qs = qs.filter(deleted_at__isnull=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        """Мягкое удаление для синхронизируемых записей, жёсткое — для прочих."""
        if hasattr(instance, "deleted_at"):
            instance.deleted_at = timezone.now()
            instance.save(update_fields=["deleted_at", "updated_at"])
        else:
            instance.delete()


class ReadOnlyCatalogViewSet(viewsets.ReadOnlyModelViewSet):
    """Глобальные справочники: общие для всех, менять нельзя."""

    owned = False
    pagination_class = None


class SingletonOwnedView(viewsets.ViewSet):
    """Одна запись на пользователя (настройки, профиль)."""

    owned = True
    model = None
    serializer_class = None

    def get_object(self):
        obj, _ = self.model.objects.get_or_create(user=self.request.user)
        return obj

    def list(self, request):
        return Response(self.serializer_class(self.get_object()).data)

    def create(self, request):
        return self.partial_update(request)

    def partial_update(self, request, pk=None):
        serializer = self.serializer_class(
            self.get_object(), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
