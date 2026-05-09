from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Iterable

from django.db.models import QuerySet
from django.utils import timezone

from climbing.models import ClimbAttempt, ClimbingChoices, ClimbingProject, ClimbingSession


BOULDERING_SEND_RESULTS = {"flash", "send", "repeat"}
TOP_ROPE_CLEAN_RESULTS = {"clean", "complete"}
STALE_PROJECT_DAYS = 30
RECENT_PROGRESS_DAYS = 60
TREND_WEEKS = 8
V4_TARGET = 4


def _week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def _period_sessions(sessions: list[ClimbingSession], start: date, end: date) -> list[ClimbingSession]:
    return [session for session in sessions if start <= session.date <= end]


def _period_attempts(attempts: list[ClimbAttempt], start: date, end: date) -> list[ClimbAttempt]:
    return [attempt for attempt in attempts if start <= attempt.session.date <= end]


def _attempt_units(attempts: Iterable[ClimbAttempt]) -> int:
    return sum(max(1, attempt.attempts) for attempt in attempts)


def parse_v_grade(grade: str) -> int | None:
    match = re.search(r"\bv\s*(\d+)\b", grade.lower())
    return int(match.group(1)) if match else None


def parse_yds_grade(grade: str) -> tuple[int, int, int] | None:
    match = re.search(r"\b5\.(\d+)\s*([abcd]?)\b", grade.lower())
    if not match:
        return None
    suffix = {"": 0, "a": 1, "b": 2, "c": 3, "d": 4}.get(match.group(2), 0)
    return (5, int(match.group(1)), suffix)


def _v_grade_key(grade: str) -> tuple[int, str]:
    parsed = parse_v_grade(grade)
    return (parsed if parsed is not None else -1, grade)


def _yds_grade_key(grade: str) -> tuple[int, int, int, str]:
    parsed = parse_yds_grade(grade)
    if parsed is None:
        return (0, 0, 0, grade)
    return (*parsed, grade)


def _highest_grade(attempts: list[ClimbAttempt], grade_system: str, allowed_results: set[str] | None = None) -> str | None:
    filtered = [
        attempt
        for attempt in attempts
        if attempt.grade_system == grade_system and (allowed_results is None or attempt.result in allowed_results)
    ]
    if not filtered:
        return None
    if grade_system == ClimbingChoices.GradeSystem.V_SCALE:
        return max(filtered, key=lambda attempt: _v_grade_key(attempt.grade)).grade
    if grade_system == ClimbingChoices.GradeSystem.YDS:
        return max(filtered, key=lambda attempt: _yds_grade_key(attempt.grade)).grade
    return sorted(filtered, key=lambda attempt: attempt.grade)[-1].grade


def _most_common_grade(attempts: list[ClimbAttempt]) -> str | None:
    if not attempts:
        return None
    return Counter(attempt.grade for attempt in attempts).most_common(1)[0][0]


def _grade_distribution(attempts: list[ClimbAttempt]) -> list[dict]:
    distribution: dict[str, dict] = {}
    for attempt in attempts:
        item = distribution.setdefault(
            attempt.grade,
            {
                "grade": attempt.grade,
                "grade_system": attempt.grade_system,
                "attempt_count": 0,
                "logged_climb_count": 0,
                "send_or_clean_count": 0,
            },
        )
        item["attempt_count"] += max(1, attempt.attempts)
        item["logged_climb_count"] += 1
        if attempt.result in BOULDERING_SEND_RESULTS | TOP_ROPE_CLEAN_RESULTS:
            item["send_or_clean_count"] += 1

    def sort_key(item: dict):
        if item["grade_system"] == ClimbingChoices.GradeSystem.V_SCALE:
            return (0, _v_grade_key(item["grade"]))
        if item["grade_system"] == ClimbingChoices.GradeSystem.YDS:
            return (1, _yds_grade_key(item["grade"]))
        return (2, item["grade"])

    return sorted(distribution.values(), key=sort_key)


