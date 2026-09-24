"""Правила, ради которых проект переписывается: тоннаж, секунды, три состояния."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone


@pytest.fixture
def workout(make_user):
    from apps.catalog.models import Equipment
    from apps.training.models import Exercise, Gym, SessionExercise, WorkoutSession

    user = make_user("lifter_one")
    gym = Gym.objects.create(user=user, name="Зал", is_default=True)
    exercise = Exercise.objects.create(
        owner=user, name="Молотки", is_unilateral=True,
        equipment=Equipment.objects.get(code="dumbbell"),
    )
    session = WorkoutSession.objects.create(
        user=user, gym=gym, date=timezone.localdate(),
        started_at=timezone.now(), status="in_progress",
    )
    entry = SessionExercise.objects.create(
        user=user, session=session, exercise=exercise, block_priority="required"
    )
    return user, session, entry, exercise


@pytest.mark.django_db
def test_unilateral_weight_counts_twice(workout):
    """«16 кг на руку» — это 32 кг нагрузки, иначе тоннаж занижен вдвое."""
    from apps.training.models import SetLog

    user, session, entry, _ = workout
    SetLog.objects.create(
        user=user, session_exercise=entry, set_number=1,
        weight_kg=Decimal("16"), reps=10, weight_is_per_side=True,
    )
    session.recalculate()
    assert session.tonnage_kg == Decimal("320.00")


@pytest.mark.django_db
def test_warmup_sets_excluded_from_tonnage(workout):
    from apps.training.models import SetLog

    user, session, entry, _ = workout
    SetLog.objects.create(user=user, session_exercise=entry, set_number=1,
                          weight_kg=Decimal("10"), reps=12, is_warmup=True)
    SetLog.objects.create(user=user, session_exercise=entry, set_number=2,
                          weight_kg=Decimal("20"), reps=10)
    session.recalculate()
    assert session.tonnage_kg == Decimal("200.00")
    assert session.working_sets_count == 1


@pytest.mark.django_db
def test_unilateral_flag_snapshot_survives_exercise_change(workout):
    """Смена флага у упражнения не переписывает историю задним числом."""
    from apps.training.models import SetLog

    user, session, entry, exercise = workout
    SetLog.objects.create(user=user, session_exercise=entry, set_number=1,
                          weight_kg=Decimal("16"), reps=10, weight_is_per_side=True)
    exercise.is_unilateral = False
    exercise.save()
    session.recalculate()
    assert session.tonnage_kg == Decimal("320.00")


@pytest.mark.django_db
def test_static_hold_stored_as_integer_seconds(auth_api):
    """«1:15:37» записать невозможно: поле принимает только секунды."""
    from apps.training.models import Exercise, SessionExercise, WorkoutSession

    client, user = auth_api("planker_one")
    exercise = Exercise.objects.create(owner=user, name="Планка", load_type="time")
    session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate(), status="in_progress")
    entry = SessionExercise.objects.create(user=user, session=session, exercise=exercise)

    response = client.post("/api/sets/", {
        "session_exercise": entry.id, "set_number": 1, "duration_seconds": 85,
    }, format="json")
    assert response.status_code == 201
    assert response.json()["duration_seconds"] == 85
    assert response.json()["duration_label"] == "1:25"

    # 1 ч 15 мин 37 с = 4537 с — допустимо. А «время суток» как число секунд — нет.
    too_big = client.post("/api/sets/", {
        "session_exercise": entry.id, "set_number": 2, "duration_seconds": 90000,
    }, format="json")
    assert too_big.status_code == 400


@pytest.mark.django_db
def test_each_static_attempt_is_a_separate_row(auth_api):
    """Запись попытки не обнуляет и не перезаписывает предыдущую."""
    from apps.training.models import Exercise, SessionExercise, SetLog, WorkoutSession

    client, user = auth_api("planker_two")
    exercise = Exercise.objects.create(owner=user, name="Вис", load_type="time")
    session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate(), status="in_progress")
    entry = SessionExercise.objects.create(user=user, session=session, exercise=exercise)

    for number, seconds in enumerate([74, 68, 44], start=1):
        client.post("/api/sets/", {
            "session_exercise": entry.id, "set_number": number,
            "duration_seconds": seconds,
        }, format="json")

    attempts = list(SetLog.objects.filter(session_exercise=entry).order_by("set_number"))
    assert [item.duration_seconds for item in attempts] == [74, 68, 44]


@pytest.mark.django_db
def test_external_fail_reason_does_not_hurt_discipline(auth_api):
    """Тренажёр занят — не вина пользователя, дисциплина не падает."""
    from apps.training.models import Exercise, SessionExercise, WorkoutSession
    from apps.training.services import discipline_stats

    client, user = auth_api("disciplined_one")
    session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate(), status="in_progress")
    done = Exercise.objects.create(owner=user, name="Сделанное")
    busy = Exercise.objects.create(owner=user, name="Занятое")
    lazy = Exercise.objects.create(owner=user, name="Забытое")

    a = SessionExercise.objects.create(user=user, session=session, exercise=done)
    b = SessionExercise.objects.create(user=user, session=session, exercise=busy)
    c = SessionExercise.objects.create(user=user, session=session, exercise=lazy)

    client.post(f"/api/session-exercises/{a.id}/mark/", {"status": "done"}, format="json")
    busy_response = client.post(
        f"/api/session-exercises/{b.id}/mark/",
        {"status": "failed", "fail_reason": "machine_busy"}, format="json",
    )
    client.post(f"/api/session-exercises/{c.id}/mark/",
                {"status": "failed", "fail_reason": "forgot"}, format="json")

    assert busy_response.status_code == 200
    assert busy_response.json()["counts_against_discipline"] is False
    assert "alternatives" in busy_response.json()

    stats = discipline_stats(user, timezone.localdate(), timezone.localdate())
    assert stats["done"] == 1
    assert stats["excused"] == 1
    assert stats["counted_misses"] == 1
    assert stats["discipline_percent"] == 50


@pytest.mark.django_db
def test_failed_status_requires_reason(auth_api):
    from apps.training.models import Exercise, SessionExercise, WorkoutSession

    client, user = auth_api("reasoned_one")
    session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate(), status="in_progress")
    exercise = Exercise.objects.create(owner=user, name="Тяга")
    entry = SessionExercise.objects.create(user=user, session=session, exercise=exercise)

    assert client.post(f"/api/session-exercises/{entry.id}/mark/",
                       {"status": "failed"}, format="json").status_code == 400


@pytest.mark.django_db
def test_required_block_completes_the_day(make_user):
    """Сделан обязательный блок — день выполнен, а не провален."""
    from apps.training.models import Exercise, SessionExercise, WorkoutSession
    from apps.training.services import session_completion

    user = make_user("blocked_one")
    session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate(), status="in_progress")
    required = Exercise.objects.create(owner=user, name="Обязательное")
    optional = Exercise.objects.create(owner=user, name="По остатку")

    SessionExercise.objects.create(user=user, session=session, exercise=required,
                                   block_priority="required", status="done")
    SessionExercise.objects.create(user=user, session=session, exercise=optional,
                                   block_priority="optional", status="skipped")

    completion = session_completion(session)
    assert completion["required_done"] is True
    assert completion["blocks"]["optional"] == {"done": 0, "total": 1}


@pytest.mark.django_db
def test_weight_steps_follow_the_machine_grid(make_user):
    """Кнопки +/- ходят по фактической сетке тренажёра, а не по «+2,5 кг»."""
    from apps.training.models import Exercise, Gym, GymExerciseProfile

    user = make_user("stepper_one")
    gym = Gym.objects.create(user=user, name="Зал")
    exercise = Exercise.objects.create(owner=user, name="Тяга блока")
    profile = GymExerciseProfile.objects.create(
        user=user, gym=gym, exercise=exercise,
        weight_steps=[36.2, 40.8, 45.3, 49.8, 54.4, 58.9],
    )
    assert profile.next_step(45.3, 1) == Decimal("49.8")
    assert profile.next_step(45.3, -1) == Decimal("40.8")
    assert profile.next_step(58.9, 1) == Decimal("58.9")  # выше сетки не уходим


@pytest.mark.django_db
def test_weight_limit_warns_but_does_not_block(auth_api):
    """Лимит — напоминание с причиной, а не запрет."""
    from apps.safety.models import WeightLimit
    from apps.training.models import Exercise, SessionExercise, WorkoutSession

    client, user = auth_api("limited_one")
    exercise = Exercise.objects.create(owner=user, name="Скручивания")
    WeightLimit.objects.create(user=user, exercise=exercise, max_weight_kg=Decimal("63.5"),
                               reason="Спина")
    session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate(), status="in_progress")
    entry = SessionExercise.objects.create(user=user, session=session, exercise=exercise)

    response = client.post("/api/sets/", {
        "session_exercise": entry.id, "set_number": 1, "weight_kg": 70, "reps": 10,
    }, format="json")
    assert response.status_code == 201  # запись прошла
    warning = response.json()["warnings"][0]
    assert warning["blocking"] is False
    assert "Спина" in warning["reason"]


@pytest.mark.django_db
def test_spike_warning_after_fast_jump(make_user):
    """Рост больше 10% за неделю помечается: связки медленнее мышц."""
    from apps.training.models import Exercise, SessionExercise, SetLog, WorkoutSession
    from apps.training.services import analyze_exercise

    user = make_user("spiker_one")
    exercise = Exercise.objects.create(owner=user, name="Жим гантелей")
    today = timezone.localdate()
    for offset, weight in [(10, 8), (3, 16)]:
        session = WorkoutSession.objects.create(
            user=user, date=today - timedelta(days=offset), status="completed")
        entry = SessionExercise.objects.create(
            user=user, session=session, exercise=exercise, status="done")
        SetLog.objects.create(user=user, session_exercise=entry, set_number=1,
                              weight_kg=Decimal(str(weight)), reps=10)

    kinds = [hint["kind"] for hint in analyze_exercise(user, exercise)]
    assert "spike_warning" in kinds


@pytest.mark.django_db
def test_skip_streak_suggests_reordering(make_user):
    """Пропущено подряд — предложить поставить раньше."""
    from apps.training.models import Exercise, SessionExercise, WorkoutSession
    from apps.training.services import analyze_exercise, skip_streak

    user = make_user("skipper_one")
    exercise = Exercise.objects.create(owner=user, name="Скручивания")
    today = timezone.localdate()
    for offset in range(6):
        session = WorkoutSession.objects.create(
            user=user, date=today - timedelta(days=offset * 2), status="completed")
        SessionExercise.objects.create(
            user=user, session=session, exercise=exercise, status="skipped")

    assert skip_streak(user, exercise) == 6
    assert "order_hint" in [hint["kind"] for hint in analyze_exercise(user, exercise)]


@pytest.mark.django_db
def test_global_library_is_shared_but_not_editable(auth_api):
    """Общая база упражнений видна всем, но правится только через копию."""
    from apps.training.models import Exercise

    client, user = auth_api("librarian_one")
    global_exercise = Exercise.objects.get(owner=None, name="Жим штанги лёжа")

    assert client.get(f"/api/exercises/{global_exercise.id}/").status_code == 200
    assert client.get(f"/api/exercises/{global_exercise.id}/progression/").status_code == 200
    assert client.patch(f"/api/exercises/{global_exercise.id}/",
                        {"name": "Переименовано"}, format="json").status_code == 403

    copied = client.post(f"/api/exercises/{global_exercise.id}/copy/", {}, format="json")
    assert copied.status_code == 201
    assert copied.json()["name"] == "Жим штанги лёжа (моё)"
    assert client.patch(f"/api/exercises/{copied.json()['id']}/",
                        {"is_unilateral": True}, format="json").status_code == 200


@pytest.mark.django_db
def test_other_users_custom_exercise_stays_private(auth_api):
    from apps.training.models import Exercise

    client_a, user_a = auth_api("librarian_two")
    client_b, user_b = auth_api("librarian_three")
    private = Exercise.objects.create(owner=user_a, name="Секретное упражнение")

    listed = client_b.get("/api/exercises/").json()["results"]
    assert private.id not in [item["id"] for item in listed]
    assert client_b.get(f"/api/exercises/{private.id}/").status_code == 404
