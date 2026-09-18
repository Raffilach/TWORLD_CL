"""Экспорт всех данных пользователя.

Обходит все модели, у которых есть поле `user`, — новые таблицы
попадают в экспорт автоматически, без правки этого файла.
"""
import csv
import io
import json
import zipfile
from datetime import date, datetime
from decimal import Decimal

from django.apps import apps
from django.db.models import FileField, ForeignKey
from django.http import HttpResponse, JsonResponse

OWN_APPS = {
    "accounts", "training", "safety", "recovery", "nutrition", "body",
    "habits", "journal", "analytics", "reports", "aicontext", "notify",
}
SKIP_MODELS = {"accounts.PasswordResetToken", "accounts.ApiToken", "sync.SyncOperation"}
SENSITIVE_FIELDS = {"password", "token_hash", "diary_pin_hash", "p256dh", "auth"}


def _serialize(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def user_models():
    for model in apps.get_models():
        label = f"{model._meta.app_label}.{model.__name__}"
        if model._meta.app_label not in OWN_APPS or label in SKIP_MODELS:
            continue
        field_names = {f.name for f in model._meta.get_fields()}
        if "user" in field_names:
            yield model


def _rows(model, user):
    fields = [
        f for f in model._meta.fields
        if f.name not in SENSITIVE_FIELDS and f.name != "user"
    ]
    for obj in model.objects.filter(user=user).iterator():
        row = {}
        for field in fields:
            if isinstance(field, FileField):
                file = getattr(obj, field.name)
                row[field.name] = file.name if file else None
            elif isinstance(field, ForeignKey):
                row[field.name] = _serialize(getattr(obj, f"{field.name}_id"))
            else:
                row[field.name] = _serialize(getattr(obj, field.name))
        yield row


def collect(user) -> dict:
    data = {
        "exported_at": datetime.now().isoformat(),
        "user": {
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "phone": user.phone,
            "date_joined": user.date_joined.isoformat(),
        },
        "tables": {},
    }
    for model in user_models():
        label = f"{model._meta.app_label}.{model._meta.model_name}"
        rows = list(_rows(model, user))
        if rows:
            data["tables"][label] = rows
    return data


def export_json(user) -> JsonResponse:
    response = JsonResponse(collect(user), json_dumps_params={"ensure_ascii": False, "indent": 2})
    response["Content-Disposition"] = f'attachment; filename="tworld-{user.username}.json"'
    return response


def export_csv_zip(user) -> HttpResponse:
    payload = collect(user)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "profile.json", json.dumps(payload["user"], ensure_ascii=False, indent=2)
        )
        for label, rows in payload["tables"].items():
            out = io.StringIO()
            writer = csv.DictWriter(out, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
            archive.writestr(f"{label.replace('.', '_')}.csv", out.getvalue())
    response = HttpResponse(buffer.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="tworld-{user.username}-csv.zip"'
    return response
