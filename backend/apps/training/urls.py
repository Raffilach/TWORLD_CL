from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("exercises", views.ExerciseViewSet, basename="exercise")
router.register("exercise-alternatives", views.ExerciseAlternativeViewSet, basename="exercisealternative")
router.register("gyms", views.GymViewSet, basename="gym")
router.register("gym-profiles", views.GymExerciseProfileViewSet, basename="gymprofile")
router.register("templates", views.WorkoutTemplateViewSet, basename="template")
router.register("template-blocks", views.TemplateBlockViewSet, basename="templateblock")
router.register("template-exercises", views.TemplateExerciseViewSet, basename="templateexercise")
router.register("template-schedules", views.TemplateScheduleViewSet, basename="templateschedule")
router.register("planned-exclusions", views.PlannedExclusionViewSet, basename="plannedexclusion")
router.register("workouts", views.WorkoutSessionViewSet, basename="workout")
router.register("session-exercises", views.SessionExerciseViewSet, basename="sessionexercise")
router.register("sets", views.SetLogViewSet, basename="setlog")
router.register("records", views.PersonalRecordViewSet, basename="record")
router.register("progression", views.ProgressionSuggestionViewSet, basename="progression")

urlpatterns = [path("", include(router.urls))]
