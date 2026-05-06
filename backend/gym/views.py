from django.db.models import Count, Q
from rest_framework import mixins, viewsets

from .models import Exercise, GymSession, MuscleGroup
from .serializers import ExerciseSerializer, GymSessionSerializer, MuscleGroupSerializer


class MuscleGroupViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = MuscleGroupSerializer
    queryset = MuscleGroup.objects.all()


class ExerciseViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = ExerciseSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return Exercise.objects.filter(Q(user=self.request.user) | Q(user__isnull=True)).select_related("primary_muscle_group").prefetch_related("secondary_muscle_groups", "references")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, is_custom=True)


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