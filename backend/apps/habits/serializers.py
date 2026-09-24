from rest_framework import serializers

from apps.core.serializers import OwnedModelSerializer

from . import models as m


class HabitEpisodeSerializer(OwnedModelSerializer):
    trigger_name = serializers.CharField(source="trigger.name_ru", read_only=True)

    class Meta:
        model = m.HabitEpisode
        fields = ["id", "client_id", "habit", "occurred_at", "amount", "trigger",
                  "trigger_name", "note"]


class HabitSerializer(OwnedModelSerializer):
    stats = serializers.SerializerMethodField()

    class Meta:
        model = m.Habit
        fields = [
            "id", "name", "kind", "decision_date", "timeline_kind", "unit",
            "target_per_week", "money_per_day", "icon_token", "order", "is_active", "stats",
        ]

    def get_stats(self, obj) -> dict:
        from .services import habit_stats

        return habit_stats(obj)


class HabitCheckinSerializer(OwnedModelSerializer):
    class Meta:
        model = m.HabitCheckin
        fields = ["id", "client_id", "habit", "date", "done", "value", "note"]


class CravingLogSerializer(OwnedModelSerializer):
    trigger_name = serializers.CharField(source="trigger.name_ru", read_only=True)

    class Meta:
        model = m.CravingLog
        fields = [
            "id", "client_id", "habit", "occurred_at", "intensity_1_10", "trigger",
            "trigger_name", "place", "what_helped", "resisted",
        ]


class ReplacementSerializer(OwnedModelSerializer):
    class Meta:
        model = m.Replacement
        fields = ["id", "habit", "text", "order"]


class SosSessionSerializer(OwnedModelSerializer):
    class Meta:
        model = m.SosSession
        fields = ["id", "habit", "started_at", "ended_at", "outcome", "note"]


class ChallengeEntrySerializer(OwnedModelSerializer):
    class Meta:
        model = m.ChallengeEntry
        fields = ["id", "client_id", "challenge", "date", "value", "source",
                  "external_id", "note"]


class ChallengeSerializer(OwnedModelSerializer):
    progress = serializers.SerializerMethodField()

    class Meta:
        model = m.Challenge
        fields = [
            "id", "title", "target_value", "unit", "started_on", "deadline",
            "auto_rule", "is_active", "progress",
        ]

    def get_progress(self, obj) -> dict:
        return obj.progress()
