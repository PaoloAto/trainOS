from rest_framework import serializers

from .models import ClimbAttempt, ClimbingProject, ClimbingSession


class ClimbAttemptSerializer(serializers.ModelSerializer):
    grade_system = serializers.ChoiceField(choices=ClimbAttempt._meta.get_field("grade_system").choices, required=False)

    class Meta:
        model = ClimbAttempt
        fields = [
            "id",
            "climb_name",
            "grade_system",
            "grade",
            "style",
            "result",
            "attempts",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ClimbingSessionSerializer(serializers.ModelSerializer):
    attempts = ClimbAttemptSerializer(many=True, required=False)
    attempt_count = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()

    class Meta:
        model = ClimbingSession
        fields = [
            "id",
            "date",
            "location",
            "session_type",
            "duration_minutes",
            "notes",
            "attempts",
            "attempt_count",
            "summary",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "attempt_count", "summary", "created_at", "updated_at"]

    def validate(self, attrs):
        session_type = attrs.get("session_type", getattr(self.instance, "session_type", ""))
        attempts = attrs.get("attempts", [])
        for attempt in attempts:
            if not attempt.get("grade_system"):
                if session_type == "top_rope":
                    attempt["grade_system"] = "yds"
                elif session_type == "bouldering":
                    attempt["grade_system"] = "v_scale"
        return attrs

    def get_attempt_count(self, obj):
        return obj.attempts.count()

    def get_summary(self, obj):
        return [f"{attempt.grade} {attempt.result}" for attempt in obj.attempts.all()[:3]]

    def create(self, validated_data):
        attempts_data = validated_data.pop("attempts", [])
        session = ClimbingSession.objects.create(**validated_data)
        for attempt_data in attempts_data:
            ClimbAttempt.objects.create(session=session, **attempt_data)
        return session

    def update(self, instance, validated_data):
        attempts_data = validated_data.pop("attempts", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if attempts_data is not None:
            instance.attempts.all().delete()
            for attempt_data in attempts_data:
                ClimbAttempt.objects.create(session=instance, **attempt_data)
        return instance


class ClimbingProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClimbingProject
        fields = [
            "id",
            "name",
            "grade",
            "grade_system",
            "location",
            "status",
            "session_type",
            "started_at",
            "sent_at",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]