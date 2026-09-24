"""MCP-сервер TWORLD.

Отдельный опциональный процесс: языковая модель читает данные и может
записать тренировку или создать план. Авторизация — персональным токеном
пользователя (Настройки → Интеграции → API-токены), тем же, что у REST API.
Токен со скоупом `read` физически не может ничего изменить: это проверяется
на стороне сервера, а не здесь.

Запуск:
    pip install -r mcp_server/requirements.txt
    TWORLD_API_URL=http://localhost:8000/api TWORLD_TOKEN=twk_... \
        python -m mcp_server.server

Конфигурация клиента (пример для Claude Desktop):
    {
      "mcpServers": {
        "tworld": {
          "command": "python",
          "args": ["-m", "mcp_server.server"],
          "env": {"TWORLD_API_URL": "https://example.com/api", "TWORLD_TOKEN": "twk_..."}
        }
      }
    }
"""
from __future__ import annotations

import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

API_URL = os.getenv("TWORLD_API_URL", "http://localhost:8000/api").rstrip("/")
TOKEN = os.getenv("TWORLD_TOKEN", "")
TIMEOUT = float(os.getenv("TWORLD_TIMEOUT", "30"))

mcp = FastMCP("tworld")


def _client() -> httpx.Client:
    if not TOKEN:
        raise RuntimeError(
            "Не задан TWORLD_TOKEN. Создайте токен в приложении: "
            "Профиль → Интеграции → API-токены."
        )
    return httpx.Client(
        base_url=API_URL,
        headers={"Authorization": f"Token {TOKEN}"},
        timeout=TIMEOUT,
    )


def _get(path: str, **params) -> Any:
    with _client() as client:
        response = client.get(path, params={k: v for k, v in params.items() if v is not None})
        response.raise_for_status()
        if response.headers.get("content-type", "").startswith("text/"):
            return response.text
        return response.json()


def _post(path: str, payload: dict) -> Any:
    with _client() as client:
        response = client.post(path, json=payload)
        if response.status_code == 403:
            raise RuntimeError(
                "Токен доступен только на чтение. Для записи нужен токен со скоупом write."
            )
        response.raise_for_status()
        return response.json()


@mcp.tool()
def get_workouts(date_from: str | None = None, date_to: str | None = None,
                 as_markdown: bool = True) -> str | dict:
    """История тренировок со всеми подходами и заметками.

    Заметки включены намеренно: «заболело левое плечо после разведений»
    объясняет цифры лучше, чем сами цифры.

    date_from / date_to — даты в формате YYYY-MM-DD.
    """
    if as_markdown:
        return _get("/context/", **{"from": date_from, "to": date_to,
                                    "sections": "profile,workouts,limits,injuries",
                                    "format": "markdown"})
    return _get("/context/", **{"from": date_from, "to": date_to, "sections": "workouts"})


@mcp.tool()
def get_measurements(date_from: str | None = None, date_to: str | None = None) -> dict:
    """Вес (тренд и сырой), обхваты сантиметром и данные анализатора состава тела.

    Основная величина — тренд-вес: скользящее среднее за 7 дней.
    Сырой вес скачет на воду и еду и сам по себе мало что значит.
    """
    return _get("/context/", **{"from": date_from, "to": date_to,
                                "sections": "measurements,goals"})


@mcp.tool()
def get_habits() -> dict:
    """Привычки, срывы и закономерности тяги.

    У каждой привычки три независимых числа: дней с решения (не обнуляется
    никогда), текущая серия (обнуляется срывом) и всего чистых дней.
    """
    return _get("/context/", sections="habits")


@mcp.tool()
def get_context(date_from: str | None = None, date_to: str | None = None,
                include_journal: bool = False) -> str:
    """Полный контекст пользователя одним markdown-документом.

    Профиль, цели, замеры, тренировки, сон, питание, привычки, травмы
    и ограничения. Дневник добавляется только по явному запросу.
    """
    return _get("/context/", **{"from": date_from, "to": date_to, "format": "markdown",
                                "include_journal": "1" if include_journal else None})


@mcp.tool()
def get_weekly_summary() -> dict:
    """Итоги текущей недели: метрики, слабое звено и один фокус на следующую неделю."""
    return _get("/analytics/weak-link/")


@mcp.tool()
def log_workout(date: str, exercises: list[dict], gym: int | None = None,
                wellbeing_1_10: int | None = None, notes: str = "") -> dict:
    """Записать выполненную тренировку. Требует токен со скоупом write.

    exercises — список вида:
        [{"exercise_id": 12, "sets": [
            {"weight_kg": 62.5, "reps": 10, "rir": 2, "is_warmup": false},
            {"duration_seconds": 85}
        ]}]

    Длительность указывается ТОЛЬКО в целых секундах: 85 — это 1:25.
    Формат «1:15:37» недопустим, он ломает все агрегаты.
    """
    session = _post("/workouts/", {
        "date": date, "gym": gym, "status": "completed",
        "wellbeing_1_10": wellbeing_1_10, "notes": notes,
    })
    created = []
    for item in exercises:
        entry = _post("/session-exercises/", {
            "session": session["id"],
            "exercise": item["exercise_id"],
            "status": "done",
            "notes": item.get("notes", ""),
        })
        for number, set_data in enumerate(item.get("sets", []), start=1):
            payload = {"session_exercise": entry["id"], "set_number": number}
            payload.update({k: v for k, v in set_data.items() if v is not None})
            created.append(_post("/sets/", payload))
    return {"session_id": session["id"], "sets_created": len(created)}


@mcp.tool()
def create_plan(markdown_or_json: str, fmt: str = "markdown", dry_run: bool = False) -> dict:
    """Создать шаблон тренировки из рекомендации. Требует токен со скоупом write.

    Формат markdown — заголовок плана, затем блоки по приоритету
    («Обязательный», «Основной», «По остатку сил») и таблица:

        # Верх тела

        ## Обязательный
        | Упражнение | Подходы | Повторы | Вес | Отдых |
        |---|---|---|---|---|
        | Жим штанги лёжа | 4 | 6-8 | 62.5 | 150 |

    Блок «Обязательный» — то, что делает день выполненным. Не кладите
    туда всё подряд: смысл механики в том, чтобы её можно было закрыть
    в плохой день.
    """
    return _post("/plans/import/", {
        "text": markdown_or_json, "format": fmt, "dry_run": dry_run
    })


@mcp.tool()
def get_exercise_history(exercise_id: int) -> dict:
    """График веса и повторов по упражнению плюс личные рекорды с датами."""
    return _get(f"/exercises/{exercise_id}/history/")


@mcp.tool()
def search_exercises(query: str) -> list[dict]:
    """Найти упражнение по названию — нужно, чтобы получить exercise_id."""
    payload = _get("/exercises/", search=query, page_size=20)
    items = payload.get("results", payload) if isinstance(payload, dict) else payload
    return [
        {
            "id": item["id"], "name": item["name"], "load_type": item["load_type"],
            "is_unilateral": item["is_unilateral"],
        }
        for item in items
    ]


if __name__ == "__main__":
    mcp.run()
