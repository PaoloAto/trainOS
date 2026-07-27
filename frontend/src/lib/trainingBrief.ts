import {
  defaultTrainingPreferences,
  type ActiveWorkout,
  type ClimbingAnalytics,
  type ClimbingProject,
  type ClimbingSession,
  type DailyCheckIn,
  type GymAnalytics,
  type GymSession,
  type RunActivity,
  type RunningAnalytics,
  type TrainingPreferences,
} from "@/lib/api";

export type TrainingBriefPillar = "readiness" | "run" | "gym" | "climb" | "balance";
export type TrainingBriefTone = "positive" | "attention" | "info";
export type TrainingBriefActionTarget = "check-in" | "run" | "gym" | "climb" | "project";

export type TrainingBriefInsight = {
  id: string;
  pillar: TrainingBriefPillar;
  tone: TrainingBriefTone;
  title: string;
  message: string;
  actionLabel?: string;
  actionTarget?: TrainingBriefActionTarget;
};

type TrainingBriefInput = {
  checkIn: DailyCheckIn | null;
  runningAnalytics: RunningAnalytics | null;
  gymAnalytics: GymAnalytics | null;
  climbingAnalytics: ClimbingAnalytics | null;
  activeWorkout: ActiveWorkout | null;
  climbingProjects: ClimbingProject[];
  latestRun: RunActivity | null;
  latestGymSession: GymSession | null;
  latestClimbingSession: ClimbingSession | null;
  trainingPreferences?: TrainingPreferences | null;
};

type PrioritizedInsight = TrainingBriefInsight & { priority: number };

export function buildTrainingBrief({
  checkIn,
  runningAnalytics,
  gymAnalytics,
  climbingAnalytics,
  activeWorkout,
  climbingProjects,
  latestRun,
  latestClimbingSession,
  trainingPreferences,
}: TrainingBriefInput): TrainingBriefInsight[] {
  const insights: PrioritizedInsight[] = [];
  const preferences = trainingPreferences ?? defaultTrainingPreferences;

  addReadinessInsights(insights, checkIn);
  addRunningInsights(insights, runningAnalytics, latestRun, preferences);
  addGymInsights(insights, gymAnalytics, activeWorkout, preferences);
  addClimbingInsights(insights, climbingAnalytics, climbingProjects, latestClimbingSession, preferences);
  addBalanceInsights(insights, runningAnalytics, gymAnalytics, climbingAnalytics, preferences);

  const byId = new Map<string, PrioritizedInsight>();
  for (const insight of insights.sort((a, b) => a.priority - b.priority)) {
    if (!byId.has(insight.id)) byId.set(insight.id, insight);
  }

  return [...byId.values()].slice(0, 6).map(toTrainingBriefInsight);
}

function toTrainingBriefInsight(insight: PrioritizedInsight): TrainingBriefInsight {
  return {
    id: insight.id,
    pillar: insight.pillar,
    tone: insight.tone,
    title: insight.title,
    message: insight.message,
    actionLabel: insight.actionLabel,
    actionTarget: insight.actionTarget,
  };
}

function addReadinessInsights(insights: PrioritizedInsight[], checkIn: DailyCheckIn | null) {
  if (!checkIn) {
    insights.push({
      id: "readiness:no-check-in",
      priority: 5,
      pillar: "readiness",
      tone: "attention",
      title: "No check-in yet",
      message: "Log today's readiness to anchor training decisions.",
      actionLabel: "Log check-in",
      actionTarget: "check-in",
    });
    return;
  }

  const readinessFlags: PrioritizedInsight[] = [];

  if (isFiniteNumber(checkIn.soreness) && checkIn.soreness >= 8) {
    readinessFlags.push({
      id: "readiness:high-soreness",
      priority: 6,
      pillar: "readiness",
      tone: "attention",
      title: "High soreness logged",
      message: "Consider keeping intensity conservative today.",
    });
  }

  if (isFiniteNumber(checkIn.energy) && checkIn.energy <= 4) {
    readinessFlags.push({
      id: "readiness:low-energy",
      priority: 7,
      pillar: "readiness",
      tone: "attention",
      title: "Low energy today",
      message: "Keep the session easy or focus on recovery.",
    });
  }

  if (isFiniteNumber(checkIn.sleep_hours) && checkIn.sleep_hours < 6) {
    readinessFlags.push({
      id: "readiness:low-sleep",
      priority: 8,
      pillar: "readiness",
      tone: "attention",
      title: "Low sleep",
      message: "Watch intensity today.",
    });
  }

  insights.push(...readinessFlags.slice(0, 2));
}