def _success_rate_by_grade(attempts: list[ClimbAttempt], success_results: set[str]) -> list[dict]:
    by_grade: dict[tuple[str, str], dict] = {}
    for attempt in attempts:
        key = (attempt.grade_system, attempt.grade)
        item = by_grade.setdefault(
            key,
            {
                "grade": attempt.grade,
                "grade_system": attempt.grade_system,
                "attempt_count": 0,
                "logged_climb_count": 0,
                "success_count": 0,
                "success_rate": 0.0,
            },
        )
        item["attempt_count"] += max(1, attempt.attempts)
        item["logged_climb_count"] += 1
        if attempt.result in success_results:
            item["success_count"] += 1

    for item in by_grade.values():
        item["success_rate"] = round(item["success_count"] / item["logged_climb_count"], 2) if item["logged_climb_count"] else 0.0

    def sort_key(item: dict):
        if item["grade_system"] == ClimbingChoices.GradeSystem.V_SCALE:
            return (0, _v_grade_key(item["grade"]))
        if item["grade_system"] == ClimbingChoices.GradeSystem.YDS:
            return (1, _yds_grade_key(item["grade"]))
        return (2, item["grade"])

    return sorted(by_grade.values(), key=sort_key)


def _v4_gap_label(highest_sent_grade: str | None) -> str:
    parsed = parse_v_grade(highest_sent_grade or "")
    if parsed is None:
        return "Log sends to establish progress toward V4."
    if parsed >= V4_TARGET:
        return "V4 target reached. Keep logging attempts to separate limit problems from repeatable sends."
    gap = V4_TARGET - parsed
    return f"You are {gap} grade{'s' if gap != 1 else ''} away from your V4 target."


def _bouldering_progression(attempts: list[ClimbAttempt], today: date) -> dict:
    recent_cutoff = today - timedelta(days=RECENT_PROGRESS_DAYS)
    recent_attempts = [attempt for attempt in attempts if attempt.session.date >= recent_cutoff]
    return {
        "highest_sent_grade": _highest_grade(attempts, ClimbingChoices.GradeSystem.V_SCALE, BOULDERING_SEND_RESULTS),
        "highest_attempted_grade": _highest_grade(attempts, ClimbingChoices.GradeSystem.V_SCALE),
        "recent_highest_sent_grade": _highest_grade(recent_attempts, ClimbingChoices.GradeSystem.V_SCALE, BOULDERING_SEND_RESULTS),
        "recent_highest_attempted_grade": _highest_grade(recent_attempts, ClimbingChoices.GradeSystem.V_SCALE),
        "v4_gap_label": _v4_gap_label(_highest_grade(attempts, ClimbingChoices.GradeSystem.V_SCALE, BOULDERING_SEND_RESULTS)),
        "grade_distribution": _grade_distribution(attempts),
        "send_rate_by_grade": _success_rate_by_grade(attempts, BOULDERING_SEND_RESULTS),
    }


def _top_rope_progression(attempts: list[ClimbAttempt], today: date) -> dict:
    recent_cutoff = today - timedelta(days=RECENT_PROGRESS_DAYS)
    recent_attempts = [attempt for attempt in attempts if attempt.session.date >= recent_cutoff]
    return {
        "highest_clean_grade": _highest_grade(attempts, ClimbingChoices.GradeSystem.YDS, TOP_ROPE_CLEAN_RESULTS),
        "highest_attempted_grade": _highest_grade(attempts, ClimbingChoices.GradeSystem.YDS),
        "recent_highest_clean_grade": _highest_grade(recent_attempts, ClimbingChoices.GradeSystem.YDS, TOP_ROPE_CLEAN_RESULTS),
        "grade_distribution": _grade_distribution(attempts),
        "clean_rate_by_grade": _success_rate_by_grade(attempts, TOP_ROPE_CLEAN_RESULTS),
    }


