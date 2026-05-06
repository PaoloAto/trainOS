from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ImportBatchViewSet, RunActivityViewSet

router = DefaultRouter()
router.register("imports", ImportBatchViewSet, basename="running-import")
router.register("runs", RunActivityViewSet, basename="run")

urlpatterns = [path("", include(router.urls))]
