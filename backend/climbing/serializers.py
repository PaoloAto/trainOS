from django.utils import timezone
from rest_framework import serializers

from .models import ClimbAttempt, ClimbingChoices, ClimbingProject, ClimbingSession


BOULDERING_SEND_RESULTS = {ClimbingChoices.Result.FLASH, ClimbingChoices.Result.SEND}
ROUTE_SEND_RESULTS = {ClimbingChoices.Result.CLEAN, ClimbingChoices.Result.COMPLETE}
GENERIC_SEND_RESULTS = {
    ClimbingChoices.Result.SEND,
    ClimbingChoices.Result.FLASH,
    ClimbingChoices.Result.CLEAN,
    ClimbingChoices.Result.COMPLETE,
}


def is_send_like_result(session_type: str, result: str) -> bool:
    if session_type == ClimbingChoices.SessionType.BOULDERING:
        return result in BOULDERING_SEND_RESULTS
    if session_type in {
        ClimbingChoices.SessionType.TOP_ROPE,
        ClimbingChoices.SessionType.SPORT,
        ClimbingChoices.SessionType.TRAD,
    }:
        return result in ROUTE_SEND_RESULTS
    return result in GENERIC_SEND_RESULTS


def maybe_mark_project_sent(project: ClimbingProject | None, session: ClimbingSession, result: str) -> None:
    if not project or not is_send_like_result(session.session_type, result):
        return
    update_fields = []
    if project.status != ClimbingProject.Status.SENT:
        project.status = ClimbingProject.Status.SENT
        update_fields.append("status")
    if project.sent_at is None:
        project.sent_at = session.date
        update_fields.append("sent_at")
    if update_fields:
        update_fields.append("updated_at")
        project.save(update_fields=update_fields)


