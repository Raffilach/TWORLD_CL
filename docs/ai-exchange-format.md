# Формат обмена с нейросетями

Документ описывает, как выгрузить данные для языковой модели и как принять
рекомендацию обратно. Всё доступно и через REST API, и через MCP-сервер.

---

## 1. Единицы измерения — правила без исключений

| Величина | Единица | Тип |
|---|---|---|
| Вес снаряда и тела | килограммы | число |
| Длительность упражнения, отдыха, сна | **целые секунды** (сон — минуты) | целое |
| Обхваты | сантиметры | число |
| Объём жидкости | миллилитры | целое |
| Дистанция | метры | целое |
| Дата | `YYYY-MM-DD` | строка |
| Момент времени | ISO 8601 с таймзоной | строка |

**`duration_seconds` — это всегда секунды.** `85` означает 1 минуту 25 секунд.
Формата «1:15:37» в API не существует ни на вход, ни на выход: именно он
однажды превратил 1 мин 15 сек в 1 час 15 минут и сломал все агрегаты.

**Односторонние упражнения.** Если у упражнения `is_unilateral: true`, вес
указан **на одну сторону**. Тоннаж считается как `вес × повторы × 2`.
Молотки «16 кг на руку» — это 32 кг нагрузки, а не 16.

---

## 2. Выгрузка контекста

### `GET /api/context/`

| Параметр | Значение |
|---|---|
| `from`, `to` | период, `YYYY-MM-DD`. По умолчанию — последние 90 дней |
| `format` | `json` (по умолчанию) или `markdown` |
| `sections` | через запятую: `profile,goals,measurements,workouts,habits,sleep,nutrition,injuries,limits,analytics` |
| `include_journal` | `1` — добавить записи дневника. **По умолчанию дневник не выгружается** |

Авторизация: `Authorization: Token twk_...` (персональный токен) либо
`Authorization: Bearer <jwt>` (сессия приложения).

```bash
curl -H "Authorization: Token twk_..." \
  "https://example.com/api/context/?from=2026-06-01&format=markdown"
```

### Структура JSON

```jsonc
{
  "generated_at": "2026-09-18T18:00:00Z",
  "period": {"from": "2026-06-20", "to": "2026-09-18"},
  "units": {"weight": "kg", "duration": "seconds (integer)", "...": "..."},

  "profile":  { "username", "sex", "height_cm", "protein_target_g", "bedtime_goal",
                "tracks_calories" },
  "goals":    { "goal_weight_kg", "goal_bodyfat_pct", "goal_deadline", "standards": [] },

  "measurements": {
    "weight_trend": { "trend_kg", "raw_kg", "change_7d", "change_30d" },
    "weight_points": [ { "date", "trend_kg", "raw_kg" } ],
    "tape":          [ { "date", "site", "value_cm" } ],
    "composition_scans": [ { "at", "body_fat_pct", "skeletal_muscle_kg",
                             "total_water_l", "segments": [] } ]
  },

  "workouts": {
    "sessions": [ {
      "date", "template", "gym", "duration_seconds", "tonnage_kg",
      "wellbeing_1_10", "trained_while_injured", "note",
      "exercises": [ {
        "exercise", "block",            // required | main | optional
        "status",                       // done | skipped | failed
        "fail_reason",                  // machine_busy | pain | no_time | no_energy | forgot
        "counts_against_discipline",    // false = пропуск по внешней причине
        "unilateral", "note",
        "sets": [ { "set", "warmup", "weight_kg", "per_side", "reps",
                    "duration_seconds", "rir", "note" } ]
      } ]
    } ],
    "personal_records": [ { "exercise", "kind", "value", "date" } ]
  },

  "habits":  { "items": [ { "name", "decision_date", "days_since_decision",
                            "current_streak", "total_clean_days", "episodes": [] } ],
               "craving_patterns": { "riskiest_hour", "by_trigger", "what_helps" } },
  "sleep":   { "debt", "bedtime", "nights": [ { "night_of", "minutes", "quality" } ] },
  "nutrition": { "protein_by_day": [], "exceptions": [ { "kind", "count" } ] },
  "injuries":  { "items": [ { "body_part", "side", "started_on", "resolved_on",
                              "severity", "note", "history": [] } ],
                 "recurrences": [] },
  "limits":    { "weight_limits": [ { "exercise", "max_weight_kg", "reason" } ],
                 "planned_exclusions": [] },
  "analytics": { "correlations": [ { "title", "rho", "strength", "samples" } ],
                 "weak_link": { "title", "detail", "focus" } }
}
```

