from django.urls import path

from . import views

urlpatterns = [
    path("sync/pull/", views.SyncPullView.as_view()),
    path("sync/push/", views.SyncPushView.as_view()),
]
