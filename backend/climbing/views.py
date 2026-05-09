from django.db.models import Count
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ClimbingProject, ClimbingSession
from .serializers import ClimbingProjectSerializer, ClimbingSessionSerializer
from .services.analytics_service import climbing_analytics_for_user


class ClimbingAnalyticsView(APIView):
    def get(self, request):
        return Response(climbing_analytics_for_user(request.user))


class ClimbingSessionViewSet(viewsets.ModelViewSet):
    serializer_class = ClimbingSessionSerializer

    def get_queryset(self):
        return (
            ClimbingSession.objects.filter(user=self.request.user)
            .annotate(attempt_count=Count("attempts"))
            .prefetch_related("attempts")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ClimbingProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ClimbingProjectSerializer

    def get_queryset(self):
        return ClimbingProject.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
