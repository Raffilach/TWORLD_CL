from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from .health_views import HealthImportView

router = DefaultRouter()
router.register("sleep", views.SleepEntryViewSet, basename="sleep")
router.register("health-metrics", views.HealthMetricViewSet, basename="healthmetric")
router.register("illness", views.IllnessPeriodViewSet, basename="illness")

urlpatterns = [
    path("recovery/evening-plan/", views.EveningPlanView.as_view()),
    path("health/import/", HealthImportView.as_view()),
    path("", include(router.urls)),
]