class ClimbAttemptSerializer(serializers.ModelSerializer):
    grade_system = serializers.ChoiceField(choices=ClimbAttempt._meta.get_field("grade_system").choices, required=False)
    grade = serializers.CharField(required=False, allow_blank=True)
    project = serializers.PrimaryKeyRelatedField(queryset=ClimbingProject.objects.all(), required=False, allow_null=True)
    project_name = serializers.CharField(source="project.name", read_only=True)
    project_status = serializers.CharField(source="project.status", read_only=True)
    mark_project_sent = serializers.BooleanField(write_only=True, required=False, default=True)

    class Meta:
        model = ClimbAttempt
        fields = [
            "id",
            "project",
            "project_name",
            "project_status",
            "climb_name",
            "grade_system",
            "grade",
            "style",
            "result",
            "attempts",
            "notes",
            "mark_project_sent",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_project(self, project):
        if project is None:
            return project
        request = self.context.get("request")
        if request and project.user_id != request.user.id:
            raise serializers.ValidationError("Linked project does not belong to this user.")
        return project

    def validate(self, attrs):
        project = attrs.get("project")
        if project:
            attrs["climb_name"] = attrs.get("climb_name") or project.name
            attrs["grade"] = attrs.get("grade") or project.grade
            attrs["grade_system"] = attrs.get("grade_system") or project.grade_system
        if not attrs.get("grade"):
            raise serializers.ValidationError({"grade": "Grade is required unless a project is selected."})
        return attrs


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
                else:
                    attempt["grade_system"] = "other"
        return attrs

    def get_attempt_count(self, obj):
        return obj.attempts.count()

    def get_summary(self, obj):
        return [f"{attempt.grade} {attempt.result}" for attempt in obj.attempts.all()[:3]]

    def create(self, validated_data):
        attempts_data = validated_data.pop("attempts", [])
        session = ClimbingSession.objects.create(**validated_data)
        for attempt_data in attempts_data:
            mark_project_sent = attempt_data.pop("mark_project_sent", True)
            attempt = ClimbAttempt.objects.create(session=session, **attempt_data)
            if mark_project_sent:
                maybe_mark_project_sent(attempt.project, session, attempt.result)
        return session

    def update(self, instance, validated_data):
        attempts_data = validated_data.pop("attempts", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if attempts_data is not None:
            instance.attempts.all().delete()
            for attempt_data in attempts_data:
                mark_project_sent = attempt_data.pop("mark_project_sent", True)
                attempt = ClimbAttempt.objects.create(session=instance, **attempt_data)
                if mark_project_sent:
                    maybe_mark_project_sent(attempt.project, instance, attempt.result)
        return instance


class ClimbingProjectSerializer(serializers.ModelSerializer):
    linked_attempt_count = serializers.SerializerMethodField()
    linked_log_count = serializers.SerializerMethodField()
    total_try_count = serializers.SerializerMethodField()
    linked_session_count = serializers.SerializerMethodField()
    latest_attempt_date = serializers.SerializerMethodField()
    latest_attempt_result = serializers.SerializerMethodField()
    days_active = serializers.SerializerMethodField()
    days_since_last_attempt = serializers.SerializerMethodField()
    attempt_summary_label = serializers.SerializerMethodField()
    attempt_history = serializers.SerializerMethodField()

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
            "linked_attempt_count",
            "linked_log_count",
            "total_try_count",
            "linked_session_count",
            "latest_attempt_date",
            "latest_attempt_result",
            "days_active",
            "days_since_last_attempt",
            "attempt_summary_label",
            "attempt_history",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "linked_attempt_count",
            "linked_log_count",
            "total_try_count",
            "linked_session_count",
            "latest_attempt_date",
            "latest_attempt_result",
            "days_active",
            "days_since_last_attempt",
            "attempt_summary_label",
            "attempt_history",
            "created_at",
            "updated_at",
        ]

    def _linked_attempts(self, obj):
        return obj.attempts.select_related("session").order_by("-session__date", "-created_at", "-id")

    def _latest_attempt(self, obj):
        return self._linked_attempts(obj).first()

    def get_linked_attempt_count(self, obj):
        return obj.attempts.count()

    def get_linked_log_count(self, obj):
        return obj.attempts.count()

    def get_total_try_count(self, obj):
        return sum(max(1, attempt.attempts) for attempt in obj.attempts.all())

    def get_linked_session_count(self, obj):
        return obj.attempts.values("session_id").distinct().count()

    def get_latest_attempt_date(self, obj):
        latest_attempt = self._latest_attempt(obj)
        return latest_attempt.session.date.isoformat() if latest_attempt else None

    def get_latest_attempt_result(self, obj):
        latest_attempt = self._latest_attempt(obj)
        return latest_attempt.result if latest_attempt else ""

    def get_days_active(self, obj):
        start_date = obj.started_at or timezone.localtime(obj.created_at).date()
        end_date = obj.sent_at or timezone.localdate()
        return max(0, (end_date - start_date).days)

    def get_days_since_last_attempt(self, obj):
        latest_attempt = self._latest_attempt(obj)
        if not latest_attempt:
            return None
        return max(0, (timezone.localdate() - latest_attempt.session.date).days)

    def get_attempt_summary_label(self, obj):
        try_count = self.get_total_try_count(obj)
        session_count = self.get_linked_session_count(obj)
        latest_attempt = self._latest_attempt(obj)
        parts = [
            f"{try_count} tr{'y' if try_count == 1 else 'ies'}",
            f"{session_count} session{'s' if session_count != 1 else ''}",
        ]
        if latest_attempt:
            formatted_date = latest_attempt.session.date.strftime("%b %d").replace(" 0", " ")
            parts.append(f"Last attempt: {formatted_date} - {latest_attempt.result}")
        else:
            parts.append("No linked attempts yet")
        return " across ".join(parts[:2]) + (f" / {parts[2]}" if len(parts) > 2 else "")

    def get_attempt_history(self, obj):
        attempts = obj.attempts.select_related("session").order_by("session__date", "created_at", "id")
        return [
            {
                "id": attempt.id,
                "session_id": attempt.session_id,
                "date": attempt.session.date.isoformat(),
                "session_type": attempt.session.session_type,
                "location": attempt.session.location,
                "grade": attempt.grade,
                "grade_system": attempt.grade_system,
                "result": attempt.result,
                "tries_count": max(1, attempt.attempts),
                "notes": attempt.notes,
                "style": attempt.style,
            }
            for attempt in attempts
        ]
