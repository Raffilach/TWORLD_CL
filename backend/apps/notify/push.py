"""Отправка web-push.

Работает, если заданы ключи VAPID (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`).
Без них модуль не падает, а сообщает, что отправка не настроена: приложение
и без уведомлений остаётся полностью рабочим.

Ключи генерируются один раз:
    python manage.py generate_vapid_keys
"""
import json
import logging

from django.conf import settings

from .models import NotificationLog, PushSubscription

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(getattr(settings, "VAPID_PRIVATE_KEY", "") and getattr(settings, "VAPID_PUBLIC_KEY", ""))


def send_to_user(user, payload: dict) -> int:
    """Отправляет уведомление на все устройства пользователя.

    Возвращает число успешных отправок. Умершие подписки удаляются:
    накапливать их бессмысленно, браузер их уже забыл.
    """
    if not is_configured():
        logger.info("VAPID не настроен — уведомление не отправлено: %s", payload.get("title"))
        return 0

    from pywebpush import WebPushException, webpush

    sent = 0
    for subscription in PushSubscription.objects.filter(user=user):
        try:
            webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                },
                data=json.dumps(payload, ensure_ascii=False),
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{settings.VAPID_CONTACT_EMAIL}"},
                ttl=3600,
            )
            sent += 1
            from django.utils import timezone

            PushSubscription.objects.filter(pk=subscription.pk).update(
                last_success_at=timezone.now(), failure_count=0
            )
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in {404, 410}:
                subscription.delete()  # подписка мертва
            else:
                PushSubscription.objects.filter(pk=subscription.pk).update(
                    failure_count=subscription.failure_count + 1
                )
                logger.warning("Push не доставлен: %s", exc)
    if sent:
        NotificationLog.objects.filter(
            user=user, kind=payload.get("kind", ""), sent_at__isnull=True
        ).update(sent_at=__import__("django.utils.timezone", fromlist=["timezone"]).timezone.now())
    return sent
