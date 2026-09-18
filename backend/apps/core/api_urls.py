"""Сборка всех маршрутов API в одном месте."""
from django.urls import include, path

urlpatterns = [
    path("", include("apps.accounts.urls")),
    path("", include("apps.catalog.urls")),
    path("", include("apps.training.urls")),
    path("", include("apps.safety.urls")),
    path("", include("apps.recovery.urls")),
    path("", include("apps.nutrition.urls")),
    path("", include("apps.body.urls")),
    path("", include("apps.habits.urls")),
    path("", include("apps.journal.urls")),
    path("", include("apps.analytics.urls")),
    path("", include("apps.reports.urls")),
    path("", include("apps.aicontext.urls")),
    path("", include("apps.sync.urls")),
    path("", include("apps.notify.urls")),
]
