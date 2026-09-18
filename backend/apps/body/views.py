from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from rest_framework.views import APIView

from apps.core.viewsets import OwnedModelViewSet

from . import models as m
from . import serializers as s
from .services import bodyfat_forecast, comparability_note, fast_loss_warning, rebuild_trend, trend_summary


class WeightEntryViewSet(OwnedModelViewSet):
    """Вес за 3 секунды: одно число, автосохранение, тренд пересчитывается сам."""

    serializer_class = s.WeightEntrySerializer
    queryset = m.WeightEntry.objects.all()
    filterset_fields = ["source"]

    def perform_create(self, serializer):
        entry = serializer.save(user=self.request.user)
        rebuild_trend(self.request.user, since=entry.at.date())

    def perform_update(self, serializer):
        entry = serializer.save()
        rebuild_trend(self.request.user, since=entry.at.date())

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        rebuild_trend(self.request.user, since=instance.at.date())

    def create(self, request, *args, **kwargs):
        """Ответ сразу отдаёт тренд — он и показывается крупно, а не сырой вес."""
        response = super().create(request, *args, **kwargs)
        response.data["trend"] = trend_summary(request.user)
        response.data["fast_loss_warning"] = fast_loss_warning(request.user)
        previous = (
            m.WeightEntry.objects.filter(user=request.user, deleted_at__isnull=True)
            .exclude(pk=response.data["id"])
            .order_by("-at")
            .first()
        )
        if previous is not None:
            current = m.WeightEntry.objects.get(pk=response.data["id"])
            response.data["comparability_note"] = comparability_note(current, previous)
        return response

    @action(detail=False, methods=["get"])
    def trend(self, request):
        """Тренд-вес как основная цифра, сырой — вторичен."""
        points = m.WeightTrendPoint.objects.filter(user=request.user)
        date_from = request.query_params.get("from")
        if date_from:
            points = points.filter(date__gte=date_from)
        return Response({
            "summary": trend_summary(request.user),
            "points": s.WeightTrendPointSerializer(points, many=True).data,
        })

    @action(detail=False, methods=["post"], url_path="rebuild-trend")
    def rebuild(self, request):
        return Response({"points": rebuild_trend(request.user)})

    @action(detail=False, methods=["get"])
    def last(self, request):
        """Прошлое значение — плейсхолдер в поле ввода веса."""
        entry = self.get_queryset().order_by("-at").first()
        return Response({
            "last": s.WeightEntrySerializer(entry).data if entry else None,
            "trend": trend_summary(request.user),
        })


class BodyMeasurementViewSet(OwnedModelViewSet):
    serializer_class = s.BodyMeasurementSerializer
    queryset = m.BodyMeasurement.objects.all()
    filterset_fields = ["site", "date"]

    @action(detail=False, methods=["get"])
    def latest(self, request):
        """Последнее значение по каждому обхвату. Талия — первой."""
        order = ["waist", "chest", "hips", "arm_l", "arm_r", "thigh_l", "thigh_r", "neck", "calf"]
        result = []
        for site in order:
            entry = self.get_queryset().filter(site=site).order_by("-date").first()
            if entry:
                result.append(s.BodyMeasurementSerializer(entry).data)
        return Response({
            "items": result,
            "note": "Талия часто показывает прогресс раньше весов и раньше анализатора состава.",
        })


class BodyCompositionScanViewSet(OwnedModelViewSet):
    serializer_class = s.BodyCompositionScanSerializer
    queryset = m.BodyCompositionScan.objects.prefetch_related("segments")

    @action(detail=False, methods=["get"])
    def series(self, request):
        """История графиком по каждому показателю."""
        fields = [
            "weight_kg", "body_fat_pct", "body_fat_kg", "skeletal_muscle_kg",
            "total_water_l", "intracellular_water_l", "extracellular_water_l",
            "protein_kg", "minerals_kg", "visceral_fat_level", "bmr_kcal", "score",
        ]
        scans = self.get_queryset().order_by("at")
        return Response({
            "fields": fields,
            "points": [
                {"at": scan.at, **{field: getattr(scan, field) for field in fields}}
                for scan in scans
            ],
            "forecast": bodyfat_forecast(request.user),
        })


class ProgressPhotoViewSet(OwnedModelViewSet):
    serializer_class = s.ProgressPhotoSerializer
    queryset = m.ProgressPhoto.objects.all()
    filterset_fields = ["pose", "date"]

    @action(detail=False, methods=["get"])
    def compare(self, request):
        """Пары «до/после» для слайдера сравнения."""
        pose = request.query_params.get("pose", "front")
        photos = self.get_queryset().filter(pose=pose).order_by("date")
        if photos.count() < 2:
            return Response({"before": None, "after": None})
        return Response({
            "before": s.ProgressPhotoSerializer(photos.first()).data,
            "after": s.ProgressPhotoSerializer(photos.last()).data,
        })


class PhotoScheduleViewSet(OwnedModelViewSet):
    serializer_class = s.PhotoScheduleSerializer
    queryset = m.PhotoSchedule.objects.all()


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: BodyOverviewView
class BodyOverviewView(APIView):
    def get(self, request):
        return Response({
            "trend": trend_summary(request.user),
            "fast_loss_warning": fast_loss_warning(request.user),
            "bodyfat_forecast": bodyfat_forecast(request.user),
        })
