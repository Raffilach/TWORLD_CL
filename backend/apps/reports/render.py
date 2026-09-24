"""Рендер недельного отчёта в HTML и PDF.

PDF собирается WeasyPrint из того же HTML, что показывается по публичной
ссылке, — одна вёрстка, один источник правды. Если WeasyPrint не установлен
(нужны системные библиотеки pango/cairo), отдаётся печатаемый HTML:
в браузере «Печать → Сохранить как PDF» даёт тот же A4.
"""
from datetime import timedelta

from django.template.loader import render_to_string

from apps.core.units import seconds_to_label


def _decorate(data: dict) -> dict:
    """Готовит подписи, чтобы в шаблоне не было логики."""
    status_labels = {"skipped": "пропущено", "failed": "не смог", "pending": "не начато"}
    for workout in data.get("workouts", []):
        workout["duration_label"] = (
            seconds_to_label(workout["duration_seconds"]) if workout["duration_seconds"] else "—"
        )
        for exercise in workout["exercises"]:
            exercise["status_label"] = status_labels.get(exercise["status"], exercise["status"])
            for item in exercise["sets"]:
                item["label"] = _set_label(item)
    return data


def _set_label(item: dict) -> str:
    if item.get("duration_seconds") is not None:
        return f"{item['duration_seconds']} с"
    weight = item.get("weight_kg")
    if weight is None:
        return f"{item.get('reps') or 0} повт."
    side = "/стор." if item.get("per_side") else ""
    rir = f"@{item['rir']}" if item.get("rir") is not None else ""
    return f"{weight:g}{side}×{item.get('reps') or 0}{rir}"


def _charts(data: dict, limit: int = 5) -> list[dict]:
    """Мини-графики по 3–5 ключевым упражнениям — простыми столбиками.

    Без картинок и внешних зависимостей: столбики рисуются CSS,
    поэтому отчёт одинаково выглядит в PDF и в браузере.
    """
    series: dict[str, list[tuple]] = {}
    for workout in data.get("workouts", []):
        for exercise in workout["exercises"]:
            working = [s for s in exercise["sets"] if not s["warmup"] and s.get("weight_kg")]
            if not working:
                continue
            top = max(float(s["weight_kg"]) for s in working)
            series.setdefault(exercise["name"], []).append((workout["date"], top))

    ranked = sorted(series.items(), key=lambda item: len(item[1]), reverse=True)[:limit]
    charts = []
    for name, points in ranked:
        if len(points) < 2:
            continue
        top = max(value for _, value in points) or 1
        charts.append({
            "name": name,
            "caption": f"Рабочий вес по дням недели, максимум {top:g} кг",
            "bars": [
                {"left": 2 + index * 5, "height": round(value / top * 16, 1)}
                for index, (_, value) in enumerate(points)
            ],
        })
    return charts


def render_html(user, data: dict, variant: str, blocks: dict) -> str:
    data = _decorate(data)
    profile = getattr(user, "profile", None)
    metrics = data["metrics"]
    previous = data["previous"]

    def duration(seconds):
        return seconds_to_label(seconds) if seconds else "—"

    def sleep_label(minutes):
        return f"{minutes // 60} ч {minutes % 60:02d} мин" if minutes else "—"

    closed = sum(
        1 for day in data["days"] if day["workout"]
    ) or len([d for d in data["days"] if d["tonnage_kg"]])

    return render_to_string("reports/weekly.html", {
        "data": data,
        "variant": variant,
        "blocks": blocks,
        "charts": _charts(data) if blocks.get("exercise_charts") else [],
        "goal_weight": getattr(profile, "goal_weight_kg", None),
        "avg_duration": duration(metrics["workouts"]["avg_duration_seconds"]),
        "prev_avg_duration": duration(previous["workouts"]["avg_duration_seconds"]),
        "sleep_avg": sleep_label(metrics["sleep"]["average_minutes"]),
        "prev_sleep_avg": sleep_label(previous["sleep"]["average_minutes"]),
        "sleep_target": sleep_label(metrics["sleep"]["target_minutes"]),
        "closed_days": closed,
    })


def render_pdf(html: str) -> bytes | None:
    """Возвращает PDF или None, если WeasyPrint недоступен."""
    try:
        from weasyprint import HTML
    except (ImportError, OSError):
        return None
    return HTML(string=html).write_pdf()
