from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ExerciseViewSet, GymSessionViewSet, MuscleGroupViewSet

router = DefaultRouter()
router.register("muscle-groups", MuscleGroupViewSet, basename="muscle-group")
router.register("exercises", ExerciseViewSet, basename="exercise")
router.register("sessions", GymSessionViewSet, basename="gym-session")

urlpatterns = [path("", include(router.urls))]