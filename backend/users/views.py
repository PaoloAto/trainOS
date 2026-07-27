from rest_framework.response import Response
from rest_framework.views import APIView

from .models import TrainingPreferences
from .serializers import TrainingPreferencesSerializer


class TrainingPreferencesView(APIView):
    def get_object(self, request):
        preferences, _ = TrainingPreferences.objects.get_or_create(user=request.user)
        return preferences

    def get(self, request):
        serializer = TrainingPreferencesSerializer(self.get_object(request))
        return Response(serializer.data)

    def patch(self, request):
        serializer = TrainingPreferencesSerializer(self.get_object(request), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
