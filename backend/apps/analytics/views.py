from datetime import date, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from rest_framework.views import APIView

from apps.core.viewsets import OwnedModelViewSet

from . import models as m
from . import serializers as s
from .services import (
    compare_periods,
    correlations,
    forecast_to_date,
    heatmap,
    weak_link,
    week_bounds,
    week_metrics,
    what_worked,
)


def _period(request, default_days=90):
    today = timezone.localdate()
    date_from = parse_date(request.query_params.get("from", "")) or today - timedelta(days=default_days)
    date_to = parse_date(request.query_params.get("to", "")) or today
    return date_from, date_to


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: CorrelationsView
class CorrelationsView(APIView):
    """Сон ↔ самочувствие, сон ↔ вес, сладкое ↔ вес, тренировки ↔ настроение."""

    @extend_schema(parameters=[OpenApiParameter("from", str), OpenApiParameter("to", str)])
    def get(self, request):
        date_from, date_to = _period(request)
        return Response({
            "period": {"from": date_from, "to": date_to},
            "correlations": correlations(request.user, date_from, date_to),
        })


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: WeakLinkView
class WeakLinkView(APIView):
    """Одна метрика и один фокус на следующую неделю."""

    def get(self, request):
        today = timezone.localdate()
        start, end = week_bounds(today)
        return Response({
            "week": {"from": start, "to": end},
            "weak_link": weak_link(request.user, start, end),
            "what_worked": what_worked(request.user, start, end),
            "metrics": week_metrics(request.user, start, end),
        })


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: CompareView
class CompareView(APIView):
    """Сравнение любых двух недель или месяцев бок о бок."""

    @extend_schema(parameters=[
        OpenApiParameter("a_from", str), OpenApiParameter("a_to", str),
        OpenApiParameter("b_from", str), OpenApiParameter("b_to", str),
    ])
    def get(self, request):
        today = timezone.localdate()
        a_start = parse_date(request.query_params.get("a_from", "")) or week_bounds(today)[0]
        a_end = parse_date(request.query_params.get("a_to", "")) or week_bounds(today)[1]
        b_start = parse_date(request.query_params.get("b_from", "")) or a_start - timedelta(days=7)
        b_end = parse_date(request.query_params.get("b_to", "")) or a_end - timedelta(days=7)
        return Response(compare_periods(request.user, a_start, a_end, b_start, b_end))


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: HeatmapView
class HeatmapView(APIView):
    @extend_schema(parameters=[OpenApiParameter("year", int)])
    def get(self, request):
        year = int(request.query_params.get("year") or timezone.localdate().year)
        return Response({"year": year, "days": heatmap(request.user, year)})


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: ForecastView
class ForecastView(APIView):
    @extend_schema(parameters=[OpenApiParameter("date", str)])
    def get(self, request):
        target = parse_date(request.query_params.get("date", "")) or (
            timezone.localdate() + timedelta(days=90)
        )
        return Response(forecast_to_date(request.user, target) or {"detail": "Мало данных."})


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: WeekMetricsView
class WeekMetricsView(APIView):
    def get(self, request):
        today = timezone.localdate()
        anchor = parse_date(request.query_params.get("week_of", "")) or today
        start, end = week_bounds(anchor)
        return Response(week_metrics(request.user, start, end))


class StandardViewSet(OwnedModelViewSet):
    """Нормативы: планка, подтягивания, бег."""

    serializer_class = s.StandardSerializer
    queryset = m.Standard.objects.select_related("exercise")

    @action(detail=False, methods=["post"])
    def refresh(self, request):
        """Подтягивает текущие значения из личных рекордов."""
        from apps.training.models import PersonalRecord

        mapping = {
            m.Standard.Source.EXERCISE_MAX_DURATION: PersonalRecord.Kind.MAX_DURATION,
            m.Standard.Source.EXERCISE_MAX_REPS: PersonalRecord.Kind.MAX_REPS,
            m.Standard.Source.EXERCISE_MAX_WEIGHT: PersonalRecord.Kind.MAX_WEIGHT,
        }
        updated = 0
        for standard in self.get_queryset().exclude(source=m.Standard.Source.MANUAL):
            kind = mapping.get(standard.source)
            if kind is None or standard.exercise_id is None:
                continue
            record = PersonalRecord.objects.filter(
                user=request.user, exercise=standard.exercise, kind=kind
            ).first()
            if record:
                standard.current_value = record.value
                standard.save(update_fields=["current_value", "updated_at"])
                updated += 1
        return Response({"updated": updated, "items": self.get_serializer(
            self.get_queryset(), many=True
        ).data})


class InsightViewSet(OwnedModelViewSet):
    serializer_class = s.InsightSerializer
    queryset = m.Insight.objects.all()
    http_method_names = ["get", "head", "options"]
