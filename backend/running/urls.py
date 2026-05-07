from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ImportBatchViewSet, RunActivityViewSet, RunningAnalyticsView

router = DefaultRouter()
router.register("imports", ImportBatchViewSet, basename="running-import")
router.register("runs", RunActivityViewSet, basename="run")

urlpatterns = [
    path("analytics/", RunningAnalyticsView.as_view(), name="running-analytics"),
    path("", include(router.urls)),
]
