"""Сырьё для мышечной карты: рабочие подходы по упражнениям."""
from datetime import timedelta

import pytest
from django.utils import timezone


def _session(user, exercise, days_ago=0, warmups=0, working=3):
    from apps.training.models import SessionExercise, SetLog, WorkoutSession

    session = WorkoutSession.objects.create(
        user=user, date=timezone.localdate() - timedelta(days=days_ago), status="completed"
    )
    entry = SessionExercise.objects.create(user=user, session=session, exercise=exercise)
    for number in range(warmups + working):
        SetLog.objects.create(
            user=user, session_exercise=entry, set_number=number + 1,
            is_warmup=number < warmups, weight_kg=60, reps=8,
        )
    return session


@pytest.mark.django_db
def test_volume_counts_working_sets_for_the_last_week(auth_api):
    from apps.training.models import Exercise

    client, user = auth_api("volume_one")
    bench = Exercise.objects.get(owner=None, name="Жим штанги лёжа")
    _session(user, bench, days_ago=1, warmups=2, working=4)
    _session(user, bench, days_ago=3, working=3)
    _session(user, bench, days_ago=20, working=5)  # вне недели

    body = client.get("/api/analytics/exercise-volume/").json()
    assert body["sessions"] == 2
    [row] = body["exercises"]
    # Разминочные подходы — не нагрузка.
    assert row["name"] == "Жим штанги лёжа"
    assert row["working_sets"] == 7
    assert row["sessions"] == 2
    assert {"code": "chest_pec", "role": "primary"} in row["muscles"]


@pytest.mark.django_db
def test_volume_for_one_session_and_only_own_data(auth_api):
    from apps.training.models import Exercise

    client, user = auth_api("volume_two")
    other_client, other = auth_api("volume_three")
    squat = Exercise.objects.get(owner=None, name="Приседания со штангой")
    mine = _session(user, squat, working=5)
    theirs = _session(other, squat, working=9)

    body = client.get("/api/analytics/exercise-volume/", {"session": mine.id}).json()
    assert body["period"] is None
    assert body["exercises"][0]["working_sets"] == 5

    # Чужая тренировка по id не отдаётся.
    leaked = client.get("/api/analytics/exercise-volume/", {"session": theirs.id}).json()
    assert leaked["exercises"] == []
