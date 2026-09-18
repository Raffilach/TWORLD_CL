from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("body/weight", views.WeightEntryViewSet, basename="weight")
router.register("body/measurements", views.BodyMeasurementViewSet, basename="measurement")
router.register("body/scans", views.BodyCompositionScanViewSet, basename="scan")
router.register("body/photos", views.ProgressPhotoViewSet, basename="photo")
router.register("body/photo-schedule", views.PhotoScheduleViewSet, basename="photoschedule")

urlpatterns = [
    path("body/overview/", views.BodyOverviewView.as_view()),
    path("", include(router.urls)),
]
