from rest_framework import serializers

from .models import (
    BodyPart,
    CravingTrigger,
    Equipment,
    FailReason,
    HealthTimelineItem,
    MovementTag,
    Muscle,
)


class MuscleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Muscle
        fields = "__all__"


class EquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Equipment
        fields = "__all__"


class BodyPartSerializer(serializers.ModelSerializer):
    class Meta:
        model = BodyPart
        fields = "__all__"


class MovementTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = MovementTag
        fields = "__all__"


class FailReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = FailReason
        fields = "__all__"


class HealthTimelineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthTimelineItem
        fields = "__all__"


class CravingTriggerSerializer(serializers.ModelSerializer):
    class Meta:
        model = CravingTrigger
        fields = "__all__"
