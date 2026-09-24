from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.viewsets import OwnedModelViewSet

from . import models as m
from . import serializers as s
from .services import auto_flag_exercises, check_recurrence, exercise_cautions


class InjuryViewSet(OwnedModelViewSet):
    serializer_class = s.InjurySerializer
    queryset = m.Injury.objects.select_related("body_part").prefetch_related(
        "logs", "exercise_flags__exercise"
    )
    filterset_fields = ["body_part", "side"]

    def perform_create(self, serializer):
        injury = serializer.save(user=self.request.user)
        auto_flag_exercises(injury)
        check_recurrence(injury)

    def create(self, request, *args, **kwargs):
        """Ответ сразу содержит затронутые упражнения и предупреждение о рецидиве."""
        response = super().create(request, *args, **kwargs)
        injury = m.Injury.objects.get(pk=response.data["id"])
        notice = m.RecurrenceNotice.objects.filter(second_injury=injury).first()
        response.data["recurrence_notice"] = (
            s.RecurrenceNoticeSerializer(notice).data if notice else None
        )
        response.data["affected_exercises"] = s.InjuryExerciseFlagSerializer(
            injury.exercise_flags.select_related("exercise"), many=True
        ).data
        return response

    @action(detail=True, methods=["post"])
    def log(self, request, pk=None):
        """Динамика по дням."""
        injury = self.get_object()
        serializer = s.InjuryLogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry, _ = m.InjuryLog.objects.update_or_create(
            injury=injury,
            date=serializer.validated_data["date"],
            defaults={
                "severity_1_10": serializer.validated_data["severity_1_10"],
                "note": serializer.validated_data.get("note", ""),
            },
        )
        return Response(s.InjuryLogSerializer(entry).data)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        injury = self.get_object()
        injury.resolved_on = request.data.get("resolved_on") or timezone.localdate()
        injury.save(update_fields=["resolved_on", "updated_at"])
        return Response(self.get_serializer(injury).data)


class WeightLimitViewSet(OwnedModelViewSet):
    serializer_class = s.WeightLimitSerializer
    queryset = m.WeightLimit.objects.select_related("exercise")
    filterset_fields = ["exercise", "is_active"]


class ReturnTestViewSet(OwnedModelViewSet):
    """Перед разблокировкой упражнения после травмы."""

    serializer_class = s.ReturnTestSerializer
    queryset = m.ReturnTest.objects.all()
    filterset_fields = ["injury", "exercise"]

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        test = m.ReturnTest.objects.get(pk=response.data["id"])
        response.data["message"] = (
            "Боли нет — упражнение снова доступно. Начни с веса меньше привычного."
            if test.unlocked
            else "Пока болит без веса — упражнение остаётся закрытым. Посмотри альтернативы."
        )
        return response


class RecurrenceNoticeViewSet(OwnedModelViewSet):
    serializer_class = s.RecurrenceNoticeSerializer
    queryset = m.RecurrenceNotice.objects.select_related("body_part")
    http_method_names = ["get", "post", "head", "options"]

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        notice = self.get_object()
        notice.acknowledged_at = timezone.now()
        notice.save(update_fields=["acknowledged_at", "updated_at"])
        return Response(self.get_serializer(notice).data)


class SafetyOverviewViewSet(OwnedModelViewSet):
    """Сводка безопасности для экрана тренировки."""

    serializer_class = s.InjurySerializer
    queryset = m.Injury.objects.none()
    http_method_names = ["get", "head", "options"]

    def list(self, request):
        from apps.training.models import Exercise

        active = m.Injury.objects.filter(
            user=request.user, resolved_on__isnull=True
        ).select_related("body_part")
        notices = m.RecurrenceNotice.objects.filter(
            user=request.user, acknowledged_at__isnull=True
        ).select_related("body_part")
        exercise_id = request.query_params.get("exercise")
        cautions = []
        if exercise_id:
            exercise = Exercise.objects.filter(pk=exercise_id).first()
            if exercise:
                cautions = exercise_cautions(request.user, exercise)
        return Response({
            "active_injuries": s.InjurySerializer(active, many=True).data,
            "recurrence_notices": s.RecurrenceNoticeSerializer(notices, many=True).data,
            "limits": s.WeightLimitSerializer(
                m.WeightLimit.objects.filter(user=request.user, is_active=True), many=True
            ).data,
            "exercise_cautions": cautions,
        })
