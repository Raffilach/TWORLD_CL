"""Расчёт расхода калорий по факту, а не по формуле.

Формулы вроде Харриса–Бенедикта ошибаются на сотни килокалорий, потому что
не знают ни активности, ни термогенеза конкретного человека. Зато две вещи
измеряются напрямую: сколько человек съел и как изменился его тренд-вес.
Этого достаточно, чтобы посчитать реальный расход.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Avg, Sum

CONF = settings.TWORLD


def adaptive_tdee(user, days: int = 14, on: date | None = None) -> dict | None:
    """Расход = среднее потребление − вклад изменения массы.

    Δ тренд-веса × 7700 ккал/кг, размазанное на период. Нужны и калории,
    и вес: без любого из двух считать нечего.
    """
    from apps.body.models import WeightTrendPoint

    from .models import MealEntry

    on = on or date.today()
    start = on - timedelta(days=days)

    intake = (
        MealEntry.objects.filter(
            user=user, at__date__range=(start, on), deleted_at__isnull=True,
            calories__isnull=False,
        )
        .values("at__date")
        .annotate(total=Sum("calories"))
    )
    logged_days = [row["total"] for row in intake if row["total"]]
    if len(logged_days) < max(5, days // 3):
        return {
            "available": False,
            "reason": (
                f"Нужно хотя бы {max(5, days // 3)} дней с записанными калориями, "
                f"сейчас {len(logged_days)}."
            ),
        }

    first = WeightTrendPoint.objects.filter(user=user, date__gte=start).order_by("date").first()
    last = WeightTrendPoint.objects.filter(user=user, date__lte=on).order_by("-date").first()
    if first is None or last is None or first.date == last.date:
        return {"available": False, "reason": "Мало данных о весе за период."}

    average_intake = sum(logged_days) / len(logged_days)
    span_days = (last.date - first.date).days or 1
    weight_change = Decimal(last.trend_kg) - Decimal(first.trend_kg)
    daily_balance = float(weight_change) * CONF["KCAL_PER_KG_FAT"] / span_days

    return {
        "available": True,
        "period_days": span_days,
        "days_logged": len(logged_days),
        "average_intake_kcal": round(average_intake),
        "trend_change_kg": round(float(weight_change), 2),
        "estimated_tdee_kcal": round(average_intake - daily_balance),
        "note": (
            "Расход посчитан по фактическому потреблению и изменению тренд-веса, "
            "а не по формуле. Формулы ошибаются на сотни килокалорий."
        ),
    }


def formula_bmr(user) -> dict | None:
    """Стартовое приближение, пока фактических данных нет.

    Помечается как оценка намеренно: пользоваться им дольше двух недель
    смысла нет — адаптивный расчёт точнее.
    """
    profile = getattr(user, "profile", None)
    if profile is None or not profile.height_cm or not profile.birth_date:
        return None

    from apps.body.services import trend_summary

    trend = trend_summary(user)
    weight = trend.get("trend_kg")
    if weight is None:
        return None

    age = (date.today() - profile.birth_date).days // 365
    height = float(profile.height_cm)
    weight = float(weight)
    # Миффлина–Сан Жеора
    base = 10 * weight + 6.25 * height - 5 * age
    bmr = base + (5 if profile.sex == "male" else -161)
    return {
        "bmr_kcal": round(bmr),
        "is_estimate": True,
        "note": "Оценка по формуле. Через две недели записей появится точный расчёт по факту.",
    }
