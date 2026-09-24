from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.viewsets import OwnedModelViewSet

from . import models as m
from . import serializers as s
from .services import craving_patterns, habit_stats, health_timeline


class HabitViewSet(OwnedModelViewSet):
    """Срыв не стирает историю: «дней с решения» и «текущая серия» — разные числа."""

    serializer_class = s.HabitSerializer
    queryset = m.Habit.objects.prefetch_related("episodes")
    filterset_fields = ["kind", "is_active"]

    @action(detail=True, methods=["post"], url_path="episode")
    def episode(self, request, pk=None):
        """Отметка срыва.

        Без осуждающих формулировок: спрашиваем «что случилось», чтобы
        данные пополняли карту триггеров. Можно задним числом.
        """
        habit = self.get_object()
        occurred_at = request.data.get("occurred_at") or timezone.now()
        episode = m.HabitEpisode.objects.create(
            user=request.user,
            habit=habit,
            occurred_at=occurred_at,
            amount=request.data.get("amount", ""),
            trigger_id=request.data.get("trigger"),
            note=request.data.get("note", ""),
        )
        return Response({
            "episode": s.HabitEpisodeSerializer(episode).data,
            "stats": habit_stats(habit),
            "message": (
                "Отмечено. Накопленные "
                f"{habit_stats(habit)['total_clean_days']} чистых дней остаются с тобой."
            ),
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def timeline(self, request, pk=None):
        """Точки срывов + таймлайн улучшений здоровья."""
        habit = self.get_object()
        episodes = habit.episodes.filter(deleted_at__isnull=True).order_by("occurred_at")
        return Response({
            "decision_date": habit.decision_date,
            "stats": habit_stats(habit),
            "episodes": s.HabitEpisodeSerializer(episodes, many=True).data,
            "health_timeline": health_timeline(habit),
        })


class HabitEpisodeViewSet(OwnedModelViewSet):
    serializer_class = s.HabitEpisodeSerializer
    queryset = m.HabitEpisode.objects.select_related("trigger")
    filterset_fields = ["habit"]


class HabitCheckinViewSet(OwnedModelViewSet):
    """Полезные привычки — в том же интерфейсе."""

    serializer_class = s.HabitCheckinSerializer
    queryset = m.HabitCheckin.objects.all()
    filterset_fields = ["habit", "date"]

    @action(detail=False, methods=["post"])
    def toggle(self, request):
        habit = m.Habit.objects.filter(user=request.user, pk=request.data.get("habit")).first()
        if habit is None:
            return Response({"habit": ["Не найдено."]}, status=400)
        date = request.data.get("date") or timezone.localdate()
        checkin, created = m.HabitCheckin.objects.get_or_create(
            user=request.user, habit=habit, date=date, defaults={"done": True}
        )
        if not created:
            checkin.done = not checkin.done
            checkin.save(update_fields=["done", "updated_at"])
        return Response(s.HabitCheckinSerializer(checkin).data)


class CravingLogViewSet(OwnedModelViewSet):
    serializer_class = s.CravingLogSerializer
    queryset = m.CravingLog.objects.select_related("trigger")
    filterset_fields = ["habit", "resisted"]

    @action(detail=False, methods=["get"])
    def patterns(self, request):
        """Карта триггеров: время суток, день недели, что помогает."""
        return Response(craving_patterns(request.user))


class ReplacementViewSet(OwnedModelViewSet):
    serializer_class = s.ReplacementSerializer
    queryset = m.Replacement.objects.all()
    filterset_fields = ["habit"]


class SosSessionViewSet(OwnedModelViewSet):
    """Кнопка SOS: 5 минут и список заменителей."""

    serializer_class = s.SosSessionSerializer
    queryset = m.SosSession.objects.all()

    def create(self, request, *args, **kwargs):
        habit_id = request.data.get("habit")
        session = m.SosSession.objects.create(
            user=request.user,
            habit_id=habit_id if habit_id else None,
            started_at=timezone.now(),
        )
        replacements = m.Replacement.objects.filter(user=request.user)
        if habit_id:
            replacements = replacements.filter(habit_id=habit_id) | replacements.filter(
                habit__isnull=True
            )
        return Response({
            "session": s.SosSessionSerializer(session).data,
            "duration_seconds": 300,
            "message": "Тяга проходит сама. Обычно ей хватает пяти минут.",
            "replacements": s.ReplacementSerializer(replacements.distinct(), many=True).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def finish(self, request, pk=None):
        session = self.get_object()
        session.ended_at = timezone.now()
        session.outcome = request.data.get("outcome", m.SosSession.Outcome.UNKNOWN)
        session.note = request.data.get("note", "")
        session.save()
        return Response(self.get_serializer(session).data)


class ChallengeViewSet(OwnedModelViewSet):
    serializer_class = s.ChallengeSerializer
    queryset = m.Challenge.objects.prefetch_related("entries")
    filterset_fields = ["is_active"]

    @action(detail=True, methods=["post"], url_path="entry")
    def entry(self, request, pk=None):
        challenge = self.get_object()
        entry = m.ChallengeEntry.objects.create(
            user=request.user,
            challenge=challenge,
            date=request.data.get("date") or timezone.localdate(),
            value=request.data.get("value", 1),
            note=request.data.get("note", ""),
        )
        return Response({
            "entry": s.ChallengeEntrySerializer(entry).data,
            "progress": challenge.progress(),
        }, status=status.HTTP_201_CREATED)


class ChallengeEntryViewSet(OwnedModelViewSet):
    serializer_class = s.ChallengeEntrySerializer
    queryset = m.ChallengeEntry.objects.all()
    filterset_fields = ["challenge", "date"]
