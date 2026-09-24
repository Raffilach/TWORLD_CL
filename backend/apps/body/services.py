"""Замеры тела: тренд-вес, сопоставимость замеров, прогнозы."""
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Avg

from .models import WeightEntry, WeightTrendPoint

CONF = settings.TWORLD


def rebuild_trend(user, since: date | None = None) -> int:
    """Скользящее среднее за 7 дней.

    Тренд — основная отображаемая цифра: +1,7 кг за неделю по сырому весу
    это чаще вода и еда, а не жир, и демотивирует зря.
    """
    window = CONF["WEIGHT_TREND_WINDOW_DAYS"]
    entries = WeightEntry.objects.filter(user=user, deleted_at__isnull=True).order_by("at")
    if not entries.exists():
        return 0
    first_day = entries.first().at.date()
    last_day = entries.last().at.date()
    start = max(since or first_day, first_day)

    daily: dict[date, Decimal] = {}
    for row in (
        entries.values("at__date").annotate(avg=Avg("weight_kg")).order_by("at__date")
    ):
        daily[row["at__date"]] = Decimal(str(row["avg"]))

    written = 0
    day = start
    while day <= last_day:
        window_days = [day - timedelta(days=offset) for offset in range(window)]
        values = [daily[d] for d in window_days if d in daily]
        if values:
            trend = sum(values) / Decimal(len(values))
            WeightTrendPoint.objects.update_or_create(
                user=user,
                date=day,
                defaults={
                    "raw_kg": daily.get(day),
                    "trend_kg": trend.quantize(Decimal("0.001")),
                    "points_used": len(values),
                },
            )
            written += 1
        day += timedelta(days=1)
    return written


def trend_summary(user, on: date | None = None) -> dict:
    """Тренд сегодня и изменение за неделю/месяц."""
    on = on or date.today()
    point = WeightTrendPoint.objects.filter(user=user, date__lte=on).order_by("-date").first()
    if point is None:
        return {"trend_kg": None, "raw_kg": None}

    def delta(days: int):
        past = (
            WeightTrendPoint.objects.filter(user=user, date__lte=on - timedelta(days=days))
            .order_by("-date")
            .first()
        )
        return None if past is None else point.trend_kg - past.trend_kg

    latest_raw = (
        WeightEntry.objects.filter(user=user, deleted_at__isnull=True).order_by("-at").first()
    )
    return {
        "date": point.date,
        "trend_kg": point.trend_kg,
        "raw_kg": latest_raw.weight_kg if latest_raw else None,
        "raw_at": latest_raw.at if latest_raw else None,
        "points_used": point.points_used,
        "change_7d": delta(7),
        "change_30d": delta(30),
    }


def comparability_note(entry_a: WeightEntry, entry_b: WeightEntry) -> str | None:
    """Разница между утренним и вечерним весом — до 3 кг у одного человека."""
    if entry_a.conditions_key() == entry_b.conditions_key():
        return None
    return (
        "Замеры сделаны в разных условиях "
        f"({entry_a.conditions_key() or 'без пометок'} и "
        f"{entry_b.conditions_key() or 'без пометок'}) — "
        "разница может быть до 3 кг и не отражать реальное изменение."
    )


def fast_loss_warning(user, on: date | None = None) -> dict | None:
    """Слишком быстрое снижение — риск потери мышц."""
    on = on or date.today()
    summary = trend_summary(user, on)
    change = summary.get("change_7d")
    trend = summary.get("trend_kg")
    if change is None or trend is None or trend == 0:
        return None
    percent = float(change) / float(trend) * 100
    limit = CONF["FAST_WEIGHT_LOSS_PERCENT_PER_WEEK"]
    if percent < -limit:
        return {
            "change_kg": change,
            "percent_per_week": round(percent, 2),
            "message": (
                f"Тренд-вес снижается на {abs(percent):.1f}% в неделю. "
                f"Выше {limit}% обычно означает, что вместе с жиром уходят мышцы — "
                "стоит немного добавить еды."
            ),
        }
    return None


def bodyfat_forecast(user) -> dict | None:
    """Сколько жира осталось до цели и когда при текущем темпе."""
    from .models import BodyCompositionScan

    profile = getattr(user, "profile", None)
    if profile is None or profile.goal_bodyfat_pct is None:
        return None
    scans = list(
        BodyCompositionScan.objects.filter(
            user=user, body_fat_pct__isnull=False
        ).order_by("-at")[:2]
    )
    if len(scans) < 2:
        return None
    newest, previous = scans[0], scans[1]
    days = (newest.at.date() - previous.at.date()).days or 1
    rate = float(newest.body_fat_pct - previous.body_fat_pct) / days
    remaining = float(newest.body_fat_pct) - float(profile.goal_bodyfat_pct)
    if rate >= 0 or remaining <= 0:
        return {
            "current_pct": newest.body_fat_pct,
            "goal_pct": profile.goal_bodyfat_pct,
            "remaining_pct": round(remaining, 1),
            "eta": None,
            "note": "Текущего темпа снижения нет — прогноз не строится.",
        }
    days_needed = int(remaining / abs(rate))
    return {
        "current_pct": newest.body_fat_pct,
        "goal_pct": profile.goal_bodyfat_pct,
        "remaining_pct": round(remaining, 1),
        "weekly_rate_pct": round(rate * 7, 2),
        "eta": newest.at.date() + timedelta(days=days_needed),
    }


SCAN_HINTS = [
    "Прирост «мышечной массы» между замерами частично объясняется водой "
    "и гликогеном, а не только мышцами.",
    "Замер делайте в одинаковых условиях: одно время дня, до тренировки, "
    "без полного желудка — иначе цифры несопоставимы.",
]
