from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import QuerySet
from django.utils import timezone

from gym.models import GymSession, GymSet, MuscleGroup


def _week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def _session_date(session: GymSession) -> date:
    return session.date


def _period_sessions(sessions: list[GymSession], start: date, end: date) -> list[GymSession]:
    return [session for session in sessions if start <= _session_date(session) <= end]


def _period_sets(sets: list[GymSet], start: date, end: date) -> list[GymSet]:
    return [gym_set for gym_set in sets if start <= gym_set.session.date <= end]


def _weighted_volume(gym_set: GymSet) -> float:
    if not gym_set.weight or gym_set.weight <= 0:
        return 0
    return gym_set.weight * gym_set.reps


def _weekly_session_trend(sessions: list[GymSession], sets: list[GymSet], current_week_start: date) -> list[dict]:
    trend = []
    first_week_start = current_week_start - timedelta(weeks=7)
    for index in range(8):
        week_start = first_week_start + timedelta(weeks=index)
        week_end = week_start + timedelta(days=6)
        week_sessions = _period_sessions(sessions, week_start, week_end)
        week_sets = _period_sets(sets, week_start, week_end)
        trend.append(
            {
                "week_start": week_start.isoformat(),
                "session_count": len(week_sessions),
                "set_count": len(week_sets),
            }
        )
    return trend


def _muscle_coverage(sets: list[GymSet], muscle_groups: list[MuscleGroup]) -> list[dict]:
    primary_counts: dict[int, int] = defaultdict(int)
    secondary_counts: dict[int, int] = defaultdict(int)

    for gym_set in sets:
        exercise = gym_set.exercise
        primary_counts[exercise.primary_muscle_group_id] += 1
        for muscle_group in exercise.secondary_muscle_groups.all():
            secondary_counts[muscle_group.id] += 1

    return [
        {
            "muscle_group_id": muscle_group.id,
            "muscle_group_name": muscle_group.name,
            "primary_set_count": primary_counts[muscle_group.id],
            "secondary_set_count": secondary_counts[muscle_group.id],
            "total_set_count": primary_counts[muscle_group.id] + secondary_counts[muscle_group.id],
        }
        for muscle_group in muscle_groups
    ]


def _split_distribution(sessions: list[GymSession]) -> list[dict]:
    counts: dict[str, int] = defaultdict(int)
    for session in sessions:
        counts[session.split_type] += 1
    return [
        {"split_type": split_type, "session_count": counts[split_type]}
        for split_type, _label in GymSession.SplitType.choices
    ]


def _top_exercises_by_sets(sets: list[GymSet]) -> list[dict]:
    counts: dict[int, dict] = {}
    for gym_set in sets:
        exercise = gym_set.exercise
        item = counts.setdefault(
            exercise.id,
            {
                "exercise_id": exercise.id,
                "exercise_name": exercise.name,
                "primary_muscle_group_name": exercise.primary_muscle_group.name,
                "set_count": 0,
            },
        )
        item["set_count"] += 1
    return sorted(counts.values(), key=lambda item: item["set_count"], reverse=True)[:5]


def _top_exercises_by_volume(sets: list[GymSet]) -> list[dict]:
    totals: dict[int, dict] = {}
    for gym_set in sets:
        volume = _weighted_volume(gym_set)
        if volume <= 0:
            continue
        exercise = gym_set.exercise
        item = totals.setdefault(
            exercise.id,
            {
                "exercise_id": exercise.id,
                "exercise_name": exercise.name,
                "volume": 0,
                "set_count": 0,
            },
        )
        item["volume"] += volume
        item["set_count"] += 1
    return sorted(
        [
            {**item, "volume": round(item["volume"], 1)}
            for item in totals.values()
        ],
        key=lambda item: item["volume"],
        reverse=True,
    )[:5]


def _recent_sessions(sessions: list[GymSession]) -> list[dict]:
    return [
        {
            "id": session.id,
            "date": session.date.isoformat(),
            "split_type": session.split_type,
            "duration_minutes": session.duration_minutes,
            "set_count": session.sets.count(),
            "exercise_names": list(session.sets.values_list("exercise__name", flat=True).distinct()),
        }
        for session in sorted(sessions, key=lambda item: (item.date, item.created_at), reverse=True)[:5]
    ]


def _insights(week_sessions: list[GymSession], coverage: list[dict]) -> list[str]:
    insights = [f"You logged {len(week_sessions)} gym session{'s' if len(week_sessions) != 1 else ''} this week."]
    trained = [item for item in coverage if item["total_set_count"] > 0]
    if trained:
        top = max(trained, key=lambda item: item["total_set_count"])
        insights.append(f"{top['muscle_group_name']} is your most trained muscle group this week.")
    else:
        insights.append("No muscle groups have logged sets this week.")

    zero_targets = [
        item["muscle_group_name"]
        for item in coverage
        if item["total_set_count"] == 0 and item["muscle_group_name"] in {"Legs", "Quads", "Hamstrings", "Glutes", "Core", "Back", "Chest"}
    ]
    if zero_targets:
        insights.append(f"You have not logged {', '.join(zero_targets[:3])} this week.")
    return insights[:5]


def gym_analytics_for_user(user) -> dict:
    sessions_qs: QuerySet[GymSession] = (
        GymSession.objects.filter(user=user)
        .prefetch_related("sets__exercise__primary_muscle_group", "sets__exercise__secondary_muscle_groups")
    )
    sessions = list(sessions_qs)
    sets = list(
        GymSet.objects.filter(session__user=user)
        .select_related("session", "exercise", "exercise__primary_muscle_group")
        .prefetch_related("exercise__secondary_muscle_groups")
    )
    muscle_groups = list(MuscleGroup.objects.all())

    today = timezone.localdate()
    week_start = _week_start(today)
    month_start = today.replace(day=1)
    week_sessions = _period_sessions(sessions, week_start, today)
    month_sessions = _period_sessions(sessions, month_start, today)
    week_sets = _period_sets(sets, week_start, today)
    month_sets = _period_sets(sets, month_start, today)
    coverage = _muscle_coverage(week_sets, muscle_groups)

    return {
        "summary": {
            "total_sessions": len(sessions),
            "total_sets": len(sets),
            "total_exercises_used": len({gym_set.exercise_id for gym_set in sets}),
            "sessions_this_week": len(week_sessions),
            "sessions_this_month": len(month_sessions),
            "sets_this_week": len(week_sets),
            "sets_this_month": len(month_sets),
        },
        "muscle_coverage_this_week": coverage,
        "split_distribution_this_month": _split_distribution(month_sessions),
        "weekly_session_trend": _weekly_session_trend(sessions, sets, week_start),
        "top_exercises_by_sets": _top_exercises_by_sets(sets),
        "top_exercises_by_volume": _top_exercises_by_volume(sets),
        "recent_sessions": _recent_sessions(sessions),
        "deterministic_insights": _insights(week_sessions, coverage),
    }
