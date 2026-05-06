from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DailyCheckIn
from .serializers import DailyCheckInSerializer


class DailyCheckInListCreateView(generics.ListCreateAPIView):
    serializer_class = DailyCheckInSerializer

    def get_queryset(self):
        return DailyCheckIn.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TodayCheckInView(APIView):
    def get_object(self):
        return DailyCheckIn.objects.filter(user=self.request.user, date=timezone.localdate()).first()

    def get(self, request):
        check_in = self.get_object()
        if check_in is None:
            return Response({"detail": "No check-in logged today."}, status=status.HTTP_404_NOT_FOUND)
        return Response(DailyCheckInSerializer(check_in).data)

    def patch(self, request):
        check_in = self.get_object()
        data = {**request.data, "date": timezone.localdate().isoformat()}
        serializer = DailyCheckInSerializer(check_in, data=data, partial=True) if check_in else DailyCheckInSerializer(data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_200_OK if check_in else status.HTTP_201_CREATED)