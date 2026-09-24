from datetime import datetime, timedelta

from django.conf import settings as django_settings
from django.utils import timezone
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.views import APIView

from apps.core.viewsets import OwnedModelViewSet, SingletonOwnedView

from . import models as m
from . import serializers as s


class NotificationSettingsView(SingletonOwnedView):
    model = m.NotificationSettings
    serializer_class = s.NotificationSettingsSerializer


class PushSubscriptionViewSet(OwnedModelViewSet):
    serializer_class = s.PushSubscriptionSerializer
    queryset = m.PushSubscription.objects.all()

    def create(self, request, *args, **kwargs):
        """Повторная подписка того же устройства не плодит записи."""
        endpoint = request.data.get("endpoint")
        existing = m.PushSubscription.objects.filter(endpoint=endpoint).first()
        if existing and existing.user_id == request.user.id:
            return Response(self.get_serializer(existing).data)
        if existing:
            existing.delete()
        return super().create(request, *args, **kwargs)


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: ScheduleView
class ScheduleView(APIView):
    """Расписание уведомлений на сегодня.

    Клиент (Service Worker) сам ставит локальные напоминания по этому списку —
    так они работают и без пуш-сервера. Не больше `max_per_day` штук,
    формулировки нейтральные: ни одного упрёка.
    """

    def get(self, request):
        settings_obj, _ = m.NotificationSettings.objects.get_or_create(user=request.user)
        user_settings = getattr(request.user, "settings", None)
        today = timezone.localdate()
        items = []

        if settings_obj.morning_weigh_in_enabled:
            items.append({
                "kind": "morning_weigh_in",
                "at": datetime.combine(today, settings_obj.morning_weigh_in_time).isoformat(),
                "title": "Доброе утро",
                "body": "Взвесишься? Это займёт пару секунд.",
                "action": {"type": "quick_weight"},
            })

        if settings_obj.bedtime_reminder_enabled and user_settings:
            bedtime = datetime.combine(today, user_settings.bedtime_goal)
            remind_at = bedtime - timedelta(minutes=settings_obj.bedtime_reminder_minutes_before)
            items.append({
                "kind": "bedtime",
                "at": remind_at.isoformat(),
                "title": "Скоро время отбоя",
                "body": (
                    f"Через {settings_obj.bedtime_reminder_minutes_before} минут — "
                    f"целевое время {user_settings.bedtime_goal.strftime('%H:%M')}."
                ),
                "action": {"type": "snooze", "minutes": 15},
            })

        if settings_obj.habit_risk_reminder_enabled:
            from apps.habits.services import craving_patterns

            patterns = craving_patterns(request.user)
            hour = patterns.get("riskiest_hour")
            if hour is not None:
                items.append({
                    "kind": "habit_risk",
                    "at": datetime.combine(today, datetime.min.time()).replace(hour=hour).isoformat(),
                    "title": "Заменители под рукой",
                    "body": "Обычно в это время бывает тяга. Она проходит сама.",
                    "action": {"type": "open_sos"},
                })

        return Response({
            "max_per_day": settings_obj.max_per_day,
            # Клиент подписывается на пуш этим ключом; пусто — пуш не настроен.
            "vapid_public_key": django_settings.VAPID_PUBLIC_KEY,
            "quiet_hours": {
                "from": settings_obj.quiet_hours_from,
                "to": settings_obj.quiet_hours_to,
            },
            "items": items[: settings_obj.max_per_day],
        })
