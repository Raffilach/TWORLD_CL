import pytest
from django.core.management import call_command


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        call_command("seed_catalog")


@pytest.fixture
def make_user(db):
    from apps.accounts.models import Profile, User, UserSettings
    from apps.notify.models import NotificationSettings

    def factory(username="tester_one", **extra):
        user = User.objects.create_user(
            username=username, email=f"{username}@example.com",
            password="pass12345", **extra,
        )
        Profile.objects.create(user=user)
        UserSettings.objects.create(user=user)
        NotificationSettings.objects.create(user=user)
        return user

    return factory


@pytest.fixture
def api(db):
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def auth_api(api, make_user):
    def factory(username="tester_one"):
        user = make_user(username)
        api_client = type(api)()
        api_client.force_authenticate(user=user)
        return api_client, user

    return factory
