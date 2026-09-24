from datetime import timedelta

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from rest_framework.views import APIView

from apps.core.viewsets import OwnedModelViewSet

from . import models as m
from . import serializers as s
from .services import (
    bedtime_hits,
    evening_plan,
    short_sleep_warning,
    sleep_debt,
    sleep_vs_wellbeing,
)


def _range(request, default_days: int = 30):
    today = timezone.localdate()
    date_from = request.query_params.get("from")
    date_to = request.query_params.get("to")
    start = date_from or (today - timedelta(days=default_days)).isoformat()
    return start, (date_to or today.isoformat())


class SleepEntryViewSet(OwnedModelViewSet):
    """Отбой и подъём вводятся как время, а не галочкой «лёг вовремя»."""

    serializer_class = s.SleepEntrySerializer
    queryset = m.SleepEntry.objects.all()
    filterset_fields = ["night_of", "source"]

    def perform_create(self, serializer):
        """Ручной ввод имеет приоритет: он правит импорт, а не дублирует его."""
        serializer.save(user=self.request.user, source=serializer.validated_data.get(
            "source", m.SleepEntry.Source.MANUAL
        ))

    @extend_schema(parameters=[OpenApiParameter("from", str), OpenApiParameter("to", str)])
    @action(detail=False, methods=["get"])
    def stats(self, request):
        start, end = _range(request)
        return Response({
            "debt": sleep_debt(request.user, start, end),
            "bedtime": bedtime_hits(request.user, start, end),
            "warning": short_sleep_warning(request.user),
            "vs_wellbeing": sleep_vs_wellbeing(request.user, start, end),
        })


class HealthMetricViewSet(OwnedModelViewSet):
    serializer_class = s.HealthMetricSerializer
    queryset = m.HealthMetric.objects.all()
    filterset_fields = ["kind", "date", "source"]


class IllnessPeriodViewSet(OwnedModelViewSet):
    """Дни болезни исключаются из статистики дисциплины."""

    serializer_class = s.IllnessPeriodSerializer
    queryset = m.IllnessPeriod.objects.all()


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: EveningPlanView
class EveningPlanView(APIView):
    """«Во сколько выйти из зала, чтобы лечь вовремя»."""

    def get(self, request):
        return Response(evening_plan(request.user))
