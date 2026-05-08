from django.db import transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ActiveWorkout, Exercise, ExerciseReference, GymSession, GymSet, MuscleGroup, WorkoutTemplate
from .serializers import (
    ActiveWorkoutSerializer,
    ExerciseReferenceSerializer,
    ExerciseSerializer,
    GymSessionSerializer,
    MuscleGroupSerializer,
    WorkoutTemplateSerializer,
)
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


class WorkoutTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = WorkoutTemplateSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        include_archived = self.request.query_params.get("include_archived") == "true" or self.action in {"restore", "destroy"}
        queryset = WorkoutTemplate.objects.filter(user=self.request.user)
        if not include_archived:
            queryset = queryset.filter(is_archived=False)
        return queryset.prefetch_related("items__exercise__primary_muscle_group", "items__exercise__references")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        template = self.get_object()
        template.archive()
        serializer = self.get_serializer(template)
        return Response(
            {
                "detail": "Workout template archived.",
                "template": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):
        template = self.get_object()
        template.restore()
        serializer = self.get_serializer(template)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="start")
    def start(self, request, pk=None):
        template = self.get_object()
        if template.is_archived:
            return Response({"detail": "Archived templates cannot be started."}, status=status.HTTP_400_BAD_REQUEST)
        if ActiveWorkout.objects.filter(user=request.user).exists():
            return Response(
                {"detail": "You already have an active workout. Resume or cancel it before starting another."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        active_workout = ActiveWorkout.objects.create(user=request.user, template=template)
        serializer = ActiveWorkoutSerializer(active_workout, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ActiveWorkoutView(APIView):
    def get_active_workout(self, request):
        return (
            ActiveWorkout.objects.filter(user=request.user)
            .select_related("template")
            .prefetch_related("template__items__exercise__primary_muscle_group", "template__items__exercise__references")
            .first()
        )

    def get(self, request):
        active_workout = self.get_active_workout(request)
        if not active_workout:
            return JsonResponse(None, safe=False)
        serializer = ActiveWorkoutSerializer(active_workout, context={"request": request})
        return Response(serializer.data)

    def patch(self, request):
        active_workout = self.get_active_workout(request)
        if not active_workout:
            return Response({"detail": "No active workout to update."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ActiveWorkoutSerializer(active_workout, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request):
        active_workout = self.get_active_workout(request)
        if active_workout:
            active_workout.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ActiveWorkoutCompleteView(APIView):
    def get_active_workout(self, request):
        return (
            ActiveWorkout.objects.filter(user=request.user)
            .select_related("template")
            .prefetch_related("template__items")
            .first()
        )

    @transaction.atomic
    def post(self, request):
        active_workout = self.get_active_workout(request)
        if not active_workout:
            return Response({"detail": "No active workout to complete."}, status=status.HTTP_404_NOT_FOUND)
        if not active_workout.logged_sets:
            return Response({"detail": "Log at least one set before completing a workout."}, status=status.HTTP_400_BAD_REQUEST)

        split_type = active_workout.template.split_type if active_workout.template else GymSession.SplitType.CUSTOM
        session = GymSession.objects.create(
            user=request.user,
            date=timezone.localdate(),
            split_type=split_type,
            notes=active_workout.notes,
        )

        for index, item in enumerate(active_workout.logged_sets, start=1):
            exercise_id = item.get("exercise")
            exercise = Exercise.objects.filter(Q(user=request.user) | Q(user__isnull=True), id=exercise_id).first()
            if not exercise:
                transaction.set_rollback(True)
                return Response({"detail": "One or more logged sets reference an unavailable exercise."}, status=status.HTTP_400_BAD_REQUEST)
            GymSet.objects.create(
                session=session,
                exercise=exercise,
                set_number=index,
                weight=item.get("weight"),
                reps=max(1, int(item.get("reps") or 1)),
                rpe=item.get("rpe"),
                notes=item.get("notes", ""),
            )

        active_workout.delete()
        serializer = GymSessionSerializer(session, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
