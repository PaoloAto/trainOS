from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from .models import Exercise, ExerciseReference, GymSession, GymSet, MuscleGroup


def accessible_exercises(user, include_archived=False):
    queryset = Exercise.objects.filter(Q(user=user) | Q(user__isnull=True))
    if not include_archived:
        queryset = queryset.filter(is_archived=False)
    return queryset


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
    last_session_id = serializers.SerializerMethodField()
    last_session_set_count = serializers.SerializerMethodField()
    last_session_best_weight = serializers.SerializerMethodField()
    last_session_best_reps = serializers.SerializerMethodField()
    last_session_best_estimated_1rm = serializers.SerializerMethodField()
    last_session_summary_label = serializers.SerializerMethodField()

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
            "is_archived",
            "archived_at",
            "references",
            "reference_count",
            "recent_set_count",
            "best_weight",
            "best_reps",
            "best_estimated_1rm",
            "last_performed_date",
            "last_session_id",
            "last_session_set_count",
            "last_session_best_weight",
            "last_session_best_reps",
            "last_session_best_estimated_1rm",
            "last_session_summary_label",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "is_custom",
            "is_archived",
            "archived_at",
            "created_at",
            "updated_at",
            "references",
            "reference_count",
            "recent_set_count",
            "best_weight",
            "best_reps",
            "best_estimated_1rm",
            "last_performed_date",
            "last_session_id",
            "last_session_set_count",
            "last_session_best_weight",
            "last_session_best_reps",
            "last_session_best_estimated_1rm",
            "last_session_summary_label",
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

    def _last_session(self, obj):
        latest = self._sets_for_user(obj).order_by("-session__date", "-session__created_at", "-created_at").first()
        return latest.session if latest else None

    def _last_session_sets(self, obj):
        session = self._last_session(obj)
        if not session:
            return []
        return list(self._sets_for_user(obj).filter(session=session).order_by("set_number", "id"))

    def _best_weighted_set(self, sets):
        weighted = [gym_set for gym_set in sets if gym_set.weight and gym_set.weight > 0]
        if not weighted:
            return None
        return max(weighted, key=lambda gym_set: (gym_set.weight * (1 + gym_set.reps / 30), gym_set.weight, gym_set.reps))

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
        session = self._last_session(obj)
        return session.date.isoformat() if session else None

    def get_last_session_id(self, obj):
        session = self._last_session(obj)
        return session.id if session else None

    def get_last_session_set_count(self, obj):
        return len(self._last_session_sets(obj))

    def get_last_session_best_weight(self, obj):
        best = self._best_weighted_set(self._last_session_sets(obj))
        return best.weight if best else None

    def get_last_session_best_reps(self, obj):
        sets = self._last_session_sets(obj)
        if not sets:
            return None
        return max(gym_set.reps for gym_set in sets)

    def get_last_session_best_estimated_1rm(self, obj):
        best = self._best_weighted_set(self._last_session_sets(obj))
        if not best:
            return None
        return round(best.weight * (1 + best.reps / 30), 1)

    def get_last_session_summary_label(self, obj):
        session = self._last_session(obj)
        sets = self._last_session_sets(obj)
        if not session or not sets:
            return "No logged sets yet."
        date_label = f"{session.date:%b} {session.date.day}"
        best = self._best_weighted_set(sets)
        if best:
            return f"Last performed: {date_label} - {len(sets)} sets - best {best.weight:g} kg x {best.reps}"
        best_reps = max(gym_set.reps for gym_set in sets)
        return f"Last performed: {date_label} - {len(sets)} sets - best {best_reps} reps"


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
            self.fields["exercise"].queryset = accessible_exercises(request.user, include_archived=True)


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
        if self.instance:
            allowed_ids.update(self.instance.sets.values_list("exercise_id", flat=True))
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
            set_data["set_number"] = index
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
                set_data["set_number"] = index
                GymSet.objects.create(session=instance, **set_data)
        return instance
