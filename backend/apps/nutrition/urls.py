from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("nutrition/foods", views.FoodItemViewSet, basename="fooditem")
router.register("nutrition/meals", views.MealEntryViewSet, basename="mealentry")
router.register("nutrition/meal-templates", views.MealTemplateViewSet, basename="mealtemplate")
router.register("nutrition/water", views.WaterLogViewSet, basename="water")
router.register("nutrition/supplements", views.SupplementViewSet, basename="supplement")
router.register("nutrition/supplement-logs", views.SupplementLogViewSet, basename="supplementlog")
router.register("nutrition/exceptions", views.DietExceptionLogViewSet, basename="dietexception")
router.register("nutrition/free-meals", views.FreeMealViewSet, basename="freemeal")

urlpatterns = [
    path("nutrition/today/", views.NutritionTodayView.as_view()),
    path("", include(router.urls)),
]
