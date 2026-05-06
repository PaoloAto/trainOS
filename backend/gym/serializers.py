from django.db.models import Q
from rest_framework import serializers

from .models import Exercise, ExerciseReference, GymSession, GymSet, MuscleGroup


def accessible_exercises(user):
    return Exercise.objects.filter(Q(user=user) | Q(user__isnull=True))


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
    references = ExerciseReferenceSerializer(many=True, read_only=True)

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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_custom", "created_at", "updated_at", "references"]

    def get_secondary_muscle_group_names(self, obj):
        return [group.name for group in obj.secondary_muscle_groups.all()]


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