function addRunningInsights(
  insights: PrioritizedInsight[],
  runningAnalytics: RunningAnalytics | null,
  latestRun: RunActivity | null,
  preferences: TrainingPreferences,
) {
  const target = preferences.running_sessions_per_week;

  if (!runningAnalytics && !latestRun) {
    insights.push({
      id: preferences.primary_focus === "running" ? "run:focus-no-week" : "run:no-runs",
      priority: preferences.primary_focus === "running" ? 16 : 45,
      pillar: "run",
      tone: "info",
      title: preferences.primary_focus === "running" ? "Running focus needs a run" : "No runs yet",
      message:
        preferences.primary_focus === "running"
          ? "Running is your focus, but no run is logged yet."
          : "Import or log a run to build your running baseline.",
      actionLabel: "Open Run",
      actionTarget: "run",
    });
    return;
  }

  if (runningAnalytics?.summary.total_runs === 0 && !latestRun) {
    insights.push({
      id: preferences.primary_focus === "running" ? "run:focus-no-week" : "run:no-runs",
      priority: preferences.primary_focus === "running" ? 16 : 45,
      pillar: "run",
      tone: "info",
      title: preferences.primary_focus === "running" ? "Running focus needs a run" : "No runs yet",
      message:
        preferences.primary_focus === "running"
          ? "Running is your focus, but no run is logged yet."
          : "Import or log a run to build your running baseline.",
      actionLabel: "Open Run",
      actionTarget: "run",
    });
    return;
  }

  const runsThisWeek = runningAnalytics?.current_week.week_run_count ?? 0;
  if (target > 0) {
    if (runsThisWeek === 0) {
      insights.push({
        id: preferences.primary_focus === "running" ? "run:focus-no-week" : "run:target-not-started",
        priority: preferences.primary_focus === "running" ? 16 : 36,
        pillar: "run",
        tone: "attention",
        title: preferences.primary_focus === "running" ? "Running focus needs a run" : "Running target not started",
        message:
          preferences.primary_focus === "running"
            ? "Running is your focus, but no run is logged this week."
            : `No runs logged this week. ${target} ${pluralize("run", target)} are planned.`,
        actionLabel: "Open Run",
        actionTarget: "run",
      });
    } else if (runsThisWeek >= target) {
      insights.push({
        id: "run:target-met",
        priority: 28,
        pillar: "run",
        tone: "positive",
        title: "Running target met",
        message: `You logged ${runsThisWeek} of ${target} planned ${pluralize("run", target)} this week.`,
        actionLabel: "View runs",
        actionTarget: "run",
      });
    } else if (runsThisWeek > 0) {
      const remaining = target - runsThisWeek;
      insights.push({
        id: "run:target-pending",
        priority: preferences.primary_focus === "running" ? 18 : 36,
        pillar: "run",
        tone: "attention",
        title: remaining === 1 ? "One run left" : `${remaining} runs left`,
        message: `${remaining} ${pluralize("run", remaining)} left to hit your weekly target.`,
        actionLabel: "Open Run",
        actionTarget: "run",
      });
    }
  }

  if (runsThisWeek >= 3) {
    insights.push({
      id: "run:consistency",
      priority: 26,
      pillar: "run",
      tone: "positive",
      title: "Running consistency is building",
      message: `You logged ${runsThisWeek} runs this week.`,
      actionLabel: "View runs",
      actionTarget: "run",
    });
  }

  const volumeJump = runningAnalytics ? runningVolumeJump(runningAnalytics) : null;
  if (volumeJump) {
    insights.push({
      id: "run:volume-up",
      priority: 30,
      pillar: "run",
      tone: "attention",
      title: "Running volume is up",
      message: "Watch recovery if this was a quick jump.",
      actionLabel: "View Run",
      actionTarget: "run",
    });
  }
}