### Что важно знать модели, читающей эти данные

- **`status: "failed"` с `counts_against_discipline: false`** — это не лень.
  Тренажёр был занят, было больно или не хватило времени. Такой пропуск
  не должен влиять на оценку дисциплины.
- **`block: "required"`** — обязательный блок. Если он закрыт, день выполнен,
  даже когда `main` и `optional` пропущены целиком.
- **`warmup: true`** — разминочный подход, в рабочий объём не входит.
- **`trend_kg` важнее `raw_kg`.** Разница между утренним и вечерним весом
  доходит до 3 кг; выводы делаются по тренду.
- **Заметки читать обязательно.** «Сил не было совсем» и «заболело левое
  плечо после разведений» объясняют цифры лучше, чем сами цифры.
- **`limits.weight_limits`** — персональные потолки с причиной. Рекомендация
  превысить их без обсуждения причины некорректна.

---

## 3. Компактный markdown

`GET /api/context/?format=markdown` — готовый к вставке в диалог документ.

Дополнительно:

| Эндпоинт | Что отдаёт |
|---|---|
| `GET /api/workouts/{id}/markdown/` | одна тренировка (кнопка «Скопировать для ИИ») |
| `GET /api/reports/weekly/{id}/markdown/` | неделя целиком |

Пример фрагмента:

```markdown
### 2026-09-16 · Верх тела · 1:08:00 · тоннаж 8836 кг · самочувствие 7/10
- Жим в тренажёре на грудь: разм. 38.1×12, 63.5×11@RIR2, 63.5×10@RIR1
- Молотки с гантелями (на одну сторону): 14/сторону×12, 14/сторону×11
- Скручивания на блоке: failed, причина: no_time
- заметка к тренировке: Сил не было совсем.
```

---

## 4. Приём рекомендации обратно

### `POST /api/plans/import/`

```json
{
  "text": "...markdown или json...",
  "format": "markdown",
  "dry_run": false
}
```

`dry_run: true` — только разобрать и показать результат, ничего не создавая.

### Формат markdown (рекомендуемый)

```markdown
# Верх тела — вариант A

## Обязательный
| Упражнение | Подходы | Повторы | Вес | Отдых | Заметка |
|---|---|---|---|---|---|
| Жим штанги лёжа | 4 | 6-8 | 62.5 | 150 | первым, пока свежий |
| Тяга верхнего блока | 4 | 8-12 | 54.4 | 120 | |

## Основной
| Упражнение | Подходы | Повторы | Вес | Отдых |
|---|---|---|---|---|
| Молотки с гантелями | 3 | 10-14 | 14 | 60 |

## По остатку сил
| Упражнение | Подходы | Повторы | Вес | Отдых |
|---|---|---|---|---|
| Планка | 3 | 60 сек | — | 60 |
```

Правила разбора:

- `# Заголовок` — название шаблона.
- `## Заголовок` — блок. Приоритет распознаётся по названию:
  `Обязательный` → `required`, `Основной` → `main`,
  `По остатку сил` / `Опционально` → `optional`. Неизвестное название → `main`.
- Колонки по порядку: упражнение, подходы, повторы, вес, отдых, заметка.
  Хватает и первых двух.
- Повторы: `10` или диапазон `8-12`. Для статики — `60 сек` (пишется
  в `target_seconds`, в секундах).
- Вес: число, `—` или пусто, если веса нет. Десятичный разделитель — точка или запятая.
- Отдых — в секундах.
- **Упражнение, которого нет в базе, не теряется:** оно создаётся в личной
  библиотеке пользователя, а его название возвращается в `created_exercises`.

