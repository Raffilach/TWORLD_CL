"""Сквозные сценарии: «Сегодня», оффлайн-синхронизация, обмен с ИИ, отчёт."""
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone


@pytest.mark.django_db
def test_today_endpoint_returns_everything_in_one_request(auth_api):
    """Главный экран собирается одним запросом — в метро это критично."""
    client, user = auth_api("today_one")
    client.post("/api/body/weight/", {"at": timezone.now().isoformat(),
                                      "weight_kg": "81.2"}, format="json")
    client.post("/api/nutrition/water/glass/", {}, format="json")
    client.post("/api/journal/daily/set/", {"mood_1_5": 4, "energy_1_5": 3}, format="json")

    response = client.get("/api/today/")
    assert response.status_code == 200
    payload = response.json()
    for key in ("weight", "workout", "nutrition", "sleep", "habits",
                "mood_energy", "evening_plan", "day_progress", "layout"):
        assert key in payload
    assert payload["weight"]["trend_kg"] is not None
    assert payload["nutrition"]["water_done_ml"] == 250
    assert payload["mood_energy"]["mood_1_5"] == 4
    # Пустое состояние подаётся нейтрально, без осуждения.
    assert payload["day_progress"]["tone"] == "neutral"


@pytest.mark.django_db
def test_evening_plan_does_the_arithmetic(auth_api):
    """«Во сколько выйти из зала, чтобы лечь вовремя»."""
    client, user = auth_api("evening_one")
    user.settings.bedtime_goal = "23:30"
    user.settings.commute_home_minutes = 60
    user.settings.wind_down_minutes = 60
    user.settings.save()

    response = client.get("/api/recovery/evening-plan/")
    assert response.json()["leave_gym_by"] == "21:30"


@pytest.mark.django_db
def test_sync_push_is_idempotent(auth_api):
    """Повтор операции после обрыва связи не создаёт дубль."""
    from apps.body.models import WeightEntry

    client, user = auth_api("syncer_one")
    op_id = str(uuid.uuid4())
    client_id = str(uuid.uuid4())
    operation = {
        "op_id": op_id,
        "entity": "weight_entry",
        "client_id": client_id,
        "op": "upsert",
        "client_updated_at": timezone.now().isoformat(),
        "payload": {"at": timezone.now().isoformat(), "weight_kg": "80.10"},
    }

    first = client.post("/api/sync/push/", {"operations": [operation]}, format="json")
    assert first.json()["results"][0]["status"] == "applied"

    second = client.post("/api/sync/push/", {"operations": [operation]}, format="json")
    assert second.json()["results"][0]["status"] == "duplicate"
    assert WeightEntry.objects.filter(user=user).count() == 1


@pytest.mark.django_db
def test_sync_push_cannot_write_to_another_user(auth_api):
    """Поле user в теле операции игнорируется."""
    from apps.body.models import WeightEntry

    client_a, user_a = auth_api("syncer_two")
    client_b, user_b = auth_api("syncer_three")

    client_b.post("/api/sync/push/", {"operations": [{
        "op_id": str(uuid.uuid4()), "entity": "weight_entry",
        "client_id": str(uuid.uuid4()), "op": "upsert",
        "payload": {"at": timezone.now().isoformat(), "weight_kg": "70",
                    "user": str(user_a.id), "user_id": str(user_a.id)},
    }]}, format="json")

    assert WeightEntry.objects.filter(user=user_a).count() == 0
    assert WeightEntry.objects.filter(user=user_b).count() == 1


@pytest.mark.django_db
def test_sync_pull_returns_tombstones(auth_api):
    """Удалённая оффлайн запись не воскресает при следующем pull."""
    from apps.body.models import WeightEntry

    client, user = auth_api("syncer_four")
    entry = WeightEntry.objects.create(user=user, at=timezone.now(), weight_kg=Decimal("80"))
    entry.soft_delete()

    response = client.get("/api/sync/pull/")
    rows = response.json()["changes"]["weight_entry"]
    assert rows and rows[0]["deleted_at"] is not None


@pytest.mark.django_db
def test_sync_rejects_unknown_entity(auth_api):
    client, user = auth_api("syncer_five")
    response = client.post("/api/sync/push/", {"operations": [{
        "op_id": str(uuid.uuid4()), "entity": "user", "payload": {"is_staff": True},
    }]}, format="json")
    assert response.json()["results"][0]["status"] == "rejected"


