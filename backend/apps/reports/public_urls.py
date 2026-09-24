from django.urls import path

from .views import PublicReportView

urlpatterns = [path("<slug:slug>", PublicReportView.as_view(), name="public-report")]
