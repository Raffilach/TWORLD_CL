"""Приём плана тренировки от языковой модели.

Формат намеренно простой и задокументированный (docs/ai-exchange-format.md):
таблица упражнений с подходами, повторами и весом. Разбираются и markdown,
и JSON — модели одинаково охотно выдают и то, и другое.
"""
from __future__ import annotations

import json
import re

from django.db.models import Q

PRIORITY_ALIASES = {
    "обязательный": "required", "required": "required", "must": "required",
    "основной": "main", "main": "main",
    "по остатку сил": "optional", "опционально": "optional", "optional": "optional",
    "bonus": "optional",
}

REPS_RE = re.compile(r"^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$")
WEIGHT_RE = re.compile(r"^\s*([\d.,]+)")


def parse(raw_text: str, fmt: str = "markdown") -> dict:
    """Возвращает {"name", "blocks": [...], "errors": [...]}"""
    if fmt == "json":
        return _parse_json(raw_text)
    return _parse_markdown(raw_text)


def _parse_json(raw_text: str) -> dict:
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        return {"name": "", "blocks": [], "errors": [f"Некорректный JSON: {exc}"]}
    blocks = []
    for block in payload.get("blocks", []):
        blocks.append({
            "name": block.get("name", ""),
            "priority": PRIORITY_ALIASES.get(
                str(block.get("priority", "main")).lower(), "main"
            ),
            "exercises": [
                {
                    "name": item.get("exercise") or item.get("name", ""),
                    "sets": int(item.get("sets") or 3),
                    "reps_min": item.get("reps_min"),
                    "reps_max": item.get("reps_max"),
                    "seconds": item.get("seconds"),
                    "weight_kg": item.get("weight_kg"),
                    "rest_seconds": item.get("rest_seconds"),
                    "note": item.get("note", ""),
                }
                for item in block.get("exercises", [])
            ],
        })
    return {"name": payload.get("name", "План от ИИ"), "blocks": blocks, "errors": []}


def _parse_markdown(raw_text: str) -> dict:
    """Разбор markdown-таблицы.

    ## Обязательный
    | Упражнение | Подходы | Повторы | Вес | Отдых |
    |---|---|---|---|---|
    | Жим лёжа | 4 | 6-8 | 62.5 | 120 |
    """
    name = "План от ИИ"
    blocks: list[dict] = []
    errors: list[str] = []
    current: dict | None = None

    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("# "):
            name = stripped[2:].strip()
            continue
        if stripped.startswith("##"):
            title = stripped.lstrip("#").strip()
            current = {
                "name": title,
                "priority": PRIORITY_ALIASES.get(title.lower(), "main"),
                "exercises": [],
            }
            blocks.append(current)
            continue
        if not stripped.startswith("|"):
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if len(cells) < 2 or set("".join(cells)) <= set("-: "):
            continue
        header = cells[0].lower()
        if header in {"упражнение", "exercise", "название"}:
            continue
        if current is None:
            current = {"name": "Основной", "priority": "main", "exercises": []}
            blocks.append(current)

        exercise = {"name": cells[0], "sets": 3, "reps_min": None, "reps_max": None,
                    "seconds": None, "weight_kg": None, "rest_seconds": None, "note": ""}
        if len(cells) > 1 and cells[1].isdigit():
            exercise["sets"] = int(cells[1])
        if len(cells) > 2:
            match = REPS_RE.match(cells[2])
            if match:
                exercise["reps_min"] = int(match.group(1))
                exercise["reps_max"] = int(match.group(2) or match.group(1))
            elif "сек" in cells[2] or "s" in cells[2].lower():
                digits = re.findall(r"\d+", cells[2])
                if digits:
                    exercise["seconds"] = int(digits[0])
        if len(cells) > 3 and cells[3] not in {"", "-", "—"}:
            match = WEIGHT_RE.match(cells[3].replace(",", "."))
            if match:
                exercise["weight_kg"] = float(match.group(1))
        if len(cells) > 4:
            digits = re.findall(r"\d+", cells[4])
            if digits:
                exercise["rest_seconds"] = int(digits[0])
        if len(cells) > 5:
            exercise["note"] = cells[5]
        current["exercises"].append(exercise)

    if not blocks:
        errors.append("Не найдено ни одной таблицы упражнений.")
    return {"name": name, "blocks": blocks, "errors": errors}


def materialize(user, parsed: dict):
    """Создаёт шаблон. Неизвестные упражнения заводятся как свои, а не теряются."""
    from apps.training.models import (
        Exercise,
        TemplateBlock,
        TemplateExercise,
        WorkoutTemplate,
    )

    template = WorkoutTemplate.objects.create(
        user=user, name=parsed.get("name") or "План от ИИ",
        description="Импортировано из рекомендации языковой модели.",
    )
    created_exercises = []
    for block_index, block in enumerate(parsed.get("blocks", [])):
        db_block = TemplateBlock.objects.create(
            template=template,
            name=block.get("name", ""),
            priority=block.get("priority", "main"),
            order=block_index,
        )
        for order, item in enumerate(block.get("exercises", [])):
            exercise = (
                Exercise.objects.filter(
                    Q(owner__isnull=True) | Q(owner=user), name__iexact=item["name"]
                ).first()
            )
            if exercise is None:
                exercise = Exercise.objects.create(owner=user, name=item["name"])
                created_exercises.append(exercise.name)
            TemplateExercise.objects.create(
                block=db_block,
                exercise=exercise,
                order=order,
                target_sets=item.get("sets") or 3,
                target_reps_min=item.get("reps_min"),
                target_reps_max=item.get("reps_max"),
                target_seconds=item.get("seconds"),
                target_weight_kg=item.get("weight_kg"),
                rest_seconds=item.get("rest_seconds"),
                notes=item.get("note", ""),
            )
    return template, created_exercises
