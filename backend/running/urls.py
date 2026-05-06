from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import RunActivityViewSet

router = DefaultRouter()
router.register("runs", RunActivityViewSet, basename="run")

urlpatterns = [path("", include(router.urls))]