def _discipline_summary(attempts: list[ClimbAttempt], session_count: int, discipline: str) -> dict:
    if discipline == "bouldering":
        grade_system = ClimbingChoices.GradeSystem.V_SCALE
        return {
            "session_count": session_count,
            "attempt_count": _attempt_units(attempts),
            "send_count": len([attempt for attempt in attempts if attempt.result == ClimbingChoices.Result.SEND]),
            "flash_count": len([attempt for attempt in attempts if attempt.result == ClimbingChoices.Result.FLASH]),
            "project_count": len([attempt for attempt in attempts if attempt.result == ClimbingChoices.Result.PROJECT]),
            "fail_count": len([attempt for attempt in attempts if attempt.result == ClimbingChoices.Result.FAIL]),
            "highest_attempted_grade": _highest_grade(attempts, grade_system),
            "highest_sent_grade": _highest_grade(attempts, grade_system, BOULDERING_SEND_RESULTS),
            "most_common_grade": _most_common_grade(attempts),
            "grade_distribution": _grade_distribution(attempts),
        }

    grade_system = ClimbingChoices.GradeSystem.YDS
    return {
        "session_count": session_count,
        "attempt_count": _attempt_units(attempts),
        "clean_count": len([attempt for attempt in attempts if attempt.result == ClimbingChoices.Result.CLEAN]),
        "take_count": len([attempt for attempt in attempts if attempt.result == ClimbingChoices.Result.TAKE]),
        "fall_count": len([attempt for attempt in attempts if attempt.result == ClimbingChoices.Result.FALL]),
        "complete_count": len([attempt for attempt in attempts if attempt.result == ClimbingChoices.Result.COMPLETE]),
        "highest_attempted_grade": _highest_grade(attempts, grade_system),
        "highest_clean_grade": _highest_grade(attempts, grade_system, TOP_ROPE_CLEAN_RESULTS),
        "most_common_grade": _most_common_grade(attempts),
        "grade_distribution": _grade_distribution(attempts),
    }


def _session_type_distribution(sessions: list[ClimbingSession]) -> list[dict]:
    session_counts: dict[str, int] = defaultdict(int)
    attempt_counts: dict[str, int] = defaultdict(int)
    for session in sessions:
        session_counts[session.session_type] += 1
        attempt_counts[session.session_type] += _attempt_units(session.attempts.all())
    return [
        {
            "session_type": session_type,
            "session_count": session_counts[session_type],
            "attempt_count": attempt_counts[session_type],
        }
        for session_type, _label in ClimbingChoices.SessionType.choices
    ]


def _style_distribution(attempts: list[ClimbAttempt]) -> list[dict]:
    styles: dict[str, dict] = {}
    for attempt in attempts:
        style = attempt.style or "unspecified"
        item = styles.setdefault(
            style,
            {
                "style": style,
                "attempt_count": 0,
                "send_or_clean_count": 0,
            },
        )
        item["attempt_count"] += max(1, attempt.attempts)
        if attempt.result in BOULDERING_SEND_RESULTS | TOP_ROPE_CLEAN_RESULTS:
            item["send_or_clean_count"] += 1
    return sorted(styles.values(), key=lambda item: item["attempt_count"], reverse=True)


def _style_strengths(attempts: list[ClimbAttempt]) -> list[dict]:
    styles: dict[str, dict] = {}
    for attempt in attempts:
        style = attempt.style or "unspecified"
        item = styles.setdefault(
            style,
            {
                "style": style,
                "attempt_count": 0,
                "success_count": 0,
                "success_rate": 0.0,
                "insight_label": "",
            },
        )
        item["attempt_count"] += max(1, attempt.attempts)
        if attempt.result in BOULDERING_SEND_RESULTS | TOP_ROPE_CLEAN_RESULTS:
            item["success_count"] += 1
    for item in styles.values():
        item["success_rate"] = round(item["success_count"] / item["attempt_count"], 2) if item["attempt_count"] else 0.0
        if item["attempt_count"] < 2:
            item["insight_label"] = "Low sample"
        elif item["success_rate"] >= 0.6:
            item["insight_label"] = "Strong style"
        elif item["success_rate"] <= 0.25:
            item["insight_label"] = "Needs work"
        else:
            item["insight_label"] = "Building"
    return sorted(styles.values(), key=lambda item: (item["success_rate"], item["attempt_count"]), reverse=True)


