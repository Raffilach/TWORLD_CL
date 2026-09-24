from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.viewsets import OwnedModelViewSet

from . import models as m
from . import serializers as s


class TagViewSet(OwnedModelViewSet):
    serializer_class = s.TagSerializer
    queryset = m.Tag.objects.all()


class JournalEntryViewSet(OwnedModelViewSet):
    """Свободная запись без обязательных полей."""

    serializer_class = s.JournalEntrySerializer
    queryset = m.JournalEntry.objects.prefetch_related("tags", "answers", "voice_notes")
    filterset_fields = ["date", "is_locked"]
    search_fields = ["text"]

    @action(detail=True, methods=["post"], url_path="voice")
    def voice(self, request, pk=None):
        entry = self.get_object()
        serializer = s.VoiceNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.save(entry=entry)
        return Response(s.VoiceNoteSerializer(note).data, status=201)


class LifeEventViewSet(OwnedModelViewSet):
    """Метки значимых событий — вертикальные линии на всех графиках."""

    serializer_class = s.LifeEventSerializer
    queryset = m.LifeEvent.objects.all()
    filterset_fields = ["kind", "show_on_charts"]


class DailyLogViewSet(OwnedModelViewSet):
    """Настроение и энергия: две шкалы 1–5, по тапу."""

    serializer_class = s.DailyLogSerializer
    queryset = m.DailyLog.objects.all()
    filterset_fields = ["date"]

    @action(detail=False, methods=["post"])
    def set(self, request):
        """Один тап = одно значение. Без формы и кнопки «Сохранить»."""
        date = request.data.get("date") or timezone.localdate()
        log, _ = m.DailyLog.objects.get_or_create(user=request.user, date=date)
        for field in ("mood_1_5", "energy_1_5", "note"):
            if field in request.data:
                setattr(log, field, request.data[field])
        log.save()
        return Response(s.DailyLogSerializer(log).data)
