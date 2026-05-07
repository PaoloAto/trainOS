from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import QuerySet
from django.utils import timezone

from running.models import RunActivity

MARATHON_DISTANCE_KM = 42.195


def _round_km(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _pace_seconds(distance_km: float, duration_seconds: int) -> float | None:
    if distance_km <= 0 or duration_seconds <= 0:
        return None
    return round(duration_seconds / distance_km, 1)


def _local_date(run: RunActivity) -> date:
    return timezone.localtime(run.started_at).date()


def _run_summary(run: RunActivity | None) -> dict | None:
    if run is None:
        return None
    return {
        "id": run.id,
        "title": run.title,
        "started_at": run.started_at.isoformat(),
        "distance_km": round(run.distance_km, 3),
        "duration_seconds": run.duration_seconds,
        "avg_pace_seconds_per_km": run.avg_pace_seconds_per_km,
        "source": run.source,
        "avg_hr": run.avg_hr,
        "max_hr": run.max_hr,
        "elevation_gain_m": run.elevation_gain_m,
        "raw_metadata": run.raw_metadata,
    }


def _long_run_summary(run: RunActivity) -> dict:
    return {
        "id": run.id,
        "started_at": run.started_at.isoformat(),
        "date": _local_date(run).isoformat(),
        "distance_km": round(run.distance_km, 3),
        "duration_seconds": run.duration_seconds,
        "avg_pace_seconds_per_km": run.avg_pace_seconds_per_km,
        "source": run.source,
    }


def _period_summary(runs: list[RunActivity], start: date, end: date) -> dict:
    period_runs = [run for run in runs if start <= _local_date(run) <= end]
    distance = sum(run.distance_km for run in period_runs)
    duration = sum(run.duration_seconds for run in period_runs)
    return {
        "distance_km": _round_km(distance),
        "run_count": len(period_runs),
        "duration_seconds": duration,
        "avg_pace_seconds_per_km": _pace_seconds(distance, duration),
    }


def _weekly_distance_trend(runs: list[RunActivity], current_week_start: date) -> list[dict]:
    trend = []
    first_week_start = current_week_start - timedelta(weeks=7)
    for index in range(8):
        week_start = first_week_start + timedelta(weeks=index)
        week_end = week_start + timedelta(days=6)
        week_runs = [run for run in runs if week_start <= _local_date(run) <= week_end]
        distance = sum(run.distance_km for run in week_runs)
        duration = sum(run.duration_seconds for run in week_runs)
        trend.append(
            {
                "week_start": week_start.isoformat(),
                "distance_km": _round_km(distance),
                "run_count": len(week_runs),
                "duration_seconds": duration,
                "avg_pace_seconds_per_km": _pace_seconds(distance, duration),
            }
        )
    return trend


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _shift_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 + months
    year = month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def _monthly_distance_trend(runs: list[RunActivity], current_month_start: date) -> list[dict]:
    trend = []
    first_month_start = _shift_months(current_month_start, -5)
    for index in range(6):
        month_start = _shift_months(first_month_start, index)
        next_month_start = _shift_months(month_start, 1)
        month_end = next_month_start - timedelta(days=1)
        month_runs = [run for run in runs if month_start <= _local_date(run) <= month_end]
        distance = sum(run.distance_km for run in month_runs)
        duration = sum(run.duration_seconds for run in month_runs)
        trend.append(
            {
                "month_start": month_start.isoformat(),
                "distance_km": _round_km(distance),
                "run_count": len(month_runs),
                "duration_seconds": duration,
            }
        )
    return trend


def _recent_pace_trend(runs: list[RunActivity]) -> list[dict]:
    recent = sorted(runs, key=lambda run: run.started_at)[-12:]
    return [
        {
            "id": run.id,
            "date": _local_date(run).isoformat(),
            "distance_km": round(run.distance_km, 3),
            "avg_pace_seconds_per_km": run.avg_pace_seconds_per_km,
            "source": run.source,
        }
        for run in recent
    ]


def _baseline_label(longest_distance_km: float) -> str:
    if longest_distance_km >= 21:
        return "Half-marathon benchmark"
    if longest_distance_km >= 18:
        return "Long-run benchmark"
    if longest_distance_km >= 10:
        return "Endurance baseline"
    if longest_distance_km > 0:
        return "Starting baseline"
    return "No running baseline"


def _baseline_note(longest_distance_km: float) -> str:
    if longest_distance_km >= 21:
        return "You have a half-marathon-distance benchmark. Build consistency before treating this as a marathon prediction."
    if longest_distance_km >= 18:
        return "You have a long-run benchmark. Build weekly consistency before extending toward marathon distance."
    if longest_distance_km >= 10:
        return "You have an endurance baseline. Keep building long-run durability before reading marathon meaning into it."
    return "Log or import longer runs before using this as a marathon baseline."


def _format_reference_time(seconds: int | None) -> str:
    if not seconds:
        return "--"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours:
        return f"{hours}:{minutes:02d}"
    return f"{minutes} min"


def _confidence(total_runs: int) -> dict:
    if total_runs == 0:
        return {
            "confidence": "low",
            "reason": "Import or log your first run.",
            "suggested_next_action": "Log a manual run or import a TCX file to start your marathon baseline.",
        }
    if total_runs <= 3:
        return {
            "confidence": "low",
            "reason": "Import more runs before trusting trends.",
            "suggested_next_action": "Import 3-5 more runs to make weekly mileage and pace trends useful.",
        }
    if total_runs <= 8:
        return {
            "confidence": "medium",
            "reason": "Enough data for early trends.",
            "suggested_next_action": "Keep logging consistently to separate signal from one-off sessions.",
        }
    return {
        "confidence": "high",
        "reason": "Trends are becoming more meaningful.",
        "suggested_next_action": "Use weekly mileage and long-run progression to plan the next training block.",
    }


def _consistency(
    total_runs: int,
    runs: list[RunActivity],
    weekly_trend: list[dict],
    today: date,
) -> dict:
    runs_last_7_days = len([run for run in runs if today - timedelta(days=6) <= _local_date(run) <= today])
    runs_last_30_days = len([run for run in runs if today - timedelta(days=29) <= _local_date(run) <= today])
    active_weeks = len([week for week in weekly_trend if week["run_count"] > 0])

    if total_runs == 0:
        label = "No data"
        note = "Log or import runs to establish a training rhythm."
    elif total_runs <= 3:
        label = "Starting baseline"
        note = "A few runs are enough to start a baseline, but not enough to trust trends yet."
    elif active_weeks >= 5:
        label = "Consistent"
        note = f"You logged runs in {active_weeks} of the last 8 weeks."
    elif active_weeks >= 3:
        label = "Building consistency"
        note = f"You logged runs in {active_weeks} of the last 8 weeks. Keep the rhythm steady."
    else:
        label = "Starting baseline"
        note = "Build more active weeks before treating this as a consistent training rhythm."

    return {
        "runs_last_7_days": runs_last_7_days,
        "runs_last_30_days": runs_last_30_days,
        "active_weeks_last_8": active_weeks,
        "consistency_label": label,
        "consistency_note": note,
    }


def _insights(
    total_runs: int,
    total_distance: float,
    longest_run: RunActivity | None,
    weekly_trend: list[dict],
    consistency: dict,
    marathon_reference: int | None,
) -> list[str]:
    if total_runs == 0:
        return [
            "No running data yet.",
            "Log a manual run or import a TCX file to start your marathon baseline.",
        ]

    assert longest_run is not None
    insights = [f"Your longest run is {longest_run.distance_km:.2f} km."]
    if longest_run.distance_km >= 21:
        insights.append("This is a half-marathon-distance benchmark.")
    elif longest_run.distance_km >= 18:
        insights.append("This is a long-run benchmark.")
    elif longest_run.distance_km >= 10:
        insights.append("This is an endurance-run benchmark.")

    if marathon_reference:
        insights.append(
            f"At the same pace, marathon distance is roughly {_format_reference_time(marathon_reference)}, but treat this as a reference, not a prediction."
        )

    if total_runs <= 3:
        insights.append("Import 3-5 more runs to make weekly mileage and pace trends useful.")
    else:
        active_weeks = consistency["active_weeks_last_8"]
        insights.append(f"You logged runs in {active_weeks} of the last 8 weeks.")
        if total_distance and longest_run.distance_km / total_distance >= 0.5:
            insights.append("Your longest run accounts for most of your current running volume.")
        recent_weeks = weekly_trend[-4:]
        previous_weeks = weekly_trend[-8:-4]
        recent_distance = sum(week["distance_km"] for week in recent_weeks)
        previous_distance = sum(week["distance_km"] for week in previous_weeks)
        if previous_distance > 0 and recent_distance > previous_distance:
            insights.append("Your recent weekly mileage is increasing compared with the previous block.")

    return insights[:5]


def running_analytics_for_user(user) -> dict:
    queryset: QuerySet[RunActivity] = RunActivity.objects.filter(user=user).select_related("import_batch")
    runs = list(queryset)
    runs_by_date = sorted(runs, key=lambda run: run.started_at)
    total_runs = len(runs)
    total_distance = sum(run.distance_km for run in runs)
    total_duration = sum(run.duration_seconds for run in runs)
    imported_runs = [
        run for run in runs
        if run.source != "manual" or run.import_batch_id is not None or bool(run.source_activity_id)
    ]
    manual_runs = [run for run in runs if run not in imported_runs]

    today = timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    month_start = _month_start(today)

    week_summary = _period_summary(runs, week_start, today)
    month_summary = _period_summary(runs, month_start, today)
    weekly_trend = _weekly_distance_trend(runs, week_start)
    monthly_trend = _monthly_distance_trend(runs, month_start)

    longest_run = max(runs, key=lambda run: run.distance_km, default=None)
    longest_distance = longest_run.distance_km if longest_run else 0
    longest_pace = longest_run.avg_pace_seconds_per_km if longest_run else None
    marathon_reference = round(longest_pace * MARATHON_DISTANCE_KM) if longest_pace else None
    consistency = _consistency(total_runs, runs, weekly_trend, today)

    return {
        "summary": {
            "total_runs": total_runs,
            "total_distance_km": _round_km(total_distance),
            "total_duration_seconds": total_duration,
            "avg_pace_seconds_per_km": _pace_seconds(total_distance, total_duration),
            "imported_run_count": len(imported_runs),
            "manual_run_count": len(manual_runs),
            "average_distance_km": _round_km(total_distance / total_runs) if total_runs else 0,
            "longest_run_distance_km": _round_km(longest_distance),
            "latest_run_date": _local_date(runs_by_date[-1]).isoformat() if runs_by_date else None,
        },
        "current_week": {
            "week_start": week_start.isoformat(),
            "week_distance_km": week_summary["distance_km"],
            "week_run_count": week_summary["run_count"],
            "week_duration_seconds": week_summary["duration_seconds"],
            "week_avg_pace_seconds_per_km": week_summary["avg_pace_seconds_per_km"],
        },
        "current_month": {
            "month_distance_km": month_summary["distance_km"],
            "month_run_count": month_summary["run_count"],
            "month_duration_seconds": month_summary["duration_seconds"],
            "month_avg_pace_seconds_per_km": month_summary["avg_pace_seconds_per_km"],
        },
        "longest_run": _run_summary(longest_run),
        "recent_long_runs": [
            _long_run_summary(run)
            for run in sorted(
                [run for run in runs if run.distance_km >= 10],
                key=lambda run: run.started_at,
                reverse=True,
            )[:5]
        ],
        "weekly_distance_trend": weekly_trend,
        "monthly_distance_trend": monthly_trend,
        "recent_pace_trend": _recent_pace_trend(runs),
        "long_run_progression": [
            _long_run_summary(run)
            for run in sorted([run for run in runs if run.distance_km >= 10], key=lambda run: run.started_at)[-8:]
        ],
        "marathon_baseline": {
            "longest_distance_km": _round_km(longest_distance),
            "distance_gap_to_marathon_km": _round_km(max(MARATHON_DISTANCE_KM - longest_distance, 0)),
            "marathon_time_at_longest_run_pace_seconds": marathon_reference,
            "half_marathon_benchmark": longest_distance >= 21,
            "baseline_label": _baseline_label(longest_distance),
            "baseline_note": _baseline_note(longest_distance) if longest_run else "Log or import your first run to create a marathon baseline.",
        },
        "consistency": consistency,
        "data_quality": _confidence(total_runs),
        "insights": _insights(total_runs, total_distance, longest_run, weekly_trend, consistency, marathon_reference),
    }
