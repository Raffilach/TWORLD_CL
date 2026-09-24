"""Базовые модели.

`OwnedModel` — единственный разрешённый способ хранить пользовательские данные.
Он гарантирует наличие `user` и каскадное удаление при удалении аккаунта.
`SyncableModel` добавляет поля, без которых невозможна оффлайн-синхронизация.
"""
import uuid

from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        abstract = True


class OwnedQuerySet(models.QuerySet):
    def owned_by(self, user):
        return self.filter(user=user)

    def alive(self):
        if "deleted_at" in {f.name for f in self.model._meta.get_fields()}:
            return self.filter(deleted_at__isnull=True)
        return self


class OwnedModel(TimeStampedModel):
    """Данные, принадлежащие одному пользователю. Удаление аккаунта удаляет всё."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="%(class)ss"
    )

    objects = OwnedQuerySet.as_manager()

    class Meta:
        abstract = True


class SyncableModel(OwnedModel):
    """Оффлайн-синхронизируемая запись.

    `client_id` генерируется на устройстве до отправки — повторная отправка
    той же записи при обрыве связи не создаёт дубль.
    `deleted_at` — мягкое удаление: без него удалённая оффлайн запись
    воскреснет при следующем pull.
    """

    client_id = models.UUIDField(default=uuid.uuid4, editable=False)
    client_updated_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        abstract = True
        constraints = [
            models.UniqueConstraint(
                fields=["user", "client_id"], name="%(app_label)s_%(class)s_client_uniq"
            )
        ]

    def soft_delete(self):
        from django.utils import timezone

        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at", "updated_at"])
