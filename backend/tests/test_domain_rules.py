"""Привычки, вес, сон, питание — правила, влияющие на мотивацию."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone


@pytest.mark.django_db
def test_relapse_does_not_erase_history(make_user):
    """Срыв обнуляет только серию. «Дней с решения» не сбрасывается никогда."""
    from apps.habits.models import Habit, HabitEpisode

    user = make_user("quitter_one")
    today = date.today()
    habit = Habit.objects.create(
        user=user, name="Без сладкого", decision_date=today - timedelta(days=300)
    )
    assert habit.current_streak(today) == 300

    HabitEpisode.objects.create(
        user=user, habit=habit,
        occurred_at=timezone.make_aware(
            timezone.datetime.combine(today - timedelta(days=5), timezone.datetime.min.time())
        ),
    )
    assert habit.days_since_decision(today) == 300      # не обнулилось
    assert habit.current_streak(today) == 5             # началась новая
    assert habit.total_clean_days(today) == 299         # накопленное осталось


@pytest.mark.django_db
def test_backdated_episode_recalculates_honestly(make_user):
    """Отметка задним числом пересчитывает серии, а не ломает их."""
    from apps.habits.models import Habit, HabitEpisode

    user = make_user("quitter_two")
    today = date.today()
    habit = Habit.objects.create(
        user=user, name="Без алкоголя", decision_date=today - timedelta(days=100)
    )
    HabitEpisode.objects.create(
        user=user, habit=habit,
        occurred_at=timezone.make_aware(
            timezone.datetime.combine(today - timedelta(days=2), timezone.datetime.min.time())
        ),
    )
    assert habit.current_streak(today) == 2
    assert habit.total_clean_days(today) == 99


@pytest.mark.django_db
def test_relapse_endpoint_is_not_shaming(auth_api):
    from apps.habits.models import Habit

    client, user = auth_api("quitter_three")
    habit = Habit.objects.create(
        user=user, name="Без сахара", decision_date=date.today() - timedelta(days=50)
    )
    response = client.post(f"/api/habits/{habit.id}/episode/", {"note": "стресс"},
                           format="json")
    assert response.status_code == 201
    message = response.json()["message"]
    for shaming in ("провал", "опять", "снова", "подвёл", "!"):
        assert shaming not in message.lower()
    assert response.json()["stats"]["days_since_decision"] == 50


@pytest.mark.django_db
def test_trend_weight_smooths_a_noisy_week(make_user):
    """+1,7 кг за день не должны превращаться в +1,7 кг тренда."""
    from apps.body.models import WeightEntry, WeightTrendPoint
    from apps.body.services import rebuild_trend, trend_summary

    user = make_user("weigher_one")
    today = timezone.localdate()
    for offset in range(8, 0, -1):
        WeightEntry.objects.create(
            user=user,
            at=timezone.make_aware(
                timezone.datetime.combine(today - timedelta(days=offset),
                                          timezone.datetime.min.time().replace(hour=8))
            ),
            weight_kg=Decimal("80.00"),
        )
    WeightEntry.objects.create(
        user=user,
        at=timezone.make_aware(
            timezone.datetime.combine(today, timezone.datetime.min.time().replace(hour=8))
        ),
        weight_kg=Decimal("81.70"),
    )
    rebuild_trend(user)
    summary = trend_summary(user, today)
    assert summary["raw_kg"] == Decimal("81.70")
    # Тренд сдвинулся заметно меньше, чем сырой вес.
    assert Decimal("80.0") < summary["trend_kg"] < Decimal("80.5")
    assert WeightTrendPoint.objects.filter(user=user).count() >= 8


@pytest.mark.django_db
def test_incomparable_conditions_are_flagged(auth_api):
    """Утренний натощак и вечерний замеры сравнивать нельзя."""
    from apps.body.models import WeightEntry

    client, user = auth_api("weigher_two")
    WeightEntry.objects.create(
        user=user, at=timezone.now() - timedelta(days=1), weight_kg=Decimal("80"),
        conditions={"morning": True, "fasted": True},
    )
    response = client.post("/api/body/weight/", {
        "at": timezone.now().isoformat(), "weight_kg": "82.5",
        "conditions": {"morning": False, "fasted": False},
    }, format="json")
    assert response.status_code == 201
    assert response.json()["comparability_note"]


@pytest.mark.django_db
def test_weight_response_leads_with_trend(auth_api):
    """Ответ на запись веса сразу отдаёт тренд — он и показывается крупно."""
    client, user = auth_api("weigher_three")
    response = client.post("/api/body/weight/", {
        "at": timezone.now().isoformat(), "weight_kg": "79.4",
    }, format="json")
    assert response.status_code == 201
    assert "trend" in response.json()
    assert response.json()["trend"]["trend_kg"] is not None


@pytest.mark.django_db
def test_sleep_is_stored_as_times_not_a_checkbox(auth_api):
    """Отбой и подъём — это время, а длительность считается сервером."""
    client, user = auth_api("sleeper_one")
    night = timezone.localdate() - timedelta(days=1)
    bed = timezone.make_aware(timezone.datetime.combine(
        night, timezone.datetime.min.time().replace(hour=23, minute=40)))
    wake = timezone.make_aware(timezone.datetime.combine(
        night + timedelta(days=1), timezone.datetime.min.time().replace(hour=7, minute=10)))

    response = client.post("/api/sleep/", {
        "night_of": night.isoformat(), "bed_time": bed.isoformat(),
        "wake_time": wake.isoformat(),
    }, format="json")
    assert response.status_code == 201
    assert response.json()["duration_minutes"] == 450
    assert response.json()["duration_label"] == "7 ч 30 мин"


@pytest.mark.django_db
def test_three_short_nights_warn_about_illness_not_blame(make_user):
    from apps.recovery.models import SleepEntry
    from apps.recovery.services import short_sleep_warning

    user = make_user("sleeper_two")
    today = timezone.localdate()
    for offset in (1, 2, 3):
        night = today - timedelta(days=offset)
        SleepEntry.objects.create(user=user, night_of=night, duration_minutes=320)

    warning = short_sleep_warning(user, today)
    assert warning is not None
    assert "заболеть" in warning["message"]
    assert "!" not in warning["message"]


@pytest.mark.django_db
def test_illness_days_are_excluded_from_discipline(make_user):
    from apps.recovery.models import IllnessPeriod
    from apps.training.models import Exercise, SessionExercise, WorkoutSession
    from apps.training.services import discipline_stats

    user = make_user("sick_one")
    today = timezone.localdate()
    IllnessPeriod.objects.create(user=user, date_from=today, date_to=today)
    session = WorkoutSession.objects.create(user=user, date=today, status="planned")
    exercise = Exercise.objects.create(owner=user, name="Жим")
    SessionExercise.objects.create(
        user=user, session=session, exercise=exercise, status="failed"
    )
    stats = discipline_stats(user, today, today)
    assert stats["illness_days_excluded"] == 1
    assert stats["discipline_percent"] is None


@pytest.mark.django_db
def test_sugary_drinks_counted_separately(auth_api):
    """Стакан сока — отдельная строка, а не «еда»."""
    from apps.nutrition.models import DietExceptionLog

    client, user = auth_api("drinker_one")
    DietExceptionLog.objects.create(user=user, at=timezone.now(), kind="sugary_drink",
                                    estimated_sugar_g=Decimal("25"))
    DietExceptionLog.objects.create(user=user, at=timezone.now(), kind="sweets")

    response = client.get("/api/nutrition/exceptions/weekly/")
    kinds = {item["kind"]: item for item in response.json()["items"]}
    assert "sugary_drink" in kinds and "sweets" in kinds
    assert float(kinds["sugary_drink"]["estimated_sugar_g"]) == 25.0


@pytest.mark.django_db
def test_calories_are_off_by_default(auth_api):
    """Обязательный подсчёт калорий — главная причина, по которой бросают."""
    client, user = auth_api("eater_one")
    response = client.get("/api/nutrition/today/")
    assert response.json()["track_calories"] is False


@pytest.mark.django_db
def test_protein_logged_in_one_tap(auth_api):
    from apps.nutrition.models import FoodItem

    client, user = auth_api("eater_two")
    food = FoodItem.objects.filter(owner=None, is_quick_button=True).first()
    response = client.post("/api/nutrition/meals/quick-protein/",
                           {"food_item": food.id}, format="json")
    assert response.status_code == 201
    assert Decimal(response.json()["protein_g"]) == food.protein_g


@pytest.mark.django_db
def test_injury_flags_overhead_exercises_and_detects_recurrence(auth_api):
    """Травма плеча → «осторожно» на всё над головой; второй эпизод за 60 дней заметен."""
    from apps.catalog.models import BodyPart
    from apps.safety.models import Injury

    client, user = auth_api("injured_one")
    shoulder = BodyPart.objects.get(code="shoulder_l")
    today = timezone.localdate()

    first = client.post("/api/injuries/", {
        "body_part": shoulder.id, "side": "left", "character": "sharp",
        "started_on": (today - timedelta(days=30)).isoformat(), "initial_severity": 6,
    }, format="json")
    assert first.status_code == 201
    flagged = {item["exercise_name"] for item in first.json()["affected_exercises"]}
    assert "Жим штанги стоя" in flagged
    assert first.json()["recurrence_notice"] is None

    second = client.post("/api/injuries/", {
        "body_part": shoulder.id, "side": "left", "character": "ache",
        "started_on": today.isoformat(), "initial_severity": 4,
    }, format="json")
    notice = second.json()["recurrence_notice"]
    assert notice is not None
    assert notice["days_between"] == 30
    assert "врачу" in notice["message"]


@pytest.mark.django_db
def test_return_test_gates_the_exercise(auth_api):
    from apps.catalog.models import BodyPart
    from apps.safety.models import Injury
    from apps.training.models import Exercise

    client, user = auth_api("injured_two")
    injury = Injury.objects.create(
        user=user, body_part=BodyPart.objects.get(code="shoulder_r"),
        started_on=timezone.localdate(), initial_severity=5,
    )
    exercise = Exercise.objects.filter(owner=None, name="Жим штанги стоя").first()

    still_hurts = client.post("/api/return-tests/", {
        "injury": injury.id, "exercise": exercise.id,
        "date": timezone.localdate().isoformat(), "pain_without_weight": True,
    }, format="json")
    assert still_hurts.json()["unlocked"] is False

    recovered = client.post("/api/return-tests/", {
        "injury": injury.id, "exercise": exercise.id,
        "date": timezone.localdate().isoformat(), "pain_without_weight": False,
    }, format="json")
    assert recovered.json()["unlocked"] is True


@pytest.mark.django_db
def test_feature_interest_is_recorded_once(auth_api):
    """Вкладка «Друзья» даёт реальный сигнал о востребованности."""
    from apps.accounts.models import FeatureInterest

    client, user = auth_api("friendly_one")
    assert client.post("/api/feature-interest/", {"feature": "friends"},
                       format="json").status_code == 201
    assert client.post("/api/feature-interest/", {"feature": "friends"},
                       format="json").status_code == 201
    assert FeatureInterest.objects.filter(user=user, feature="friends").count() == 1

    client.post("/api/feature-interest/",
                {"feature": "suggestion", "message": "Экспорт в Notion"}, format="json")
    client.post("/api/feature-interest/",
                {"feature": "suggestion", "message": "Интеграция с весами"}, format="json")
    assert FeatureInterest.objects.filter(user=user, feature="suggestion").count() == 2


@pytest.mark.django_db
def test_username_check_suggests_free_variants(api, make_user):
    make_user("raffilach")
    taken = api.get("/api/accounts/username-available/?u=raffilach")
    assert taken.json()["available"] is False
    assert len(taken.json()["suggestions"]) == 3

    short = api.get("/api/accounts/username-available/?u=abc")
    assert short.json()["valid"] is False

    free = api.get("/api/accounts/username-available/?u=raffilach_2")
    assert free.json()["available"] is True


@pytest.mark.django_db
def test_username_uniqueness_is_case_insensitive(api, make_user):
    make_user("raffilach")
    response = api.post("/api/auth/register/", {
        "username": "RaffiLach", "email": "other@example.com", "password": "pass12345",
    }, format="json")
    assert response.status_code == 400