@pytest.mark.django_db
def test_ai_context_includes_notes_and_limits(auth_api):
    """Текстовые заметки часто важнее цифр — они должны попадать в контекст."""
    from apps.safety.models import WeightLimit
    from apps.training.models import Exercise, SessionExercise, SetLog, WorkoutSession

    client, user = auth_api("ai_one")
    exercise = Exercise.objects.create(
        owner=user, name="Разведения гантелей", is_unilateral=True)
    WeightLimit.objects.create(user=user, exercise=exercise, max_weight_kg=Decimal("63.5"),
                               reason="Спина")
    session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate(), status="completed",
        notes="Сил не было совсем.",
    )
    entry = SessionExercise.objects.create(
        user=user, session=session, exercise=exercise, status="done",
        notes="Заболело левое плечо после разведений.",
    )
    SetLog.objects.create(user=user, session_exercise=entry, set_number=1,
                          weight_kg=Decimal("16"), reps=10, weight_is_per_side=True)

    payload = client.get("/api/context/").json()
    assert payload["units"]["duration"].startswith("seconds")
    assert payload["limits"]["weight_limits"][0]["reason"] == "Спина"

    markdown = client.get("/api/context/?format=markdown").content.decode()
    assert "Заболело левое плечо после разведений." in markdown
    assert "Сил не было совсем." in markdown
    assert "не выше 63.5 кг" in markdown
    assert "на одну сторону" in markdown


@pytest.mark.django_db
def test_journal_excluded_from_context_by_default(auth_api):
    from apps.journal.models import JournalEntry

    client, user = auth_api("ai_two")
    JournalEntry.objects.create(user=user, date=timezone.localdate(),
                                at=timezone.now(), text="Очень личное")

    assert "journal" not in client.get("/api/context/").json()
    assert "Очень личное" in client.get("/api/context/?include_journal=1").content.decode()


@pytest.mark.django_db
def test_plan_import_from_markdown(auth_api):
    """Приём рекомендаций обратно: таблица упражнений → шаблон."""
    client, user = auth_api("ai_three")
    markdown = """# План на верх тела

## Обязательный
| Упражнение | Подходы | Повторы | Вес | Отдых |
|---|---|---|---|---|
| Жим штанги лёжа | 4 | 6-8 | 62.5 | 150 |
| Тяга верхнего блока | 4 | 8-12 | 54.4 | 120 |

## По остатку сил
| Упражнение | Подходы | Повторы | Вес | Отдых |
|---|---|---|---|---|
| Планка | 3 | 60 сек | — | 60 |
"""
    response = client.post("/api/plans/import/", {"text": markdown}, format="json")
    assert response.status_code == 201
    template = response.json()["template"]
    assert template["name"] == "План на верх тела"
    blocks = {block["priority"]: block for block in template["blocks"]}
    assert blocks["required"]["exercises"][0]["exercise_name"] == "Жим штанги лёжа"
    assert blocks["required"]["exercises"][0]["target_reps_max"] == 8
    assert float(blocks["required"]["exercises"][0]["target_weight_kg"]) == 62.5
    assert "optional" in blocks


@pytest.mark.django_db
def test_plan_import_from_json(auth_api):
    client, user = auth_api("ai_four")
    payload = (
        '{"name": "Ноги", "blocks": [{"name": "Обязательный", "priority": "required",'
        ' "exercises": [{"exercise": "Жим ногами", "sets": 4, "reps_min": 10,'
        ' "reps_max": 14, "weight_kg": 140}]}]}'
    )
    response = client.post("/api/plans/import/",
                           {"text": payload, "format": "json"}, format="json")
    assert response.status_code == 201
    assert response.json()["template"]["name"] == "Ноги"


@pytest.mark.django_db
def test_weekly_report_and_public_link(auth_api, api):
    """Отчёт, публичная ссылка и её отзыв."""
    from apps.accounts.models import ShareLink

    client, user = auth_api("reporter_one")
    client.post("/api/body/weight/", {"at": timezone.now().isoformat(),
                                      "weight_kg": "80.0"}, format="json")

    created = client.post("/api/reports/weekly/", {"variant": "coach"}, format="json")
    assert created.status_code == 201
    assert created.json()["focus_next_week"]  # один фокус на неделю всегда есть
    report_id = created.json()["id"]

    html = client.get(f"/api/reports/weekly/{report_id}/html/").content.decode()
    assert "Слабое звено недели" in html
    assert "Один фокус на следующую неделю" in html

    shared = client.post(f"/api/reports/weekly/{report_id}/share/", {}, format="json")
    slug = shared.json()["slug"]
    assert api.get(f"/s/{slug}").status_code == 200  # доступно анонимно

    link = ShareLink.objects.get(slug=slug)
    client.post(f"/api/share-links/{link.id}/revoke/", {}, format="json")
    assert api.get(f"/s/{slug}").status_code == 410  # отозвано


