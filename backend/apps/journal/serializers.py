from rest_framework import serializers

from apps.core.serializers import OwnedModelSerializer

from . import models as m


class TagSerializer(OwnedModelSerializer):
    class Meta:
        model = m.Tag
        fields = ["id", "name"]


class QuickAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.QuickAnswer
        fields = ["id", "question", "text"]


class VoiceNoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.VoiceNote
        fields = ["id", "audio", "duration_seconds", "transcript", "status"]
        read_only_fields = ["transcript", "status"]


class JournalEntrySerializer(OwnedModelSerializer):
    answers = QuickAnswerSerializer(many=True, required=False)
    voice_notes = VoiceNoteSerializer(many=True, read_only=True)

    class Meta:
        model = m.JournalEntry
        fields = [
            "id", "client_id", "date", "at", "text", "photo", "tags",
            "is_locked", "answers", "voice_notes",
        ]

    def create(self, validated_data):
        answers = validated_data.pop("answers", [])
        tags = validated_data.pop("tags", [])
        entry = m.JournalEntry.objects.create(**validated_data)
        entry.tags.set(tags)
        for answer in answers:
            m.QuickAnswer.objects.create(entry=entry, **answer)
        return entry

    def update(self, instance, validated_data):
        answers = validated_data.pop("answers", None)
        tags = validated_data.pop("tags", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if tags is not None:
            instance.tags.set(tags)
        if answers is not None:
            instance.answers.all().delete()
            for answer in answers:
                m.QuickAnswer.objects.create(entry=instance, **answer)
        return instance


class LifeEventSerializer(OwnedModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = m.LifeEvent
        fields = ["id", "date_from", "date_to", "kind", "kind_label", "title",
                  "note", "show_on_charts"]


class DailyLogSerializer(OwnedModelSerializer):
    class Meta:
        model = m.DailyLog
        fields = ["id", "client_id", "date", "mood_1_5", "energy_1_5", "note"]
