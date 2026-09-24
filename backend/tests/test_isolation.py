"""Изоляция данных между пользователями — на уровне запросов, не UI."""
import pytest
from django.urls import get_resolver
from rest_framework.permissions import IsAdminUser
from rest_framework.test import APIClient

from apps.core.viewsets import OwnedModelViewSet, ReadOnlyCatalogViewSet, SingletonOwnedView


def _api_views():
    """Все вьюхи, зарегистрированные под /api/."""
    resolver = get_resolver()
    found = []
    for pattern in resolver.url_patterns:
        _walk(pattern, "", found)
    return [(route, view) for route, view in found if route.startswith("api/")]


def _walk(pattern, prefix, found):
    from django.urls.resolvers import URLPattern, URLResolver

    if isinstance(pattern, URLResolver):
        for sub in pattern.url_patterns:
            _walk(sub, prefix + str(pattern.pattern), found)
    elif isinstance(pattern, URLPattern):
        found.append((prefix + str(pattern.pattern), pattern.callback))


# Эндпоинты, которым по смыслу не нужен владелец.
PUBLIC_OR_SHARED = {
    "api/auth/register/", "api/auth/login/", "api/auth/refresh/",
    "api/auth/password/reset/", "api/auth/password/reset/confirm/",
    "api/accounts/username-available/", "api/schema/", "api/docs/",
    # Отвечает только «нужен ли код приглашения» — данных пользователей нет.
    "api/auth/registration/",
}


def test_every_api_view_requires_authentication(db):
    """Ни один эндпоинт данных не отвечает анонимному клиенту."""
    client = APIClient()
    leaks = []
    for route, view in _api_views():
        if route in PUBLIC_OR_SHARED or "{" in route or "<" in route:
            continue
        response = client.get("/" + route)
        if response.status_code not in {401, 403, 404, 405}:
            leaks.append((route, response.status_code))
    assert not leaks, f"Эндпоинты отвечают без аутентификации: {leaks}"


def test_owned_viewsets_filter_by_user():
    """Каждый вьюсет данных обязан наследовать OwnedModelViewSet."""
    offenders = []
    for route, view in _api_views():
        cls = getattr(view, "cls", None) or getattr(view, "view_class", None)
        if cls is None:
            continue
        if issubclass(cls, (ReadOnlyCatalogViewSet, SingletonOwnedView)):
            continue
        # Общие объекты администратора (коды приглашений): у них нет
        # владельца, зато доступ закрыт правом администратора.
        if IsAdminUser in getattr(cls, "permission_classes", []):
            continue
        if not hasattr(cls, "queryset") or cls.queryset is None:
            continue
        if not issubclass(cls, OwnedModelViewSet):
            offenders.append((route, cls.__name__))
    assert not offenders, f"Вьюсеты без обязательной фильтрации по пользователю: {offenders}"


@pytest.mark.django_db
def test_other_users_objects_are_invisible(auth_api, make_user):
    """Юзер Б не видит и не может тронуть объекты юзера А — по каждой модели."""
    from apps.body.models import WeightEntry
    from apps.habits.models import Habit
    from apps.journal.models import JournalEntry
    from apps.training.models import Gym, WorkoutTemplate

    client_a, user_a = auth_api("alice_one")
    client_b, user_b = auth_api("bob_two")

    from datetime import date

    from django.utils import timezone

    objects = {
        "/api/gyms/": Gym.objects.create(user=user_a, name="Зал Алисы"),
        "/api/templates/": WorkoutTemplate.objects.create(user=user_a, name="План Алисы"),
        "/api/body/weight/": WeightEntry.objects.create(
            user=user_a, at=timezone.now(), weight_kg=80),
        "/api/habits/": Habit.objects.create(
            user=user_a, name="Привычка Алисы", decision_date=date.today()),
        "/api/journal/entries/": JournalEntry.objects.create(
            user=user_a, date=date.today(), at=timezone.now(), text="Личное"),
    }

    for url, obj in objects.items():
        listed = client_b.get(url)
        assert listed.status_code == 200
        ids = [item["id"] for item in listed.json().get("results", listed.json())]
        assert obj.id not in ids, f"{url}: чужой объект виден в списке"

        assert client_b.get(f"{url}{obj.id}/").status_code == 404, f"{url}: чужой объект читается"
        assert client_b.patch(
            f"{url}{obj.id}/", {"name": "взлом"}, format="json"
        ).status_code == 404, f"{url}: чужой объект изменяется"
        assert client_b.delete(f"{url}{obj.id}/").status_code == 404, f"{url}: чужой объект удаляется"

        assert client_a.get(f"{url}{obj.id}/").status_code == 200, f"{url}: владелец не видит своё"


@pytest.mark.django_db
def test_user_field_in_body_is_ignored(auth_api):
    """Подделать владельца через тело запроса нельзя."""
    from apps.training.models import Gym

    client_a, user_a = auth_api("carol_one")
    client_b, user_b = auth_api("dave_two")

    response = client_b.post(
        "/api/gyms/", {"name": "Чужой зал", "user": str(user_a.id)}, format="json"
    )
    assert response.status_code == 201
    assert Gym.objects.get(pk=response.json()["id"]).user_id == user_b.id


@pytest.mark.django_db
def test_account_deletion_removes_all_data(auth_api):
    """Удаление аккаунта одной кнопкой удаляет всё."""
    from apps.body.models import WeightEntry
    from apps.training.models import Gym

    client, user = auth_api("erin_one")
    from django.utils import timezone

    Gym.objects.create(user=user, name="Зал")
    WeightEntry.objects.create(user=user, at=timezone.now(), weight_kg=75)

    assert client.post("/api/accounts/delete/", {"confirm_username": "wrong"},
                       format="json").status_code == 400
    assert Gym.objects.filter(user=user).exists()

    assert client.post("/api/accounts/delete/", {"confirm_username": "erin_one"},
                       format="json").status_code == 204
    assert not Gym.objects.filter(user_id=user.id).exists()
    assert not WeightEntry.objects.filter(user_id=user.id).exists()


@pytest.mark.django_db
def test_read_token_cannot_write(make_user):
    """Токен со скоупом read не изменяет данные."""
    from apps.accounts.models import ApiToken

    user = make_user("frank_one")
    raw, digest, prefix = ApiToken.generate()
    ApiToken.objects.create(user=user, name="чтение", token_hash=digest,
                            prefix=prefix, scope=ApiToken.Scope.READ)

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {raw}")
    assert client.get("/api/gyms/").status_code == 200
    assert client.post("/api/gyms/", {"name": "Зал"}, format="json").status_code == 403
