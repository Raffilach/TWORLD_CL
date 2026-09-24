from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("habits", views.HabitViewSet, basename="habit")
router.register("habit-episodes", views.HabitEpisodeViewSet, basename="habitepisode")
router.register("habit-checkins", views.HabitCheckinViewSet, basename="habitcheckin")
router.register("cravings", views.CravingLogViewSet, basename="craving")
router.register("replacements", views.ReplacementViewSet, basename="replacement")
router.register("sos", views.SosSessionViewSet, basename="sos")
router.register("challenges", views.ChallengeViewSet, basename="challenge")
router.register("challenge-entries", views.ChallengeEntryViewSet, basename="challengeentry")

urlpatterns = [path("", include(router.urls))]
