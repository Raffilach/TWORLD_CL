from rest_framework import serializers

from apps.core.serializers import OwnedModelSerializer

from . import models as m


class SleepEntrySerializer(OwnedModelSerializer):
    duration_label = serializers.SerializerMethodField()

    class Meta:
        model = m.SleepEntry
        fields = [
            "id", "client_id", "night_of", "bed_time", "wake_time", "duration_minutes",
            "duration_label", "quality_1_5", "awakenings", "source", "note",
        ]
        read_only_fields = ["duration_label"]

    def get_duration_label(self, obj) -> str | None:
        if obj.duration_minutes is None:
            return None
        return f"{obj.duration_minutes // 60} ч {obj.duration_minutes % 60:02d} мин"

    def validate(self, attrs):
        bed = attrs.get("bed_time") or getattr(self.instance, "bed_time", None)
        wake = attrs.get("wake_time") or getattr(self.instance, "wake_time", None)
        if bed and wake and wake <= bed:
            raise serializers.ValidationError(
                "Подъём должен быть позже отбоя — проверьте дату перехода через полночь."
            )
        if bed and wake and (wake - bed).total_seconds() > 20 * 3600:
            raise serializers.ValidationError("Больше 20 часов сна — похоже на опечатку в дате.")
        return attrs


class HealthMetricSerializer(OwnedModelSerializer):
    class Meta:
        model = m.HealthMetric
        fields = ["id", "date", "kind", "value", "source", "external_id", "payload"]


class IllnessPeriodSerializer(OwnedModelSerializer):
    class Meta:
        model = m.IllnessPeriod
        fields = ["id", "date_from", "date_to", "label", "note"]


class HealthImportSerializer(OwnedModelSerializer):
    class Meta:
        model = m.HealthImport
        fields = ["id", "source", "records_created", "records_skipped", "status", "error", "created_at"]