### Формат JSON (эквивалент)

```json
{
  "name": "Верх тела — вариант A",
  "blocks": [
    {
      "name": "Обязательный",
      "priority": "required",
      "exercises": [
        {"exercise": "Жим штанги лёжа", "sets": 4, "reps_min": 6, "reps_max": 8,
         "weight_kg": 62.5, "rest_seconds": 150, "note": "первым, пока свежий"}
      ]
    },
    {
      "name": "По остатку сил",
      "priority": "optional",
      "exercises": [{"exercise": "Планка", "sets": 3, "seconds": 60}]
    }
  ]
}
```

Ответ:

```json
{
  "id": 7,
  "template": { "...полный шаблон..." },
  "created_exercises": ["Жим Свенда"],
  "parsed": { "...разобранная структура..." }
}
```

### Рекомендации к содержанию плана

- **Блок «Обязательный» держите коротким** — 2–4 упражнения. Его смысл в том,
  чтобы человек мог закрыть день даже без сил. Если туда положить всё,
  механика перестаёт работать.
- **Порядок внутри блока имеет значение.** Упражнение в конце списка
  пропускается чаще; важное ставьте первым.
- Учитывайте `limits.weight_limits` и активные травмы из контекста.

---

## 5. Импорт данных Apple Health

`POST /api/health/import/` — один эндпоинт для Apple Shortcuts и для выгрузки
`export.zip`. Повторная отправка тех же данных дублей не создаёт
(дедупликация по `external_id`), а **ручной ввод импорт не перезаписывает**.

```json
{
  "source": "shortcut",
  "metrics": [
    {"type": "steps", "date": "2026-09-17", "value": 9120, "id": "s-2026-09-17"},
    {"type": "resting_hr", "date": "2026-09-17", "value": 54, "id": "hr-2026-09-17"}
  ],
  "sleep": [
    {"night_of": "2026-09-17", "bed_time": "2026-09-17T23:40:00+03:00",
     "wake_time": "2026-09-18T07:10:00+03:00", "duration_minutes": 450, "id": "sl-1"}
  ],
  "workouts": [
    {"date": "2026-09-17", "type": "walking", "distance_m": 4300, "id": "w-1"}
  ]
}
```

Поддерживаемые `type`: `steps`, `resting_hr`, `heart_rate`, `active_energy`,
`workout_minutes`, `distance`, `hrv`.

Блок `workouts` используется для автозачёта челленджей: правило вида
`{"metric": "distance_m", "min_value": 4000, "single_activity": true}`
засчитывает только те активности, которые проходят критерий.

---

## 6. MCP-сервер

Отдельный опциональный процесс, `backend/mcp_server/`. Авторизация —
персональным токеном пользователя.

```bash
pip install -r backend/mcp_server/requirements.txt
TWORLD_API_URL=https://example.com/api TWORLD_TOKEN=twk_... \
  python -m mcp_server.server
```

| Инструмент | Назначение | Нужен скоуп |
|---|---|---|
| `get_workouts` | история тренировок с подходами и заметками | read |
| `get_measurements` | вес, тренд, обхваты, состав тела | read |
| `get_habits` | привычки, срывы, карта тяги | read |
| `get_context` | весь контекст одним markdown | read |
| `get_weekly_summary` | метрики недели, слабое звено, фокус | read |
| `get_exercise_history` | график и рекорды по упражнению | read |
| `search_exercises` | поиск `exercise_id` по названию | read |
| `log_workout` | записать выполненную тренировку | **write** |
| `create_plan` | создать шаблон из рекомендации | **write** |

Токен со скоупом `read` получает `403` на любую запись — это проверяется
на сервере, а не в клиенте.

---

## 7. Экспорт всех данных

| Эндпоинт | Формат |
|---|---|
| `GET /api/accounts/export/?format=json` | один JSON со всеми таблицами |
| `GET /api/accounts/export/?format=csv` | zip с CSV по таблице на файл |

Пароли, хэши токенов и пин-код дневника в выгрузку не попадают.
Новые таблицы добавляются в экспорт автоматически: обходятся все модели,
у которых есть владелец.