function addGymInsights(
  insights: PrioritizedInsight[],
  gymAnalytics: GymAnalytics | null,
  activeWorkout: ActiveWorkout | null,
  preferences: TrainingPreferences,
) {
  if (activeWorkout) {
    insights.push({
      id: "gym:active-workout",
      priority: 12,
      pillar: "gym",
      tone: "attention",
      title: "Workout in progress",
      message: "Resume your current routine.",
      actionLabel: "Resume",
      actionTarget: "gym",
    });
    return;
  }

  if (!gymAnalytics) return;

  const sessionsThisWeek = gymAnalytics.summary.sessions_this_week;
  const setsThisWeek = gymAnalytics.summary.sets_this_week;
  const target = preferences.gym_sessions_per_week;

  if (sessionsThisWeek === 0) {
    insights.push({
      id: preferences.primary_focus === "gym" ? "gym:focus-no-week" : "gym:no-week",
      priority: preferences.primary_focus === "gym" ? 16 : 46,
      pillar: "gym",
      tone: "info",
      title: preferences.primary_focus === "gym" ? "Gym focus needs a session" : "No gym sessions this week",
      message:
        preferences.primary_focus === "gym"
          ? "Gym is your focus, but no session is logged yet."
          : "Quick-log a session or start a routine.",
      actionLabel: "Open Gym",
      actionTarget: "gym",
    });
    return;
  }

  if (target > 0) {
    if (sessionsThisWeek >= target) {
      insights.push({
        id: "gym:target-met",
        priority: 29,
        pillar: "gym",
        tone: "positive",
        title: "Gym target met",
        message: `You logged ${sessionsThisWeek} of ${target} planned ${pluralize("session", target)} this week.`,
        actionLabel: "View Gym",
        actionTarget: "gym",
      });
    } else {
      insights.push({
        id: "gym:target-pending",
        priority: preferences.primary_focus === "gym" ? 18 : 37,
        pillar: "gym",
        tone: "attention",
        title: "Gym target pending",
        message: `${target - sessionsThisWeek} ${pluralize("session", target - sessionsThisWeek)} left to hit your weekly target.`,
        actionLabel: "Open Gym",
        actionTarget: "gym",
      });
    }
  }

  if (setsThisWeek > 0) {
    insights.push({
      id: "gym:sets-logged",
      priority: 32,
      pillar: "gym",
      tone: "positive",
      title: "Strength work logged",
      message: `You logged ${setsThisWeek} sets this week.`,
      actionLabel: "View Gym",
      actionTarget: "gym",
    });
  }
}

function addClimbingInsights(
  insights: PrioritizedInsight[],
  climbingAnalytics: ClimbingAnalytics | null,
  climbingProjects: ClimbingProject[],
  latestClimbingSession: ClimbingSession | null,
  preferences: TrainingPreferences,
) {
  const activeProjects = climbingProjects.filter((project) => project.status === "active");
  const staleProject = [...activeProjects]
    .filter((project) => isFiniteNumber(project.days_since_last_attempt) && project.days_since_last_attempt >= 14)
    .sort((a, b) => (b.days_since_last_attempt ?? 0) - (a.days_since_last_attempt ?? 0))[0];

  if (staleProject) {
    insights.push({
      id: `climb:stale-project:${staleProject.id}`,
      priority: 14,
      pillar: "climb",
      tone: "attention",
      title: "Project getting stale",
      message: `${safeName(staleProject.name, "A climbing project")} has not been touched in ${staleProject.days_since_last_attempt} days.`,
      actionLabel: "View projects",
      actionTarget: "climb",
    });
  }

  const activeProjectCount = climbingAnalytics?.summary.active_project_count ?? activeProjects.length;
  if (activeProjectCount > 0) {
    insights.push({
      id: "climb:active-projects",
      priority: staleProject ? 34 : 22,
      pillar: "climb",
      tone: "info",
      title: "Active climbing projects",
      message: `You have ${activeProjectCount} active project${activeProjectCount === 1 ? "" : "s"}.`,
      actionLabel: "View Climb",
      actionTarget: "climb",
    });
  }

  if (!climbingAnalytics && !latestClimbingSession && activeProjects.length === 0) {
    insights.push({
      id: "climb:no-week",
      priority: 47,
      pillar: "climb",
      tone: "info",
      title: "No climbing logged this week",
      message: "Log bouldering or top rope to keep your climbing baseline current.",
      actionLabel: "Open Climb",
      actionTarget: "climb",
    });
    return;
  }

  const sessionsThisWeek = climbingAnalytics?.summary.sessions_this_week;
  const triesThisWeek = climbingAnalytics?.summary.attempts_this_week;
  const target = preferences.climbing_sessions_per_week;

  if (sessionsThisWeek === 0) {
    insights.push({
      id: preferences.primary_focus === "climbing" ? "climb:focus-no-week" : "climb:no-week",
      priority: preferences.primary_focus === "climbing" ? 16 : 47,
      pillar: "climb",
      tone: "info",
      title: preferences.primary_focus === "climbing" ? "Climbing focus needs a session" : "No climbing logged this week",
      message:
        preferences.primary_focus === "climbing"
          ? "Climbing is your focus, but no climbing session is logged yet."
          : "Log bouldering or top rope to keep your climbing baseline current.",
      actionLabel: "Open Climb",
      actionTarget: "climb",
    });
    return;
  }

  if (isFiniteNumber(sessionsThisWeek) && target > 0) {
    if (sessionsThisWeek >= target) {
      insights.push({
        id: "climb:target-met",
        priority: 30,
        pillar: "climb",
        tone: "positive",
        title: "Climbing target met",
        message: `You logged ${sessionsThisWeek} of ${target} planned ${pluralize("session", target)} this week.`,
        actionLabel: "View Climb",
        actionTarget: "climb",
      });
    } else {
      insights.push({
        id: "climb:target-pending",
        priority: preferences.primary_focus === "climbing" ? 18 : 38,
        pillar: "climb",
        tone: "attention",
        title: "Climbing target pending",
        message: `${target - sessionsThisWeek} ${pluralize("session", target - sessionsThisWeek)} left to hit your weekly target.`,
        actionLabel: "Open Climb",
        actionTarget: "climb",
      });
    }
  }

  if (isFiniteNumber(triesThisWeek) && triesThisWeek > 0) {
    insights.push({
      id: "climb:tries-logged",
      priority: 33,
      pillar: "climb",
      tone: "positive",
      title: "Climbing volume logged",
      message: `You logged ${triesThisWeek} tries this week.`,
      actionLabel: "View Climb",
      actionTarget: "climb",
    });
  }

  const currentBoulderingGrade = climbingAnalytics?.bouldering_progression.highest_sent_grade;
  const targetBoulderingGrade = preferences.climbing_target_bouldering_grade.trim();
  if (currentBoulderingGrade && targetBoulderingGrade) {
    insights.push({
      id: "climb:bouldering-target",
      priority: 42,
      pillar: "climb",
      tone: "info",
      title: "Bouldering target noted",
      message: `Current sent benchmark: ${currentBoulderingGrade}. Target: ${targetBoulderingGrade}.`,
      actionLabel: "View Climb",
      actionTarget: "climb",
    });
  }
}

