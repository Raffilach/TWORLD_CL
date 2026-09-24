from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("catalog/muscles", views.MuscleViewSet, basename="muscle")
router.register("catalog/equipment", views.EquipmentViewSet, basename="equipment")
router.register("catalog/body-parts", views.BodyPartViewSet, basename="bodypart")
router.register("catalog/movement-tags", views.MovementTagViewSet, basename="movementtag")
router.register("catalog/fail-reasons", views.FailReasonViewSet, basename="failreason")
router.register("catalog/health-timeline", views.HealthTimelineViewSet, basename="healthtimeline")
router.register("catalog/craving-triggers", views.CravingTriggerViewSet, basename="cravingtrigger")

urlpatterns = [path("", include(router.urls))]
