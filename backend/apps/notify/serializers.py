from rest_framework import serializers

from apps.core.serializers import OwnedModelSerializer

from . import models as m


class NotificationSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.NotificationSettings
        exclude = ["id", "user"]


class PushSubscriptionSerializer(OwnedModelSerializer):
    class Meta:
        model = m.PushSubscription
        fields = ["id", "endpoint", "p256dh", "auth", "user_agent", "created_at"]


class NotificationLogSerializer(OwnedModelSerializer):
    class Meta:
        model = m.NotificationLog
        fields = ["id", "kind", "scheduled_for", "sent_at", "interacted_at", "payload"]
