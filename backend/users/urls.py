from django.urls import path

from .views import TrainingPreferencesView

urlpatterns = [
    path("training/", TrainingPreferencesView.as_view(), name="training-preferences"),
]
