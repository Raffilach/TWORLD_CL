from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from .today import TodayView

router = DefaultRouter()
router.register("standards", views.StandardViewSet, basename="standard")
router.register("insights", views.InsightViewSet, basename="insight")

urlpatterns = [
    path("today/", TodayView.as_view()),
    path("analytics/correlations/", views.CorrelationsView.as_view()),
    path("analytics/weak-link/", views.WeakLinkView.as_view()),
    path("analytics/compare/", views.CompareView.as_view()),
    path("analytics/heatmap/", views.HeatmapView.as_view()),
    path("analytics/forecast/", views.ForecastView.as_view()),
    path("analytics/week/", views.WeekMetricsView.as_view()),
    path("analytics/exercise-volume/", views.ExerciseVolumeView.as_view()),
    path("", include(router.urls)),
]
