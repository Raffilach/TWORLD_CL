"""Питание. Главная метрика — белок; калории по умолчанию выключены."""
from django.db import models

from apps.core.models import OwnedModel, SyncableModel


class FoodItem(models.Model):
    """Продукт. `owner=NULL` — общий сид, иначе личная база пользователя."""

    from django.conf import settings as _settings

    owner = models.ForeignKey(
        _settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE,
        related_name="food_items",
    )
    name = models.CharField(max_length=120)
    serving_label = models.CharField(max_length=40, default="порция")
    serving_grams = models.PositiveIntegerField(null=True, blank=True)
    protein_g = models.DecimalField(max_digits=6, decimal_places=1)
    calories = models.PositiveIntegerField(null=True, blank=True)
    fat_g = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    carbs_g = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    sugar_g = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    barcode = models.CharField(max_length=32, blank=True, db_index=True)
    is_quick_button = models.BooleanField(default=False)
    use_count = models.PositiveIntegerField(default=0)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-is_quick_button", "-use_count", "name"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="food_owner_name_uniq")
        ]

    def __str__(self):
        return f"{self.name} ({self.protein_g} г белка)"


class MealTemplate(OwnedModel):
    """«Мой обычный завтрак» — в один тап."""

    name = models.CharField(max_length=80)
    default_meal_type = models.CharField(max_length=12, blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class MealTemplateItem(models.Model):
    template = models.ForeignKey(MealTemplate, on_delete=models.CASCADE, related_name="items")
    food_item = models.ForeignKey(FoodItem, on_delete=models.CASCADE, related_name="+")
    quantity = models.DecimalField(max_digits=6, decimal_places=2, default=1)


class MealEntry(SyncableModel):
    class MealType(models.TextChoices):
        BREAKFAST = "breakfast", "завтрак"
        LUNCH = "lunch", "обед"
        DINNER = "dinner", "ужин"
        SNACK = "snack", "перекус"

    class Source(models.TextChoices):
        QUICK = "quick", "быстрая кнопка"
        TEMPLATE = "template", "шаблон"
        BARCODE = "barcode", "штрихкод"
        MANUAL = "manual", "вручную"
        PHOTO_ONLY = "photo_only", "только фото"

    at = models.DateTimeField(db_index=True)
    meal_type = models.CharField(max_length=12, choices=MealType.choices, default=MealType.SNACK)
    protein_g = models.DecimalField(max_digits=7, decimal_places=1, default=0)
    calories = models.PositiveIntegerField(null=True, blank=True)
    fat_g = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    carbs_g = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)
    photo = models.ImageField(upload_to="meals/", null=True, blank=True)
    source = models.CharField(max_length=12, choices=Source.choices, default=Source.QUICK)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-at"]
        constraints = SyncableModel.Meta.constraints

    def recalculate(self, save: bool = True):
        from decimal import Decimal

        total = Decimal("0")
        for item in self.items.all():
            total += Decimal(item.protein_g)
        self.protein_g = total
        if save:
            self.save(update_fields=["protein_g", "updated_at"])
        return self


class MealEntryItem(models.Model):
    meal_entry = models.ForeignKey(MealEntry, on_delete=models.CASCADE, related_name="items")
    food_item = models.ForeignKey(
        FoodItem, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    custom_name = models.CharField(max_length=120, blank=True)
    quantity = models.DecimalField(max_digits=6, decimal_places=2, default=1)
    protein_g = models.DecimalField(max_digits=6, decimal_places=1, default=0)


class WaterLog(SyncableModel):
    at = models.DateTimeField(db_index=True)
    volume_ml = models.PositiveIntegerField(default=250)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-at"]
        constraints = SyncableModel.Meta.constraints


class Supplement(OwnedModel):
    name = models.CharField(max_length=80)
    default_time = models.TimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class SupplementLog(SyncableModel):
    supplement = models.ForeignKey(Supplement, on_delete=models.CASCADE, related_name="logs")
    date = models.DateField(db_index=True)
    taken = models.BooleanField(default=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-date"]
        constraints = SyncableModel.Meta.constraints + [
            models.UniqueConstraint(fields=["supplement", "date"], name="supplement_log_uniq")
        ]


class DietExceptionLog(SyncableModel):
    """Лог исключений.

    Сладкие напитки — отдельный вид, не «еда»: стакан сока это ~25 г сахара,
    самая незаметная утечка.
    """

    class Kind(models.TextChoices):
        SWEETS = "sweets", "сладкое"
        FASTFOOD = "fastfood", "фастфуд"
        ALCOHOL = "alcohol", "алкоголь"
        SUGARY_DRINK = "sugary_drink", "сладкие напитки"
        OTHER = "other", "другое"

    at = models.DateTimeField(db_index=True)
    kind = models.CharField(max_length=14, choices=Kind.choices)
    amount_note = models.CharField(max_length=120, blank=True)
    estimated_sugar_g = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)

    class Meta(SyncableModel.Meta):
        abstract = False
        ordering = ["-at"]
        constraints = SyncableModel.Meta.constraints


class FreeMeal(OwnedModel):
    """Плановое послабление раз в неделю. Запреты приводят к срывам, план — нет."""

    planned_for = models.DateField()
    happened_on = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)
    within_limit = models.BooleanField(null=True, blank=True)

    class Meta:
        ordering = ["-planned_for"]
