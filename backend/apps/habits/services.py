"""Привычки: закономерности тяги и рисковое время."""
from collections import Counter
from datetime import timedelta

from django.utils import timezone

from .models import CravingLog, Habit


def habit_stats(habit: Habit, today=None) -> dict:
    """Обе цифры показываются всегда, и первая никогда не обнуляется."""
    today = today or timezone.localdate()
    return {
        "days_since_decision": habit.days_since_decision(today),
        "current_streak": habit.current_streak(today),
        "total_clean_days": habit.total_clean_days(today),
        "episodes_count": habit.episodes.count(),
        "money_saved": habit.money_saved(today),
    }


def craving_patterns(user, days: int = 90) -> dict:
    """Автоматическое выявление закономерностей: время суток, день недели, триггер."""
    since = timezone.now() - timedelta(days=days)
    logs = list(
        CravingLog.objects.filter(
            user=user, occurred_at__gte=since, deleted_at__isnull=True
        ).select_related("trigger")
    )
    if not logs:
        return {"samples": 0, "by_hour": {}, "by_weekday": {}, "by_trigger": {},
                "riskiest_hour": None, "what_helps": []}

    by_hour = Counter(log.occurred_at.astimezone().hour for log in logs)
    by_weekday = Counter(log.occurred_at.astimezone().weekday() for log in logs)
    by_trigger = Counter(
        (log.trigger.name_ru if log.trigger else "без триггера") for log in logs
    )
    helped = Counter(
        log.what_helped.strip() for log in logs if log.resisted and log.what_helped.strip()
    )
    riskiest_hour, riskiest_count = by_hour.most_common(1)[0]
    return {
        "samples": len(logs),
        "by_hour": dict(sorted(by_hour.items())),
        "by_weekday": dict(sorted(by_weekday.items())),
        "by_trigger": dict(by_trigger.most_common()),
        "riskiest_hour": riskiest_hour,
        "riskiest_hour_share": round(riskiest_count / len(logs) * 100),
        "resisted_rate": round(sum(1 for log in logs if log.resisted) / len(logs) * 100),
        "what_helps": [text for text, _ in helped.most_common(5)],
    }


def health_timeline(habit: Habit, today=None) -> list[dict]:
    """Таймлайн улучшений здоровья по текущей серии."""
    from apps.catalog.models import HealthTimelineItem

    if not habit.timeline_kind:
        return []
    hours = habit.current_streak(today) * 24
    items = HealthTimelineItem.objects.filter(habit_kind=habit.timeline_kind)
    return [
        {
            "hours_after": item.hours_after,
            "title": item.title_ru,
            "description": item.description_ru,
            "reached": hours >= item.hours_after,
        }
        for item in items
    ]
