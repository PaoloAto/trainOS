from django.contrib import admin

from .models import ClimbAttempt, ClimbingProject, ClimbingSession


class ClimbAttemptInline(admin.TabularInline):
    model = ClimbAttempt
    extra = 0


@admin.register(ClimbingSession)
class ClimbingSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "session_type", "location", "duration_minutes", "attempt_count")
    list_filter = ("session_type", "date", "location")
    search_fields = ("user__username", "location", "notes", "attempts__grade", "attempts__climb_name")
    date_hierarchy = "date"
    inlines = (ClimbAttemptInline,)

    @admin.display(description="Attempts")
    def attempt_count(self, obj):
        return obj.attempts.count()


@admin.register(ClimbAttempt)
class ClimbAttemptAdmin(admin.ModelAdmin):
    list_display = ("session", "project", "grade", "grade_system", "result", "attempts", "style", "climb_name")
    list_filter = ("grade_system", "result", "style", "session__session_type", "session__date", "project__status")
    search_fields = ("climb_name", "grade", "notes", "project__name", "session__user__username", "session__location")


@admin.register(ClimbingProject)
class ClimbingProjectAdmin(admin.ModelAdmin):
    list_display = ("user", "name", "grade", "grade_system", "session_type", "status", "location", "started_at", "sent_at")
    list_filter = ("status", "grade_system", "session_type", "location")
    search_fields = ("user__username", "name", "grade", "location", "notes")
    date_hierarchy = "started_at"
