from django.contrib import admin

from .models import Exercise, ExerciseReference, GymSession, GymSet, MuscleGroup


@admin.register(MuscleGroup)
class MuscleGroupAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


class ExerciseReferenceInline(admin.TabularInline):
    model = ExerciseReference
    extra = 0


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "primary_muscle_group", "movement_pattern", "equipment", "is_custom")
    list_filter = ("primary_muscle_group", "movement_pattern", "equipment", "is_custom")
    search_fields = ("name", "user__username", "form_notes")
    filter_horizontal = ("secondary_muscle_groups",)
    inlines = (ExerciseReferenceInline,)


@admin.register(ExerciseReference)
class ExerciseReferenceAdmin(admin.ModelAdmin):
    list_display = ("exercise", "source", "title", "url", "created_at")
    list_filter = ("source", "created_at")
    search_fields = ("exercise__name", "title", "url", "notes")


class GymSetInline(admin.TabularInline):
    model = GymSet
    extra = 0


@admin.register(GymSession)
class GymSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "split_type", "duration_minutes", "set_count")
    list_filter = ("split_type", "date")
    search_fields = ("user__username", "notes", "sets__exercise__name")
    date_hierarchy = "date"
    inlines = (GymSetInline,)

    @admin.display(description="Sets")
    def set_count(self, obj):
        return obj.sets.count()


@admin.register(GymSet)
class GymSetAdmin(admin.ModelAdmin):
    list_display = ("session", "exercise", "set_number", "weight", "reps", "rpe")
    list_filter = ("exercise", "session__split_type", "session__date")
    search_fields = ("exercise__name", "session__user__username", "notes")