from django.urls import path

from .views import DailyCheckInListCreateView, TodayCheckInView

urlpatterns = [
    path("check-ins/", DailyCheckInListCreateView.as_view(), name="journal-check-ins"),
    path("check-ins/today/", TodayCheckInView.as_view(), name="journal-check-ins-today"),
]