@pytest.mark.django_db
def test_notifications_capped_at_two_per_day(auth_api):
    client, user = auth_api("notified_one")
    user.notification_settings.habit_risk_reminder_enabled = True
    user.notification_settings.save()

    response = client.get("/api/notifications/schedule/")
    payload = response.json()
    assert payload["max_per_day"] == 2
    assert len(payload["items"]) <= 2
    for item in payload["items"]:
        text = f"{item['title']} {item['body']}".lower()
        for shaming in ("пропустил", "опять", "снова", "обещал", "!"):
            assert shaming not in text


@pytest.mark.django_db
def test_export_contains_user_data_and_no_secrets(auth_api):
    from apps.training.models import Gym

    client, user = auth_api("exporter_one")
    Gym.objects.create(user=user, name="Мой зал")

    payload = client.get("/api/accounts/export/?format=json").json()
    assert payload["user"]["username"] == "exporter_one"
    assert any("Мой зал" in str(row) for row in payload["tables"].get("training.gym", []))
    assert "password" not in str(payload)

    archive = client.get("/api/accounts/export/?format=csv")
    assert archive["Content-Type"] == "application/zip"


@pytest.mark.django_db
def test_health_import_deduplicates(auth_api):
    """Повторная отправка тех же данных из Shortcuts не плодит записи."""
    from apps.recovery.models import HealthMetric, SleepEntry

    client, user = auth_api("health_one")
    night = (timezone.localdate() - timedelta(days=1)).isoformat()
    payload = {
        "source": "shortcut",
        "metrics": [{"type": "steps", "date": night, "value": 9120, "id": "s1"}],
        "sleep": [{"night_of": night, "duration_minutes": 445, "id": "sl1"}],
    }
    client.post("/api/health/import/", payload, format="json")
    client.post("/api/health/import/", payload, format="json")

    assert HealthMetric.objects.filter(user=user, kind="steps").count() == 1
    assert SleepEntry.objects.filter(user=user).count() == 1


@pytest.mark.django_db
def test_manual_sleep_is_not_overwritten_by_import(auth_api):
    """Ручной ввод — правка, а не жертва импорта."""
    from apps.recovery.models import SleepEntry

    client, user = auth_api("health_two")
    night = timezone.localdate() - timedelta(days=1)
    SleepEntry.objects.create(user=user, night_of=night, duration_minutes=430,
                              source=SleepEntry.Source.MANUAL)

    client.post("/api/health/import/", {
        "source": "shortcut",
        "sleep": [{"night_of": night.isoformat(), "duration_minutes": 60, "id": "x"}],
    }, format="json")

    entry = SleepEntry.objects.get(user=user, night_of=night)
    assert entry.duration_minutes == 430
    assert entry.source == SleepEntry.Source.MANUAL


@pytest.mark.django_db
def test_start_workout_expands_the_plan_in_one_call(auth_api):
    """Старт одной кнопкой: план уже развёрнут в упражнения."""
    from apps.training.models import Exercise, TemplateBlock, TemplateExercise, WorkoutTemplate

    client, user = auth_api("starter_one")
    template = WorkoutTemplate.objects.create(user=user, name="Верх")
    block = TemplateBlock.objects.create(template=template, priority="required", order=0)
    for name in ("Жим штанги лёжа", "Тяга верхнего блока"):
        TemplateExercise.objects.create(
            block=block, exercise=Exercise.objects.get(owner=None, name=name), target_sets=3
        )

    response = client.post(f"/api/templates/{template.id}/start/", {}, format="json")
    assert response.status_code == 201
    assert len(response.json()["exercises"]) == 2
    assert response.json()["status"] == "in_progress"
    assert response.json()["started_at"]


@pytest.mark.django_db
def test_repeat_last_copies_all_sets(auth_api):
    """«Как в прошлый раз» — один тап вместо ручного ввода всех подходов."""
    from apps.training.models import Exercise, SessionExercise, SetLog, WorkoutSession

    client, user = auth_api("repeater_one")
    exercise = Exercise.objects.create(owner=user, name="Жим")
    old_session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate() - timedelta(days=3), status="completed")
    old_entry = SessionExercise.objects.create(
        user=user, session=old_session, exercise=exercise, status="done")
    for number, weight in enumerate([62.5, 62.5, 60], start=1):
        SetLog.objects.create(user=user, session_exercise=old_entry, set_number=number,
                              weight_kg=Decimal(str(weight)), reps=10)

    new_session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate(), status="in_progress")
    new_entry = SessionExercise.objects.create(
        user=user, session=new_session, exercise=exercise)

    response = client.post(f"/api/session-exercises/{new_entry.id}/repeat_last/",
                           {}, format="json")
    assert response.status_code == 201
    assert len(response.json()["sets"]) == 3
    assert response.json()["status"] == "done"
