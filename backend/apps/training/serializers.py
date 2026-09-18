from rest_framework import serializers

from apps.core.serializers import OwnedModelSerializer

from . import models as m


class ExerciseMuscleSerializer(serializers.ModelSerializer):
    muscle_name = serializers.CharField(source="muscle.name_ru", read_only=True)
    muscle_group = serializers.CharField(source="muscle.group", read_only=True)

    class Meta:
        model = m.ExerciseMuscle
        fields = ["muscle", "muscle_name", "muscle_group", "role"]


class ExerciseAlternativeSerializer(serializers.ModelSerializer):
    alternative_name = serializers.CharField(source="alternative.name", read_only=True)

    class Meta:
        model = m.ExerciseAlternative
        fields = ["id", "exercise", "alternative", "alternative_name", "order", "note"]


class ExerciseSerializer(serializers.ModelSerializer):
    muscle_links = ExerciseMuscleSerializer(many=True, read_only=True)
    alternatives = ExerciseAlternativeSerializer(many=True, read_only=True)
    is_global = serializers.BooleanField(read_only=True)
    equipment_name = serializers.CharField(source="equipment.name_ru", read_only=True)

    class Meta:
        model = m.Exercise
        fields = [
            "id", "name", "aliases", "load_type", "equipment", "equipment_name",
            "is_unilateral", "bodyweight_factor", "default_rest_seconds",
            "movement_tags", "instructions", "video_url", "is_archived",
            "is_global", "muscle_links", "alternatives",
        ]
        read_only_fields = ["is_global"]


class GymSerializer(OwnedModelSerializer):
    class Meta:
        model = m.Gym
        fields = ["id", "name", "kind", "is_default", "notes", "created_at"]


class GymExerciseProfileSerializer(OwnedModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)
    gym_name = serializers.CharField(source="gym.name", read_only=True)

    class Meta:
        model = m.GymExerciseProfile
        fields = [
            "id", "gym", "gym_name", "exercise", "exercise_name", "weight_steps",
            "step_kg", "last_weight_kg", "last_reps", "last_duration_seconds",
            "machine_number", "seat_settings", "grip", "notes", "photo",
        ]

    def validate_weight_steps(self, value):
        """Фактическая сетка тренажёра: 36.2 / 40.8 / 45.3 …"""
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Ожидается список весов.")
        try:
            steps = sorted({round(float(v), 2) for v in value})
        except (TypeError, ValueError):
            raise serializers.ValidationError("Все значения должны быть числами.")
        if any(step < 0 for step in steps):
            raise serializers.ValidationError("Вес не может быть отрицательным.")
        return steps


class TemplateExerciseSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)
    load_type = serializers.CharField(source="exercise.load_type", read_only=True)

    class Meta:
        model = m.TemplateExercise
        fields = [
            "id", "block", "exercise", "exercise_name", "load_type", "order",
            "target_sets", "target_reps_min", "target_reps_max", "target_seconds",
            "target_weight_kg", "rest_seconds", "notes",
        ]
        extra_kwargs = {"block": {"required": False}}


class TemplateBlockSerializer(serializers.ModelSerializer):
    exercises = TemplateExerciseSerializer(many=True, read_only=True)
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)

    class Meta:
        model = m.TemplateBlock
        fields = ["id", "template", "name", "priority", "priority_label", "order", "exercises"]
        extra_kwargs = {"template": {"required": False}}


class TemplateScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.TemplateSchedule
        fields = ["id", "template", "weekday", "is_auto_repeating", "start_date"]
        extra_kwargs = {"template": {"required": False}}


class WorkoutTemplateSerializer(OwnedModelSerializer):
    blocks = TemplateBlockSerializer(many=True, read_only=True)
    schedules = TemplateScheduleSerializer(many=True, read_only=True)
    estimated_minutes = serializers.SerializerMethodField()
    over_limit = serializers.SerializerMethodField()

    class Meta:
        model = m.WorkoutTemplate
        fields = [
            "id", "name", "description", "duration_limit_minutes", "is_active",
            "blocks", "schedules", "estimated_minutes", "over_limit",
        ]

    def get_estimated_minutes(self, obj):
        return obj.estimated_minutes()

    def get_over_limit(self, obj):
        """Мягкое предупреждение: прикидка длительности против лимита."""
        if not obj.duration_limit_minutes:
            return False
        return obj.estimated_minutes() > obj.duration_limit_minutes


