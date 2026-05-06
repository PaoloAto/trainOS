from django.contrib import admin

from .models import DailyCheckIn


@admin.register(DailyCheckIn)
class DailyCheckInAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "mood", "energy", "soreness", "stress", "sleep_hours", "sleep_quality")
    list_filter = ("date", "mood", "energy", "soreness", "stress")
    search_fields = ("user__username", "notes")
    date_hierarchy = "date"