"""Оффлайн-синхронизация."""
from django.db import models

from apps.core.models import OwnedModel


class SyncOperation(OwnedModel):
    """Журнал применённых операций.

    Повторная отправка той же операции после обрыва связи не применяется
    дважды — идемпотентность по `op_id`.
    """

    op_id = models.UUIDField()
    entity = models.CharField(max_length=60)
    client_id = models.UUIDField(null=True, blank=True)
    op = models.CharField(max_length=10, default="upsert")
    result = models.JSONField(default=dict, blank=True)
    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-applied_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "op_id"], name="sync_operation_uniq")
        ]
