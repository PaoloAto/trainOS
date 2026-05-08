from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ActiveWorkoutCompleteView,
    ActiveWorkoutView,
    ExerciseReferenceViewSet,
    ExerciseViewSet,
    GymAnalyticsView,
    GymSessionViewSet,
    MuscleGroupViewSet,
    WorkoutTemplateViewSet,
)

router = DefaultRouter()
router.register("muscle-groups", MuscleGroupViewSet, basename="muscle-group")
router.register("exercises", ExerciseViewSet, basename="exercise")
router.register("references", ExerciseReferenceViewSet, basename="exercise-reference")
router.register("sessions", GymSessionViewSet, basename="gym-session")
router.register("templates", WorkoutTemplateViewSet, basename="workout-template")

urlpatterns = [
    path("analytics/", GymAnalyticsView.as_view(), name="gym-analytics"),
    path("active-workout/", ActiveWorkoutView.as_view(), name="active-workout"),
    path("active-workout/complete/", ActiveWorkoutCompleteView.as_view(), name="active-workout-complete"),
    path("", include(router.urls)),
]
