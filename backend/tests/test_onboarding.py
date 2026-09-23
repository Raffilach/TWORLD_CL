"""Стартовый опрос, приглашения на бету и лимиты на вход."""
import pytest
from django.core.cache import cache
from django.test import override_settings

from apps.accounts.models import InviteCode, User


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    # Счётчики лимитов живут в кэше — между тестами их надо обнулять.
    cache.clear()
    yield
    cache.clear()


def register(api, username, **extra):
    return api.post(
        "/api/auth/register/",
        {"username": username, "email": f"{username}@example.com", "password": "pass12345", **extra},
        format="json",
    )


# --- опрос ------------------------------------------------------------------


@pytest.mark.django_db
def test_new_user_starts_with_onboarding(api):
    response = register(api, "fresh_one")
    assert response.status_code == 201
    user = User.objects.get(username="fresh_one")
    assert user.settings.onboarding_completed_at is None


@pytest.mark.django_db
def test_onboarding_builds_a_ready_app(auth_api):
    """Из ответов — цели, программа по дням, привычки и добавки."""
    client, user = auth_api("onboard_full")
    response = client.post(
        "/api/accounts/onboarding/",
        {
            "goal": "lose",
            "sex": "female",
            "height_cm": "168",
            "weight_kg": "72.4",
            "goal_weight_kg": "65",
            "place": "gym",
            "experience": "beginner",
            "training_days": [0, 2, 4],
            "session_minutes": 60,
            "quit_habits": ["sugar", "unknown_code"],
            "build_habits": ["walk"],
            "supplements": ["creatine", "vitamin_d"],
            "custom_supplements": ["Железо"],
            "bedtime": "23:00",
            "wake_time": "07:00",
            "commute_minutes": 30,
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    summary = response.json()

    user.refresh_from_db()
    settings = user.settings
    assert settings.onboarding_completed_at is not None
    # Похудение: белок от веса ближе к целевому, в разумных границах.
    assert 110 <= settings.protein_target_g <= 150
    assert settings.water_target_ml == 2500  # 72,4 × 33 ≈ 2389 → шаг 250
    assert settings.sleep_target_minutes == 480
    assert settings.commute_home_minutes == 30
    assert str(user.profile.height_cm) == "168.0"
    from apps.body.models import WeightEntry

    assert WeightEntry.objects.filter(user=user).count() == 1

    # До трёх дней — «всё тело» A/B по очереди, в расписании все три дня.
    programs = summary["created"]["programs"]
    assert [item["name"] for item in programs] == ["Всё тело A", "Всё тело B"]
    assert programs[0]["days"] == ["пн", "пт"]
    assert programs[1]["days"] == ["ср"]
    from apps.training.models import TemplateSchedule, WorkoutTemplate

    template = WorkoutTemplate.objects.get(user=user, name="Всё тело A")
    assert template.blocks.filter(priority="required").first().exercises.count() == 3
    assert TemplateSchedule.objects.filter(template__user=user).count() == 3

    # Неизвестный код привычки молча пропущен.
    assert summary["created"]["habits"] == ["Без сладкого", "Прогулка 30 минут"]
    assert summary["created"]["supplements"] == ["Креатин", "Витамин D", "Железо"]

    today = client.get("/api/today/").json()
    assert today["workout"]["planned_template"] is not None or today["workout"]["next_planned"]
    assert len(today["habits"]) == 2
    assert len(today["nutrition"]["supplements"]) == 3


@pytest.mark.django_db
def test_onboarding_again_does_not_duplicate(auth_api):
    client, user = auth_api("onboard_twice")
    answers = {
        "goal": "gain", "training_days": [0, 1, 3, 4], "place": "home",
        "quit_habits": ["alcohol"], "supplements": ["omega3"],
    }
    first = client.post("/api/accounts/onboarding/", answers, format="json").json()
    second = client.post("/api/accounts/onboarding/", answers, format="json").json()
    # Четыре дня — верх/низ; дома — свои программы.
    assert {item["name"] for item in first["created"]["programs"]} == {
        "Дома: верх тела", "Дома: низ тела",
    }
    assert second["created"] == {"programs": [], "habits": [], "supplements": []}
    from apps.training.models import WorkoutTemplate

    assert WorkoutTemplate.objects.filter(user=user).count() == 2


@pytest.mark.django_db
def test_onboarding_can_be_skipped(auth_api):
    client, user = auth_api("onboard_skip")
    response = client.post("/api/accounts/onboarding/", {"skip": True}, format="json")
    assert response.status_code == 200
    user.settings.refresh_from_db()
    assert user.settings.onboarding_completed_at is not None


@pytest.mark.django_db
def test_onboarding_rejects_nonsense(auth_api):
    client, _ = auth_api("onboard_bad")
    response = client.post(
        "/api/accounts/onboarding/", {"goal": "lose", "weight_kg": "7"}, format="json"
    )
    assert response.status_code == 400


# --- приглашения ----------------------------------------------------------


@pytest.mark.django_db
@override_settings(REGISTRATION_INVITE_ONLY=True)
def test_invite_only_registration(api):
    assert api.get("/api/auth/registration/").json() == {"invite_required": True}

    assert register(api, "no_code_user").status_code == 400
    assert register(api, "bad_code_user", invite_code="AAAA-BBBB").status_code == 400

    invite = InviteCode.objects.create(code=InviteCode.generate_code(), max_uses=1)
    # Код можно ввести в любом регистре и без дефиса.
    typed = invite.code.replace("-", "").lower()
    assert register(api, "good_code_user", invite_code=typed).status_code == 201
    invite.refresh_from_db()
    assert invite.used_count == 1
    assert invite.redemptions.get().user.username == "good_code_user"

    # Одноразовый код второй раз не работает.
    assert register(api, "second_user", invite_code=invite.code).status_code == 400


@pytest.mark.django_db
def test_open_registration_by_default(api):
    assert api.get("/api/auth/registration/").json() == {"invite_required": False}
    assert register(api, "open_user").status_code == 201


@pytest.mark.django_db
def test_only_admin_manages_invites(auth_api):
    client, user = auth_api("plain_user")
    assert client.get("/api/invites/").status_code == 403

    user.is_staff = True
    user.save()
    created = client.post("/api/invites/", {"note": "бета", "max_uses": 5}, format="json")
    assert created.status_code == 201
    body = created.json()
    assert len(body["code"]) == 9 and body["uses_left"] == 5
    listing = client.get("/api/invites/").json()
    assert listing["results"][0]["note"] == "бета"


# --- лимиты -------------------------------------------------------------------


@pytest.mark.django_db
def test_login_is_rate_limited(api, make_user, settings):
    make_user("limited_user")
    rates = dict(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], auth_login="3/min")
    from rest_framework.throttling import ScopedRateThrottle

    original = ScopedRateThrottle.THROTTLE_RATES
    ScopedRateThrottle.THROTTLE_RATES = rates
    try:
        codes = [
            api.post(
                "/api/auth/login/", {"login": "limited_user", "password": "wrong-pass"}, format="json"
            ).status_code
            for _ in range(4)
        ]
    finally:
        ScopedRateThrottle.THROTTLE_RATES = original
    assert codes[:3] == [400, 400, 400]
    assert codes[3] == 429


@pytest.mark.django_db
def test_createsuperuser_gives_a_working_account(api):
    """Админ беты создаётся командой — и сразу может пользоваться приложением."""
    from django.core.management import call_command

    call_command(
        "createsuperuser", interactive=False, username="beta_admin", email="admin@example.com"
    )
    admin = User.objects.get(username="beta_admin")
    assert admin.is_staff
    assert admin.profile and admin.settings and admin.notification_settings
