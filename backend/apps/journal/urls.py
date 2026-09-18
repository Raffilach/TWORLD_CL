from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("journal/tags", views.TagViewSet, basename="tag")
router.register("journal/entries", views.JournalEntryViewSet, basename="journalentry")
router.register("journal/events", views.LifeEventViewSet, basename="lifeevent")
router.register("journal/daily", views.DailyLogViewSet, basename="dailylog")

urlpatterns = [path("", include(router.urls))]
