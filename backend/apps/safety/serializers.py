from rest_framework import serializers

from apps.core.serializers import OwnedModelSerializer

from . import models as m


class InjuryLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.InjuryLog
        fields = ["id", "injury", "date", "severity_1_10", "note"]
        extra_kwargs = {"injury": {"required": False}}


class InjuryExerciseFlagSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)

    class Meta:
        model = m.InjuryExerciseFlag
        fields = ["id", "injury", "exercise", "exercise_name", "level", "is_auto", "dismissed_at"]


class InjurySerializer(OwnedModelSerializer):
    logs = InjuryLogSerializer(many=True, read_only=True)
    exercise_flags = InjuryExerciseFlagSerializer(many=True, read_only=True)
    body_part_name = serializers.CharField(source="body_part.name_ru", read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = m.Injury
        fields = [
            "id", "body_part", "body_part_name", "side", "character", "started_on",
            "resolved_on", "initial_severity", "notes", "is_active", "logs", "exercise_flags",
        ]


class WeightLimitSerializer(OwnedModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)

    class Meta:
        model = m.WeightLimit
        fields = [
            "id", "exercise", "exercise_name", "movement_tag", "max_weight_kg",
            "reason", "is_active",
        ]

    def validate(self, attrs):
        if not attrs.get("exercise") and not attrs.get("movement_tag"):
            raise serializers.ValidationError("Укажите упражнение или тип движения.")
        if not (attrs.get("reason") or "").strip():
            raise serializers.ValidationError(
                {"reason": "Причина обязательна — без неё напоминание бесполезно."}
            )
        return attrs


class ReturnTestSerializer(OwnedModelSerializer):
    class Meta:
        model = m.ReturnTest
        fields = [
            "id", "injury", "exercise", "date", "pain_without_weight",
            "answer_note", "unlocked",
        ]
        read_only_fields = ["unlocked"]


class RecurrenceNoticeSerializer(OwnedModelSerializer):
    body_part_name = serializers.CharField(source="body_part.name_ru", read_only=True)
    message = serializers.SerializerMethodField()

    class Meta:
        model = m.RecurrenceNotice
        fields = [
            "id", "body_part", "body_part_name", "first_injury", "second_injury",
            "days_between", "acknowledged_at", "message",
        ]

    def get_message(self, obj) -> str:
        return (
            f"Это второй эпизод в зоне «{obj.body_part.name_ru}» за {obj.days_between} дней. "
            "Повторяющаяся травма в одном месте — повод показаться врачу, "
            "а не переждать."
        )


class WeightLimitOverrideSerializer(OwnedModelSerializer):
    class Meta:
        model = m.WeightLimitOverride
        fields = ["id", "limit", "set_log", "entered_weight_kg", "created_at"]
