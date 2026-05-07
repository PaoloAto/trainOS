from django.db.models import Count, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Exercise, ExerciseReference, GymSession, MuscleGroup
from .serializers import ExerciseReferenceSerializer, ExerciseSerializer, GymSessionSerializer, MuscleGroupSerializer
from .services.analytics_service import gym_analytics_for_user


class MuscleGroupViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = MuscleGroupSerializer
    queryset = MuscleGroup.objects.all()


class GymAnalyticsView(APIView):
    def get(self, request):
        return Response(gym_analytics_for_user(request.user))


class ExerciseViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ExerciseSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        include_archived = self.request.query_params.get("include_archived") == "true" or self.action in {"restore", "destroy"}
        queryset = Exercise.objects.filter(Q(user=self.request.user) | Q(user__isnull=True))
        if not include_archived:
            queryset = queryset.filter(is_archived=False)
        return queryset.select_related("primary_muscle_group").prefetch_related("secondary_muscle_groups", "references")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, is_custom=True)

    def destroy(self, request, *args, **kwargs):
        exercise = self.get_object()
        exercise.archive()
        serializer = self.get_serializer(exercise)
        return Response(
            {
                "detail": "Exercise archived. Historical gym sessions remain intact.",
                "exercise": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):
        exercise = self.get_object()
        exercise.restore()
        serializer = self.get_serializer(exercise)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="references", serializer_class=ExerciseReferenceSerializer)
    def create_reference(self, request, pk=None):
        exercise = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(exercise=exercise, user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ExerciseReferenceViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = ExerciseReferenceSerializer
    http_method_names = ["patch", "delete", "head", "options"]

    def get_queryset(self):
        return ExerciseReference.objects.filter(
            Q(user=self.request.user)
            | Q(exercise__user=self.request.user)
        ).select_related("exercise")


class GymSessionViewSet(viewsets.ModelViewSet):
    serializer_class = GymSessionSerializer

    def get_queryset(self):
        return (
            GymSession.objects.filter(user=self.request.user)
            .annotate(set_count=Count("sets"))
            .prefetch_related("sets__exercise")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