class PlannedExclusionSerializer(OwnedModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)

    class Meta:
        model = m.PlannedExclusion
        fields = ["id", "exercise", "exercise_name", "template", "date_from", "date_to", "reason"]


class SetLogSerializer(OwnedModelSerializer):
    tonnage = serializers.SerializerMethodField()
    duration_label = serializers.SerializerMethodField()

    class Meta:
        model = m.SetLog
        fields = [
            "id", "client_id", "session_exercise", "set_number", "is_warmup",
            "weight_kg", "weight_is_per_side", "reps", "duration_seconds",
            "duration_label", "distance_m", "rir", "completed_at", "notes", "tonnage",
        ]
        read_only_fields = ["tonnage", "duration_label"]

    def get_tonnage(self, obj):
        return obj.tonnage()

    def get_duration_label(self, obj):
        """85 → «1:25». Хранится всё равно целым числом секунд."""
        from apps.core.units import seconds_to_label

        return seconds_to_label(obj.duration_seconds) if obj.duration_seconds else None

    def validate_duration_seconds(self, value):
        if value is None:
            return value
        if value > 24 * 3600:
            raise serializers.ValidationError(
                "Длительность указывается в секундах. 1:15:37 — это не время суток."
            )
        return value

    def validate(self, attrs):
        session_exercise = attrs.get("session_exercise") or getattr(
            self.instance, "session_exercise", None
        )
        if session_exercise and "weight_is_per_side" not in attrs and self.instance is None:
            attrs["weight_is_per_side"] = session_exercise.exercise.is_unilateral
        return attrs


class SessionExerciseSerializer(OwnedModelSerializer):
    sets = SetLogSerializer(many=True, read_only=True)
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)
    load_type = serializers.CharField(source="exercise.load_type", read_only=True)
    is_unilateral = serializers.BooleanField(source="exercise.is_unilateral", read_only=True)
    counts_against_discipline = serializers.BooleanField(read_only=True)
    fail_reason_code = serializers.CharField(source="fail_reason.code", read_only=True)

    class Meta:
        model = m.SessionExercise
        fields = [
            "id", "client_id", "session", "exercise", "exercise_name", "load_type",
            "is_unilateral", "template_exercise", "block_priority", "order", "status",
            "fail_reason", "fail_reason_code", "fail_reason_note", "substituted_for",
            "notes", "sets", "counts_against_discipline",
        ]


class WorkoutSessionSerializer(OwnedModelSerializer):
    exercises = SessionExerciseSerializer(many=True, read_only=True)
    completion = serializers.SerializerMethodField()
    template_name = serializers.CharField(source="template.name", read_only=True)
    gym_name = serializers.CharField(source="gym.name", read_only=True)

    class Meta:
        model = m.WorkoutSession
        fields = [
            "id", "client_id", "gym", "gym_name", "template", "template_name", "date",
            "started_at", "ended_at", "duration_seconds", "status", "wellbeing_1_10",
            "notes", "is_training_while_injured", "tonnage_kg", "working_sets_count",
            "exercises", "completion",
        ]
        read_only_fields = ["tonnage_kg", "working_sets_count", "duration_seconds"]

    def get_completion(self, obj):
        from .services import session_completion

        return session_completion(obj)


class WorkoutSessionListSerializer(OwnedModelSerializer):
    template_name = serializers.CharField(source="template.name", read_only=True)

    class Meta:
        model = m.WorkoutSession
        fields = [
            "id", "date", "template", "template_name", "status", "duration_seconds",
            "tonnage_kg", "working_sets_count", "wellbeing_1_10", "is_training_while_injured",
        ]


class PersonalRecordSerializer(OwnedModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = m.PersonalRecord
        fields = ["id", "exercise", "exercise_name", "kind", "kind_label", "value", "achieved_on"]


class ProgressionSuggestionSerializer(OwnedModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)

    class Meta:
        model = m.ProgressionSuggestion
        fields = [
            "id", "exercise", "exercise_name", "gym", "kind", "suggested_weight_kg",
            "message", "payload", "created_on", "dismissed_at", "applied_at",
        ]
