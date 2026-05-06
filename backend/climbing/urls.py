from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ClimbingProjectViewSet, ClimbingSessionViewSet

router = DefaultRouter()
router.register("sessions", ClimbingSessionViewSet, basename="climbing-session")
router.register("projects", ClimbingProjectViewSet, basename="climbing-project")

urlpatterns = [path("", include(router.urls))]