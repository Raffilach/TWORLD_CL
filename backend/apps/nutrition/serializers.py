from rest_framework import serializers

from apps.core.serializers import OwnedModelSerializer

from . import models as m


class FoodItemSerializer(serializers.ModelSerializer):
    is_global = serializers.SerializerMethodField()

    class Meta:
        model = m.FoodItem
        fields = [
            "id", "name", "serving_label", "serving_grams", "protein_g", "calories",
            "fat_g", "carbs_g", "sugar_g", "barcode", "is_quick_button",
            "use_count", "last_used_at", "is_global",
        ]
        read_only_fields = ["use_count", "last_used_at"]

    def get_is_global(self, obj) -> bool:
        return obj.owner_id is None


class MealEntryItemSerializer(serializers.ModelSerializer):
    food_name = serializers.CharField(source="food_item.name", read_only=True)

    class Meta:
        model = m.MealEntryItem
        fields = ["id", "food_item", "food_name", "custom_name", "quantity", "protein_g"]
        extra_kwargs = {"protein_g": {"required": False}}


class MealEntrySerializer(OwnedModelSerializer):
    items = MealEntryItemSerializer(many=True, required=False)

    class Meta:
        model = m.MealEntry
        fields = [
            "id", "client_id", "at", "meal_type", "protein_g", "calories", "fat_g",
            "carbs_g", "note", "photo", "source", "items",
        ]
        read_only_fields = ["protein_g"]

    def create(self, validated_data):
        items = validated_data.pop("items", [])
        entry = m.MealEntry.objects.create(**validated_data)
        self._sync_items(entry, items)
        return entry

    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if items is not None:
            instance.items.all().delete()
            self._sync_items(instance, items)
        return instance

    def _sync_items(self, entry, items):
        from django.utils import timezone

        for item in items:
            food = item.get("food_item")
            quantity = item.get("quantity", 1)
            protein = item.get("protein_g")
            if protein is None and food is not None:
                protein = food.protein_g * quantity
            m.MealEntryItem.objects.create(
                meal_entry=entry,
                food_item=food,
                custom_name=item.get("custom_name", ""),
                quantity=quantity,
                protein_g=protein or 0,
            )
            if food is not None:
                food.use_count += 1
                food.last_used_at = timezone.now()
                food.save(update_fields=["use_count", "last_used_at"])
        entry.recalculate()


class MealTemplateItemSerializer(serializers.ModelSerializer):
    food_name = serializers.CharField(source="food_item.name", read_only=True)
    protein_g = serializers.DecimalField(
        source="food_item.protein_g", max_digits=6, decimal_places=1, read_only=True
    )

    class Meta:
        model = m.MealTemplateItem
        fields = ["id", "food_item", "food_name", "quantity", "protein_g"]


class MealTemplateSerializer(OwnedModelSerializer):
    items = MealTemplateItemSerializer(many=True, read_only=True)
    total_protein_g = serializers.SerializerMethodField()

    class Meta:
        model = m.MealTemplate
        fields = ["id", "name", "default_meal_type", "items", "total_protein_g"]

    def get_total_protein_g(self, obj) -> float:
        return sum(item.food_item.protein_g * item.quantity for item in obj.items.all())


class WaterLogSerializer(OwnedModelSerializer):
    class Meta:
        model = m.WaterLog
        fields = ["id", "client_id", "at", "volume_ml"]


class SupplementSerializer(OwnedModelSerializer):
    streak_days = serializers.SerializerMethodField()
    taken_today = serializers.SerializerMethodField()

    class Meta:
        model = m.Supplement
        fields = ["id", "name", "default_time", "is_active", "order", "streak_days", "taken_today"]

    def get_streak_days(self, obj) -> int:
        from datetime import timedelta

        from django.utils import timezone

        today = timezone.localdate()
        taken = set(
            obj.logs.filter(taken=True, deleted_at__isnull=True).values_list("date", flat=True)
        )
        streak = 0
        day = today
        if day not in taken:
            day -= timedelta(days=1)
        while day in taken:
            streak += 1
            day -= timedelta(days=1)
        return streak

    def get_taken_today(self, obj) -> bool:
        from django.utils import timezone

        return obj.logs.filter(
            date=timezone.localdate(), taken=True, deleted_at__isnull=True
        ).exists()


class SupplementLogSerializer(OwnedModelSerializer):
    class Meta:
        model = m.SupplementLog
        fields = ["id", "client_id", "supplement", "date", "taken"]


class DietExceptionLogSerializer(OwnedModelSerializer):
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = m.DietExceptionLog
        fields = [
            "id", "client_id", "at", "kind", "kind_label", "amount_note",
            "estimated_sugar_g", "note",
        ]


class FreeMealSerializer(OwnedModelSerializer):
    class Meta:
        model = m.FreeMeal
        fields = ["id", "planned_for", "happened_on", "note", "within_limit"]
