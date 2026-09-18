from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.types import OpenApiTypes
from rest_framework.views import APIView

from apps.core.permissions import IsOwnerOrGlobalReadOnly, TokenScopePermission
from apps.core.viewsets import OwnedModelViewSet

from . import models as m
from . import serializers as s


class FoodItemViewSet(OwnedModelViewSet):
    """Своя база продуктов + общий сид. Пополняется одним тапом из истории."""

    permission_classes = [IsOwnerOrGlobalReadOnly, TokenScopePermission]

    serializer_class = s.FoodItemSerializer
    queryset = m.FoodItem.objects.all()
    search_fields = ["name", "barcode"]
    filterset_fields = ["is_quick_button", "barcode"]

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return m.FoodItem.objects.none()
        return m.FoodItem.objects.filter(
            Q(owner__isnull=True) | Q(owner=self.request.user)
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.owner_id is None:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Продукт из общей базы. Добавьте свой вариант.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.owner_id is None:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Продукт из общей базы удалить нельзя.")
        instance.delete()

    @action(detail=False, methods=["get"])
    def quick(self, request):
        """Быстрые кнопки: закреплённые + самые частые."""
        base = self.get_queryset()
        pinned = base.filter(is_quick_button=True)[:6]
        frequent = base.filter(owner=request.user, use_count__gt=0).exclude(
            pk__in=[item.pk for item in pinned]
        )[:6]
        return Response({
            "pinned": s.FoodItemSerializer(pinned, many=True).data,
            "frequent": s.FoodItemSerializer(frequent, many=True).data,
        })

    @extend_schema(parameters=[OpenApiParameter("code", str)])
    @action(detail=False, methods=["get"], url_path="barcode")
    def barcode(self, request):
        """Поиск по штрихкоду в своей базе.

        Внешний справочник (Open Food Facts) опрашивается клиентом:
        так сканирование работает и без нашего сервера.
        """
        code = request.query_params.get("code", "")
        item = self.get_queryset().filter(barcode=code).first()
        if item is None:
            return Response({"found": False, "barcode": code}, status=404)
        return Response({"found": True, "item": s.FoodItemSerializer(item).data})


class MealEntryViewSet(OwnedModelViewSet):
    serializer_class = s.MealEntrySerializer
    queryset = m.MealEntry.objects.prefetch_related("items__food_item")
    filterset_fields = ["meal_type", "source"]

    @action(detail=False, methods=["post"], url_path="quick-protein")
    def quick_protein(self, request):
        """Белок одним тапом: продукт → запись. Без формы и без «Сохранить»."""
        food = m.FoodItem.objects.filter(
            Q(owner__isnull=True) | Q(owner=request.user), pk=request.data.get("food_item")
        ).first()
        if food is None:
            return Response({"food_item": ["Продукт не найден."]}, status=400)
        quantity = Decimal(str(request.data.get("quantity", 1)))
        entry = m.MealEntry.objects.create(
            user=request.user,
            at=timezone.now(),
            meal_type=request.data.get("meal_type", m.MealEntry.MealType.SNACK),
            source=m.MealEntry.Source.QUICK,
        )
        m.MealEntryItem.objects.create(
            meal_entry=entry, food_item=food, quantity=quantity,
            protein_g=food.protein_g * quantity,
        )
        food.use_count += 1
        food.last_used_at = timezone.now()
        food.save(update_fields=["use_count", "last_used_at"])
        entry.recalculate()
        return Response(s.MealEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


class MealTemplateViewSet(OwnedModelViewSet):
    serializer_class = s.MealTemplateSerializer
    queryset = m.MealTemplate.objects.prefetch_related("items__food_item")

    @action(detail=True, methods=["post"])
    def apply(self, request, pk=None):
        """«Мой обычный завтрак» — в один тап."""
        template = self.get_object()
        entry = m.MealEntry.objects.create(
            user=request.user,
            at=timezone.now(),
            meal_type=template.default_meal_type or m.MealEntry.MealType.SNACK,
            source=m.MealEntry.Source.TEMPLATE,
        )
        for item in template.items.select_related("food_item"):
            m.MealEntryItem.objects.create(
                meal_entry=entry,
                food_item=item.food_item,
                quantity=item.quantity,
                protein_g=item.food_item.protein_g * item.quantity,
            )
        entry.recalculate()
        return Response(s.MealEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


class WaterLogViewSet(OwnedModelViewSet):
    serializer_class = s.WaterLogSerializer
    queryset = m.WaterLog.objects.all()

    @action(detail=False, methods=["post"])
    def glass(self, request):
        """+1 стакан одним тапом."""
        settings_obj = getattr(request.user, "settings", None)
        volume = int(request.data.get("volume_ml") or getattr(settings_obj, "water_glass_ml", 250))
        entry = m.WaterLog.objects.create(user=request.user, at=timezone.now(), volume_ml=volume)
        today = timezone.localdate()
        total = m.WaterLog.objects.filter(
            user=request.user, at__date=today, deleted_at__isnull=True
        ).aggregate(total=Sum("volume_ml"))["total"] or 0
        return Response({
            "entry": s.WaterLogSerializer(entry).data,
            "today_total_ml": total,
            "target_ml": getattr(settings_obj, "water_target_ml", 2000),
        }, status=status.HTTP_201_CREATED)


class SupplementViewSet(OwnedModelViewSet):
    serializer_class = s.SupplementSerializer
    queryset = m.Supplement.objects.prefetch_related("logs")

    @action(detail=True, methods=["post"])
    def toggle(self, request, pk=None):
        """Галочка добавки за день — один тап, с отменой повторным тапом."""
        supplement = self.get_object()
        date = request.data.get("date") or timezone.localdate()
        log, created = m.SupplementLog.objects.get_or_create(
            user=request.user, supplement=supplement, date=date, defaults={"taken": True}
        )
        if not created:
            log.taken = not log.taken
            log.save(update_fields=["taken", "updated_at"])
        return Response(s.SupplementSerializer(supplement).data)


class SupplementLogViewSet(OwnedModelViewSet):
    serializer_class = s.SupplementLogSerializer
    queryset = m.SupplementLog.objects.all()
    filterset_fields = ["supplement", "date"]


class DietExceptionLogViewSet(OwnedModelViewSet):
    """Сладкие напитки считаются отдельно от еды — самая незаметная утечка."""

    serializer_class = s.DietExceptionLogSerializer
    queryset = m.DietExceptionLog.objects.all()
    filterset_fields = ["kind"]

    @action(detail=False, methods=["get"])
    def weekly(self, request):
        today = timezone.localdate()
        start = today - timedelta(days=6)
        rows = (
            self.get_queryset()
            .filter(at__date__range=(start, today))
            .values("kind")
            .annotate(count=Count("id"), sugar=Sum("estimated_sugar_g"))
        )
        labels = dict(m.DietExceptionLog.Kind.choices)
        return Response({
            "period": {"from": start, "to": today},
            "items": [
                {
                    "kind": row["kind"],
                    "label": labels.get(row["kind"], row["kind"]),
                    "count": row["count"],
                    "estimated_sugar_g": row["sugar"],
                }
                for row in rows
            ],
        })


class FreeMealViewSet(OwnedModelViewSet):
    """Плановое послабление: запреты приводят к срывам, план — нет."""

    serializer_class = s.FreeMealSerializer
    queryset = m.FreeMeal.objects.all()


@extend_schema(responses={200: OpenApiTypes.OBJECT})  # schema: NutritionTodayView
class NutritionTodayView(APIView):
    """Сводка питания за день для экрана «Сегодня»."""

    def get(self, request):
        settings_obj = getattr(request.user, "settings", None)
        day = request.query_params.get("date") or timezone.localdate()
        protein = m.MealEntry.objects.filter(
            user=request.user, at__date=day, deleted_at__isnull=True
        ).aggregate(total=Sum("protein_g"))["total"] or 0
        water = m.WaterLog.objects.filter(
            user=request.user, at__date=day, deleted_at__isnull=True
        ).aggregate(total=Sum("volume_ml"))["total"] or 0
        supplements = m.Supplement.objects.filter(user=request.user, is_active=True)
        return Response({
            "date": day,
            "protein": {
                "done_g": protein,
                "target_g": getattr(settings_obj, "protein_target_g", 150),
            },
            "water": {
                "done_ml": water,
                "target_ml": getattr(settings_obj, "water_target_ml", 2000),
                "glass_ml": getattr(settings_obj, "water_glass_ml", 250),
            },
            "supplements": s.SupplementSerializer(supplements, many=True).data,
            "track_calories": getattr(settings_obj, "track_calories", False),
        })