def _project_linked_attempts(project: ClimbingProject) -> QuerySet[ClimbAttempt]:
    return project.attempts.select_related("session").order_by("-session__date", "-created_at", "-id")


def _project_latest_attempt(project: ClimbingProject) -> ClimbAttempt | None:
    return _project_linked_attempts(project).first()


def _project_linked_stats(project: ClimbingProject, today: date) -> dict:
    linked_attempts = _project_linked_attempts(project)
    latest_attempt = linked_attempts.first()
    linked_attempt_count = linked_attempts.count()
    linked_session_count = linked_attempts.values("session_id").distinct().count()
    latest_attempt_date = latest_attempt.session.date if latest_attempt else None
    return {
        "linked_attempt_count": linked_attempt_count,
        "linked_session_count": linked_session_count,
        "latest_attempt_date": latest_attempt_date,
        "latest_attempt_result": latest_attempt.result if latest_attempt else "",
        "days_since_last_attempt": max(0, (today - latest_attempt_date).days) if latest_attempt_date else None,
    }


def _project_summary(project: ClimbingProject, today: date | None = None) -> dict:
    today = today or timezone.localdate()
    linked_stats = _project_linked_stats(project, today)
    start_date = project.started_at or timezone.localtime(project.created_at).date()
    end_date = project.sent_at or today
    attempt_count = linked_stats["linked_attempt_count"]
    session_count = linked_stats["linked_session_count"]
    summary_parts = [
        f"{attempt_count} linked attempt{'s' if attempt_count != 1 else ''}",
        f"{session_count} session{'s' if session_count != 1 else ''}",
    ]
    if linked_stats["latest_attempt_date"]:
        formatted_date = linked_stats["latest_attempt_date"].strftime("%b %d").replace(" 0", " ")
        summary_parts.append(f"Last attempt: {formatted_date} - {linked_stats['latest_attempt_result']}")
    else:
        summary_parts.append("No linked attempts yet")
    return {
        "id": project.id,
        "name": project.name,
        "grade": project.grade,
        "grade_system": project.grade_system,
        "location": project.location,
        "status": project.status,
        "session_type": project.session_type,
        "started_at": project.started_at.isoformat() if project.started_at else None,
        "sent_at": project.sent_at.isoformat() if project.sent_at else None,
        "linked_attempt_count": attempt_count,
        "linked_session_count": session_count,
        "latest_attempt_date": linked_stats["latest_attempt_date"].isoformat() if linked_stats["latest_attempt_date"] else None,
        "latest_attempt_result": linked_stats["latest_attempt_result"],
        "days_active": max(0, (end_date - start_date).days),
        "days_since_last_attempt": linked_stats["days_since_last_attempt"],
        "attempt_summary_label": " across ".join(summary_parts[:2]) + f" / {summary_parts[2]}",
        "total_attempts": attempt_count,
        "sessions_worked": session_count,
        "latest_result": linked_stats["latest_attempt_result"],
        "progress_label": _project_progress_label(project, linked_stats),
        "updated_at": project.updated_at.isoformat(),
    }


def _project_progress_label(project: ClimbingProject, linked_stats: dict) -> str:
    if project.status == ClimbingProject.Status.SENT:
        return "Sent project."
    if linked_stats["linked_attempt_count"] == 0:
        return "No linked attempts yet."
    days_since = linked_stats["days_since_last_attempt"]
    if days_since is not None and days_since >= STALE_PROJECT_DAYS:
        return f"Untouched for {days_since} days."
    if linked_stats["latest_attempt_result"]:
        return f"Latest result: {linked_stats['latest_attempt_result']}."
    return "Project is moving."


