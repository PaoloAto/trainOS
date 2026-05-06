from rest_framework import viewsets

from .models import RunActivity
from .serializers import RunActivitySerializer


class RunActivityViewSet(viewsets.ModelViewSet):
    serializer_class = RunActivitySerializer

    def get_queryset(self):
        return RunActivity.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, source="manual")