from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("notifications/push", views.PushSubscriptionViewSet, basename="push")

urlpatterns = [
    path(
        "notifications/settings/",
        views.NotificationSettingsView.as_view({"get": "list", "patch": "partial_update"}),
    ),
    path("notifications/schedule/", views.ScheduleView.as_view()),
    path("", include(router.urls)),
]
