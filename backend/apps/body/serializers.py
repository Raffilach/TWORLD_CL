from rest_framework import serializers

from apps.core.serializers import OwnedModelSerializer

from . import models as m


class WeightEntrySerializer(OwnedModelSerializer):
    conditions_key = serializers.CharField(read_only=True)

    class Meta:
        model = m.WeightEntry
        fields = ["id", "client_id", "at", "weight_kg", "conditions", "source",
                  "note", "conditions_key"]

    def validate_weight_kg(self, value):
        if not (20 <= float(value) <= 400):
            raise serializers.ValidationError("Проверьте значение: вес вне разумного диапазона.")
        return value


class WeightTrendPointSerializer(OwnedModelSerializer):
    class Meta:
        model = m.WeightTrendPoint
        fields = ["date", "raw_kg", "trend_kg", "points_used"]


class BodyMeasurementSerializer(OwnedModelSerializer):
    site_label = serializers.CharField(source="get_site_display", read_only=True)

    class Meta:
        model = m.BodyMeasurement
        fields = ["id", "date", "site", "site_label", "value_cm", "note"]


class BodyCompositionSegmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.BodyCompositionSegment
        fields = ["id", "segment", "lean_mass_kg", "fat_mass_kg", "lean_pct_of_norm"]


class BodyCompositionScanSerializer(OwnedModelSerializer):
    segments = BodyCompositionSegmentSerializer(many=True, required=False)
    hints = serializers.SerializerMethodField()

    class Meta:
        model = m.BodyCompositionScan
        fields = [
            "id", "at", "device", "weight_kg", "body_fat_pct", "body_fat_kg",
            "skeletal_muscle_kg", "total_water_l", "intracellular_water_l",
            "extracellular_water_l", "protein_kg", "minerals_kg", "visceral_fat_level",
            "bmr_kcal", "score", "photo", "conditions_note", "segments", "hints",
        ]

    def get_hints(self, obj) -> list[str]:
        from .services import SCAN_HINTS

        return SCAN_HINTS

    def create(self, validated_data):
        segments = validated_data.pop("segments", [])
        scan = m.BodyCompositionScan.objects.create(**validated_data)
        for segment in segments:
            m.BodyCompositionSegment.objects.create(scan=scan, **segment)
        return scan

    def update(self, instance, validated_data):
        segments = validated_data.pop("segments", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if segments is not None:
            instance.segments.all().delete()
            for segment in segments:
                m.BodyCompositionSegment.objects.create(scan=instance, **segment)
        return instance


class ProgressPhotoSerializer(OwnedModelSerializer):
    class Meta:
        model = m.ProgressPhoto
        fields = ["id", "date", "pose", "photo", "outline_used", "note"]


class PhotoScheduleSerializer(OwnedModelSerializer):
    class Meta:
        model = m.PhotoSchedule
        fields = ["id", "interval_days", "next_due_on"]
