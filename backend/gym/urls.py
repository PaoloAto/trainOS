from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ExerciseReferenceViewSet, ExerciseViewSet, GymAnalyticsView, GymSessionViewSet, MuscleGroupViewSet

router = DefaultRouter()
router.register("muscle-groups", MuscleGroupViewSet, basename="muscle-group")
router.register("exercises", ExerciseViewSet, basename="exercise")
router.register("references", ExerciseReferenceViewSet, basename="exercise-reference")
router.register("sessions", GymSessionViewSet, basename="gym-session")

urlpatterns = [
    path("analytics/", GymAnalyticsView.as_view(), name="gym-analytics"),
    path("", include(router.urls)),
]
