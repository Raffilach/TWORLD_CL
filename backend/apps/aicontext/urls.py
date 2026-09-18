from django.urls import path

from . import views

urlpatterns = [
    path("context/", views.ContextView.as_view()),
    path("workouts/<int:pk>/markdown/", views.WorkoutMarkdownView.as_view()),
    path("plans/import/", views.PlanImportView.as_view()),
]