def _project_analytics(projects: list[ClimbingProject], today: date) -> dict:
    status_counts = Counter(project.status for project in projects)
    stale_cutoff = today - timedelta(days=STALE_PROJECT_DAYS)
    project_attempt_totals = []
    stale_projects = [
        project
        for project in projects
        if project.status == ClimbingProject.Status.ACTIVE
        and (
            (_project_latest_attempt(project) and _project_latest_attempt(project).session.date <= stale_cutoff)
            or (
                not _project_latest_attempt(project)
                and ((project.started_at and project.started_at <= stale_cutoff) or (not project.started_at and timezone.localtime(project.created_at).date() <= stale_cutoff))
            )
        )
    ]
    for project in projects:
        summary = _project_summary(project, today)
        if summary["linked_attempt_count"] or project.status == ClimbingProject.Status.ACTIVE:
            project_attempt_totals.append(summary)
    sent_projects = [project for project in projects if project.status == ClimbingProject.Status.SENT]
    recently_sent = sorted(
        sent_projects,
        key=lambda project: project.sent_at or timezone.localtime(project.updated_at).date(),
        reverse=True,
    )[:5]
    return {
        "active_count": status_counts[ClimbingProject.Status.ACTIVE],
        "sent_count": status_counts[ClimbingProject.Status.SENT],
        "paused_count": status_counts[ClimbingProject.Status.PAUSED],
        "abandoned_count": status_counts[ClimbingProject.Status.ABANDONED],
        "stale_projects": [_project_summary(project, today) for project in sorted(stale_projects, key=lambda project: project.started_at or timezone.localtime(project.created_at).date())[:5]],
        "recently_sent_projects": [_project_summary(project, today) for project in recently_sent],
        "project_attempt_totals": sorted(project_attempt_totals, key=lambda project: project["linked_attempt_count"], reverse=True),
    }


def _project_progress(projects: list[ClimbingProject], today: date) -> list[dict]:
    active_projects = [project for project in projects if project.status == ClimbingProject.Status.ACTIVE]
    return sorted(
        [_project_summary(project, today) for project in active_projects],
        key=lambda item: (item["days_since_last_attempt"] if item["days_since_last_attempt"] is not None else 9999, -item["total_attempts"]),
    )


def _weekly_climbing_trend(sessions: list[ClimbingSession], today: date) -> list[dict]:
    current_week = _week_start(today)
    starts = [current_week - timedelta(weeks=offset) for offset in reversed(range(TREND_WEEKS))]
    result = []
    for start in starts:
        end = start + timedelta(days=6)
        week_sessions = [session for session in sessions if start <= session.date <= end]
        week_attempts = [attempt for session in week_sessions for attempt in session.attempts.all()]
        result.append(
            {
                "week_start": start.isoformat(),
                "session_count": len(week_sessions),
                "attempt_count": _attempt_units(week_attempts),
                "send_or_clean_count": len([attempt for attempt in week_attempts if attempt.result in BOULDERING_SEND_RESULTS | TOP_ROPE_CLEAN_RESULTS]),
            }
        )
    return result


def _recent_sessions(sessions: list[ClimbingSession]) -> list[dict]:
    recent = sorted(sessions, key=lambda session: (session.date, session.created_at), reverse=True)[:6]
    return [
        {
            "id": session.id,
            "date": session.date.isoformat(),
            "location": session.location,
            "session_type": session.session_type,
            "duration_minutes": session.duration_minutes,
            "attempt_count": _attempt_units(session.attempts.all()),
            "summary": [f"{attempt.grade} {attempt.result}" for attempt in session.attempts.all()[:3]],
        }
        for session in recent
    ]