function addBalanceInsights(
  insights: PrioritizedInsight[],
  runningAnalytics: RunningAnalytics | null,
  gymAnalytics: GymAnalytics | null,
  climbingAnalytics: ClimbingAnalytics | null,
  preferences: TrainingPreferences,
) {
  if (!runningAnalytics && !gymAnalytics && !climbingAnalytics) return;

  const pillars = [
    {
      key: "run",
      label: "Run",
      active: Boolean(
        (runningAnalytics?.current_week.week_run_count ?? 0) > 0 ||
          (runningAnalytics?.current_week.week_distance_km ?? 0) > 0,
      ),
    },
    {
      key: "gym",
      label: "Gym",
      active: Boolean(
        (gymAnalytics?.summary.sessions_this_week ?? 0) > 0 || (gymAnalytics?.summary.sets_this_week ?? 0) > 0,
      ),
    },
    {
      key: "climb",
      label: "Climb",
      active: Boolean(
        (climbingAnalytics?.summary.sessions_this_week ?? 0) > 0 ||
          (climbingAnalytics?.summary.attempts_this_week ?? 0) > 0,
      ),
    },
  ] as const;

  const activePillars = pillars.filter((pillar) => pillar.active);

  if (activePillars.length === 3) {
    insights.push({
      id: "balance:all-three",
      priority: 24,
      pillar: "balance",
      tone: "positive",
      title: preferences.primary_focus === "balanced" ? "Balanced week in progress" : "Balanced training week",
      message: "You logged Run, Gym, and Climb this week.",
    });
    return;
  }

  if (activePillars.length === 1) {
    const pillar = activePillars[0];
    insights.push({
      id: `balance:${pillar.key}-heavy`,
      priority: 44,
      pillar: "balance",
      tone: "attention",
      title: `Training is ${pillar.label.toLowerCase()}-heavy`,
      message: "Consider balancing with another pillar if recovery allows.",
    });
  }
}

function pluralize(label: string, count: number) {
  return count === 1 ? label : `${label}s`;
}

function runningVolumeJump(runningAnalytics: RunningAnalytics) {
  const currentDistance = runningAnalytics.current_week.week_distance_km;
  if (!isFiniteNumber(currentDistance) || currentDistance < 5) return false;

  const previousWeeks = runningAnalytics.weekly_distance_trend
    .slice(0, -1)
    .map((week) => week.distance_km)
    .filter((distance) => isFiniteNumber(distance) && distance > 0);

  if (previousWeeks.length < 2) return false;

  const previousAverage = previousWeeks.reduce((total, distance) => total + distance, 0) / previousWeeks.length;
  return currentDistance >= previousAverage * 1.35 && currentDistance - previousAverage >= 3;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeName(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}
