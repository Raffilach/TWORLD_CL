from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register("tokens", views.ApiTokenViewSet, basename="apitoken")
router.register("share-links", views.ShareLinkViewSet, basename="sharelink")
router.register("feature-interest", views.FeatureInterestViewSet, basename="featureinterest")
router.register("invites", views.InviteCodeViewSet, basename="invite")

urlpatterns = [
    path("auth/register/", views.RegisterView.as_view(), name="register"),
    path("auth/registration/", views.RegistrationInfoView.as_view(), name="registration-info"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/password/change/", views.PasswordChangeView.as_view()),
    path("auth/password/reset/", views.PasswordResetRequestView.as_view()),
    path("auth/password/reset/confirm/", views.PasswordResetConfirmView.as_view()),
    path("accounts/me/", views.MeView.as_view(), name="me"),
    path("accounts/username-available/", views.username_available),
    path("accounts/profile/", views.ProfileView.as_view({"get": "list", "patch": "partial_update"})),
    path("accounts/settings/", views.SettingsView.as_view({"get": "list", "patch": "partial_update"})),
    path("accounts/delete/", views.DeleteAccountView.as_view()),
    path("accounts/onboarding/", views.OnboardingView.as_view(), name="onboarding"),
    path("accounts/export/", views.ExportView.as_view()),
    path("", include(router.urls)),
]