def _insights(
    sessions: list[ClimbingSession],
    attempts: list[ClimbAttempt],
    bouldering: dict,
    top_rope: dict,
    projects: dict,
    style_strengths: list[dict],
    bouldering_progression: dict,
) -> list[str]:
    if not sessions:
        return [
            "No climbing sessions yet.",
            "Log bouldering or top rope to build your climbing baseline.",
        ]

    insights = [f"You logged {len(sessions)} climbing session{'s' if len(sessions) != 1 else ''}."]
    most_common_bouldering_grade = bouldering["most_common_grade"]
    if most_common_bouldering_grade:
        insights.append(f"Most bouldering attempts are around {most_common_bouldering_grade}.")
    if bouldering["highest_sent_grade"]:
        insights.append(f"Your highest bouldering send is {bouldering['highest_sent_grade']}.")
    if bouldering_progression["v4_gap_label"]:
        insights.append(bouldering_progression["v4_gap_label"])
    if top_rope["highest_clean_grade"]:
        insights.append(f"Your highest clean top-rope route is {top_rope['highest_clean_grade']}.")
    elif not [attempt for attempt in attempts if attempt.session.session_type == ClimbingChoices.SessionType.TOP_ROPE]:
        insights.append("Top-rope volume is low this month.")
    if style_strengths:
        strongest = style_strengths[0]
        if strongest["attempt_count"] >= 2:
            insights.append(f"Your strongest style by success rate is {strongest['style']}.")
    if projects["active_count"]:
        insights.append(f"You have {projects['active_count']} active climbing project{'s' if projects['active_count'] != 1 else ''}.")
    if projects["stale_projects"]:
        project = projects["stale_projects"][0]
        days = project.get("days_since_last_attempt") or project.get("days_active")
        insights.append(f"You have not touched {project['name']} in {days} days.")
    return insights[:5]


def climbing_analytics_for_user(user) -> dict:
    sessions_qs: QuerySet[ClimbingSession] = ClimbingSession.objects.filter(user=user).prefetch_related("attempts")
    sessions = list(sessions_qs)
    attempts = list(ClimbAttempt.objects.filter(session__user=user).select_related("session"))
    projects = list(ClimbingProject.objects.filter(user=user))

    today = timezone.localdate()
    week_start = _week_start(today)
    month_start = today.replace(day=1)
    week_sessions = _period_sessions(sessions, week_start, today)
    month_sessions = _period_sessions(sessions, month_start, today)
    week_attempts = _period_attempts(attempts, week_start, today)
    month_attempts = _period_attempts(attempts, month_start, today)
    bouldering_sessions = [session for session in sessions if session.session_type == ClimbingChoices.SessionType.BOULDERING]
    top_rope_sessions = [session for session in sessions if session.session_type == ClimbingChoices.SessionType.TOP_ROPE]
    bouldering_attempts = [attempt for attempt in attempts if attempt.session.session_type == ClimbingChoices.SessionType.BOULDERING]
    top_rope_attempts = [attempt for attempt in attempts if attempt.session.session_type == ClimbingChoices.SessionType.TOP_ROPE]
    project_data = _project_analytics(projects, today)

    bouldering = _discipline_summary(bouldering_attempts, len(bouldering_sessions), "bouldering")
    top_rope = _discipline_summary(top_rope_attempts, len(top_rope_sessions), "top_rope")
    bouldering_progression = _bouldering_progression(bouldering_attempts, today)
    top_rope_progression = _top_rope_progression(top_rope_attempts, today)
    style_strengths = _style_strengths(attempts)

    return {
        "summary": {
            "total_sessions": len(sessions),
            "total_attempts": _attempt_units(attempts),
            "sessions_this_week": len(week_sessions),
            "sessions_this_month": len(month_sessions),
            "attempts_this_week": _attempt_units(week_attempts),
            "attempts_this_month": _attempt_units(month_attempts),
            "active_project_count": project_data["active_count"],
            "sent_project_count": project_data["sent_count"],
        },
        "session_type_distribution": _session_type_distribution(sessions),
        "bouldering": bouldering,
        "top_rope": top_rope,
        "bouldering_progression": bouldering_progression,
        "top_rope_progression": top_rope_progression,
        "style_distribution": _style_distribution(attempts),
        "style_strengths": style_strengths,
        "projects": project_data,
        "project_progress": _project_progress(projects, today),
        "weekly_climbing_trend": _weekly_climbing_trend(sessions, today),
        "recent_sessions": _recent_sessions(sessions),
        "deterministic_insights": _insights(sessions, attempts, bouldering, top_rope, project_data, style_strengths, bouldering_progression),
    }
