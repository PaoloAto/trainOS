from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ImportBatch, RunActivity
from .serializers import ImportBatchSerializer, ImportResultSerializer, RunActivitySerializer
from .services.analytics_service import running_analytics_for_user
from .services.import_service import import_running_file


class RunActivityViewSet(viewsets.ModelViewSet):
    serializer_class = RunActivitySerializer

    def get_queryset(self):
        return RunActivity.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, source="manual")


class ImportBatchViewSet(viewsets.GenericViewSet):
    serializer_class = ImportBatchSerializer
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return ImportBatch.objects.filter(user=self.request.user).prefetch_related("runs")

    def list(self, request):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        batch = self.get_object()
        serializer = self.get_serializer(batch)
        return Response(serializer.data)

    def create(self, request):
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return Response({"detail": "A TCX file is required."}, status=status.HTTP_400_BAD_REQUEST)

        source = request.data.get("source", ImportBatch.Source.MANUAL_UPLOAD)
        try:
            result = import_running_file(
                user=request.user,
                uploaded_file=uploaded_file,
                source=source,
            )
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") and exc.messages else str(exc)
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ImportResultSerializer(result)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class RunningAnalyticsView(APIView):
    def get(self, request):
        return Response(running_analytics_for_user(request.user))
