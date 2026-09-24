"""Уведомления: не больше двух в день, все формулировки нейтральные."""
from datetime import time

from django.db import models

from apps.core.models import OwnedModel


class NotificationSettings(models.Model):
    from django.conf import settings as _settings

    user = models.OneToOneField(
        _settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_settings"
    )
    max_per_day = models.PositiveSmallIntegerField(default=2)
    push_enabled = models.BooleanField(default=False)

    morning_weigh_in_enabled = models.BooleanField(default=True)
    morning_weigh_in_time = models.TimeField(default=time(8, 30))

    bedtime_reminder_enabled = models.BooleanField(default=True)
    bedtime_reminder_minutes_before = models.PositiveSmallIntegerField(default=30)

    habit_risk_reminder_enabled = models.BooleanField(default=False)

    quiet_hours_from = models.TimeField(default=time(23, 0))
    quiet_hours_to = models.TimeField(default=time(8, 0))

    def __str__(self):
        return f"уведомления {self.user.username}"


class PushSubscription(OwnedModel):
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    user_agent = models.CharField(max_length=300, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    failure_count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]


class NotificationLog(OwnedModel):
    kind = models.CharField(max_length=40)
    scheduled_for = models.DateTimeField()
    sent_at = models.DateTimeField(null=True, blank=True)
    interacted_at = models.DateTimeField(null=True, blank=True)
    payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-scheduled_for"]
        indexes = [models.Index(fields=["user", "scheduled_for"])]
