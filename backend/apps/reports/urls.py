from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("reports/weekly", views.WeeklyReportViewSet, basename="weeklyreport")

urlpatterns = [path("", include(router.urls))]
