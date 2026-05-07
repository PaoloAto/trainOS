from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from .models import Exercise, ExerciseReference, GymSession, GymSet, MuscleGroup


def accessible_exercises(user):
    return Exercise.objects.filter(Q(user=user) | Q(user__isnull=True))


def accessible_references(user):
    return ExerciseReference.objects.filter(
        Q(user=user)
        | Q(user__isnull=True)
        | Q(exercise__user=user)
    )


class MuscleGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = MuscleGroup
        fields = ["id", "name"]


class ExerciseReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciseReference
        fields = ["id", "url", "source", "title", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class ExerciseSerializer(serializers.ModelSerializer):
    primary_muscle_group_name = serializers.CharField(source="primary_muscle_group.name", read_only=True)
    secondary_muscle_group_names = serializers.SerializerMethodField()
    references = serializers.SerializerMethodField()
    reference_count = serializers.SerializerMethodField()
    recent_set_count = serializers.SerializerMethodField()
    best_weight = serializers.SerializerMethodField()
    best_reps = serializers.SerializerMethodField()
    best_estimated_1rm = serializers.SerializerMethodField()
    last_performed_date = serializers.SerializerMethodField()

    class Meta:
        model = Exercise
        fields = [
            "id",
            "name",
            "primary_muscle_group",
            "primary_muscle_group_name",
            "secondary_muscle_groups",
            "secondary_muscle_group_names",
            "movement_pattern",
            "equipment",
            "form_notes",
            "is_custom",
            "references",
            "reference_count",
            "recent_set_count",
            "best_weight",
            "best_reps",
            "best_estimated_1rm",
            "last_performed_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "is_custom",
            "created_at",
            "updated_at",
            "references",
            "reference_count",
            "recent_set_count",
            "best_weight",
            "best_reps",
            "best_estimated_1rm",
            "last_performed_date",
        ]

    def get_secondary_muscle_group_names(self, obj):
        return [group.name for group in obj.secondary_muscle_groups.all()]

    def _request_user(self):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return request.user
        return None

    def _sets_for_user(self, obj):
        user = self._request_user()
        if not user:
            return GymSet.objects.none()
        return obj.gym_sets.filter(session__user=user).select_related("session")

    def _references_for_user(self, obj):
        user = self._request_user()
        queryset = obj.references.all()
        if not user:
            return queryset.filter(user__isnull=True)
        return queryset.filter(Q(user=user) | Q(user__isnull=True) | Q(exercise__user=user))

    def get_references(self, obj):
        return ExerciseReferenceSerializer(self._references_for_user(obj), many=True).data

    def get_reference_count(self, obj):
        return self._references_for_user(obj).count()

    def get_recent_set_count(self, obj):
        since = timezone.localdate() - timedelta(days=29)
        return self._sets_for_user(obj).filter(session__date__gte=since).count()

    def get_best_weight(self, obj):
        weighted = self._sets_for_user(obj).filter(weight__gt=0).order_by("-weight", "-reps").first()
        return weighted.weight if weighted else None

    def get_best_reps(self, obj):
        best = self._sets_for_user(obj).order_by("-reps", "-weight").first()
        return best.reps if best else None

    def get_best_estimated_1rm(self, obj):
        best_value = None
        for gym_set in self._sets_for_user(obj).filter(weight__gt=0, reps__gt=0):
            estimated = gym_set.weight * (1 + gym_set.reps / 30)
            if best_value is None or estimated > best_value:
                best_value = estimated
        return round(best_value, 1) if best_value is not None else None

    def get_last_performed_date(self, obj):
        latest = self._sets_for_user(obj).order_by("-session__date", "-created_at").first()
        return latest.session.date.isoformat() if latest else None


class GymSetSerializer(serializers.ModelSerializer):
    exercise_name = serializers.CharField(source="exercise.name", read_only=True)

    class Meta:
        model = GymSet
        fields = ["id", "exercise", "exercise_name", "set_number", "weight", "reps", "rpe", "notes", "created_at"]
        read_only_fields = ["id", "exercise_name", "created_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            self.fields["exercise"].queryset = accessible_exercises(request.user)


class GymSessionSerializer(serializers.ModelSerializer):
    sets = GymSetSerializer(many=True, required=False)
    set_count = serializers.SerializerMethodField()
    exercise_names = serializers.SerializerMethodField()

    class Meta:
        model = GymSession
        fields = [
            "id",
            "date",
            "split_type",
            "duration_minutes",
            "notes",
            "sets",
            "set_count",
            "exercise_names",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "set_count", "exercise_names", "created_at", "updated_at"]

    def get_set_count(self, obj):
        return obj.sets.count()

    def get_exercise_names(self, obj):
        return list(obj.sets.select_related("exercise").values_list("exercise__name", flat=True).distinct())

    def _validate_sets(self, sets):
        request = self.context.get("request")
        if not request:
            return
        allowed_ids = set(accessible_exercises(request.user).values_list("id", flat=True))
        for item in sets:
            exercise = item.get("exercise")
            if exercise and exercise.id not in allowed_ids:
                raise serializers.ValidationError({"sets": "One or more exercises are not available to this user."})

    def validate(self, attrs):
        self._validate_sets(attrs.get("sets", []))
        return attrs

    def create(self, validated_data):
        sets_data = validated_data.pop("sets", [])
        session = GymSession.objects.create(**validated_data)
        for index, set_data in enumerate(sets_data, start=1):
            set_data.setdefault("set_number", index)
            GymSet.objects.create(session=session, **set_data)
        return session

    def update(self, instance, validated_data):
        sets_data = validated_data.pop("sets", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if sets_data is not None:
            instance.sets.all().delete()
            for index, set_data in enumerate(sets_data, start=1):
                set_data.setdefault("set_number", index)
                GymSet.objects.create(session=instance, **set_data)
        return instance
