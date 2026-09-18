from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("injuries", views.InjuryViewSet, basename="injury")
router.register("weight-limits", views.WeightLimitViewSet, basename="weightlimit")
router.register("return-tests", views.ReturnTestViewSet, basename="returntest")
router.register("recurrence-notices", views.RecurrenceNoticeViewSet, basename="recurrencenotice")
router.register("safety", views.SafetyOverviewViewSet, basename="safety")

urlpatterns = [path("", include(router.urls))]
