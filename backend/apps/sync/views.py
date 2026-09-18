"""Оффлайн-синхронизация.

Клиент пишет в IndexedDB и отправляет накопленные операции, когда появится
сеть. Идемпотентность по `op_id`: повтор после обрыва связи безопасен.
"""
from django.apps import apps as django_apps
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SyncOperation

# Белый список: синхронизировать можно только эти сущности.
SYNCABLE = {
    "workout_session": ("training", "WorkoutSession"),
    "session_exercise": ("training", "SessionExercise"),
    "set_log": ("training", "SetLog"),
    "weight_entry": ("body", "WeightEntry"),
    "sleep_entry": ("recovery", "SleepEntry"),
    "meal_entry": ("nutrition", "MealEntry"),
    "water_log": ("nutrition", "WaterLog"),
    "supplement_log": ("nutrition", "SupplementLog"),
    "diet_exception": ("nutrition", "DietExceptionLog"),
    "habit_episode": ("habits", "HabitEpisode"),
    "habit_checkin": ("habits", "HabitCheckin"),
    "craving_log": ("habits", "CravingLog"),
    "challenge_entry": ("habits", "ChallengeEntry"),
    "journal_entry": ("journal", "JournalEntry"),
    "daily_log": ("journal", "DailyLog"),
}

# Поля, которые клиент задавать не может ни при каких условиях.
PROTECTED_FIELDS = {"user", "user_id", "id", "pk", "created_at", "updated_at"}


def _model(entity: str):
    app_label, model_name = SYNCABLE[entity]
    return django_apps.get_model(app_label, model_name)


class SyncPullView(APIView):
    """Все изменения пользователя после метки, включая тумбстоуны удалений."""

    @extend_schema(
        parameters=[OpenApiParameter("since", str), OpenApiParameter("entities", str)],
        responses={200: OpenApiTypes.OBJECT},
    )
    def get(self, request):
        since = parse_datetime(request.query_params.get("since", "") or "")
        requested = request.query_params.get("entities")
        entities = (
            [name for name in requested.split(",") if name in SYNCABLE]
            if requested else list(SYNCABLE)
        )
        now = timezone.now()
        payload = {}
        for entity in entities:
            model = _model(entity)
            qs = model.objects.filter(user=request.user)
            if since:
                qs = qs.filter(updated_at__gt=since)
            payload[entity] = [_serialize(obj) for obj in qs.order_by("updated_at")[:2000]]
        return Response({"server_time": now, "since": since, "changes": payload})


class SyncPushView(APIView):
    """Приём пачки операций с устройства."""

    @extend_schema(request=None, responses={200: dict})
    def post(self, request):
        operations = request.data.get("operations", [])
        if not isinstance(operations, list):
            return Response({"operations": ["Ожидается список."]}, status=400)
        results = []
        for operation in operations[:500]:
            results.append(self._apply(request.user, operation))
        return Response({"server_time": timezone.now(), "results": results})

    def _apply(self, user, operation: dict) -> dict:
        op_id = operation.get("op_id")
        entity = operation.get("entity")
        if not op_id or entity not in SYNCABLE:
            return {"op_id": op_id, "status": "rejected", "detail": "Неизвестная сущность."}

        existing = SyncOperation.objects.filter(user=user, op_id=op_id).first()
        if existing:
            # Повторная отправка после обрыва связи — не применяем дважды.
            # Прошлый результат отдаётся как есть, но статус — duplicate.
            return {**existing.result, "op_id": op_id, "status": "duplicate",
                    "original_status": existing.result.get("status")}

        model = _model(entity)
        client_id = operation.get("client_id")
        payload = {
            key: value for key, value in (operation.get("payload") or {}).items()
            if key not in PROTECTED_FIELDS
        }
        client_updated_at = parse_datetime(str(operation.get("client_updated_at") or "")) or timezone.now()

        try:
            with transaction.atomic():
                if operation.get("op") == "delete":
                    instance = model.objects.filter(user=user, client_id=client_id).first()
                    if instance:
                        instance.deleted_at = timezone.now()
                        instance.save(update_fields=["deleted_at", "updated_at"])
                    result = {"status": "deleted", "client_id": client_id}
                else:
                    instance = model.objects.filter(user=user, client_id=client_id).first()
                    if instance is None:
                        instance = model(user=user, client_id=client_id)
                    elif instance.client_updated_at and instance.client_updated_at > client_updated_at:
                        # На сервере более свежая правка — приходящую не применяем.
                        result = {"status": "stale", "client_id": client_id,
                                  "server_state": _serialize(instance)}
                        SyncOperation.objects.create(
                            user=user, op_id=op_id, entity=entity,
                            client_id=client_id, op="upsert", result=result,
                        )
                        return {"op_id": op_id, **result}
                    for key, value in payload.items():
                        if hasattr(instance, key):
                            setattr(instance, key, value)
                    instance.client_updated_at = client_updated_at
                    instance.full_clean(exclude=["user"], validate_unique=False)
                    instance.save()
                    result = {"status": "applied", "client_id": client_id,
                              "server_state": _serialize(instance)}
                SyncOperation.objects.create(
                    user=user, op_id=op_id, entity=entity, client_id=client_id,
                    op=operation.get("op", "upsert"), result=result,
                )
        except Exception as exc:  # noqa: BLE001 — ответ клиенту важнее трассировки
            return {"op_id": op_id, "status": "error", "detail": str(exc)}
        return {"op_id": op_id, **result}


def _json_safe(value):
    """Ответ уходит и в JSON-поле журнала операций, и клиенту."""
    from datetime import date, datetime
    from decimal import Decimal
    from uuid import UUID

    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    return value


def _serialize(obj) -> dict:
    from django.db.models import FileField, ForeignKey

    data = {}
    for field in obj._meta.fields:
        if field.name == "user":
            continue
        if isinstance(field, FileField):
            file = getattr(obj, field.name)
            data[field.name] = file.name if file else None
        elif isinstance(field, ForeignKey):
            data[field.name] = _json_safe(getattr(obj, f"{field.name}_id"))
        else:
            data[field.name] = _json_safe(getattr(obj, field.name))
    return data
