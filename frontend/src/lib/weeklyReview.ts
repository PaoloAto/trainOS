import type {
  ActiveWorkout,
  ClimbingAnalytics,
  ClimbingProject,
  DailyCheckIn,
  GymAnalytics,
  RunningAnalytics,
  TrainingPreferences,
} from "@/lib/api";

export type ReviewAccent = "green" | "amber" | "indigo" | "neutral";
export type ReviewTone = "positive" | "attention" | "info";
export type ReviewActionTarget = "check-in" | "run" | "gym" | "climb" | "project";
export type ReviewActionKind = "quick-log" | "navigate";

export type WeeklyGoalCard = {
  id: "run" | "gym" | "climb";
  title: string;
  accent: ReviewAccent;
  hasTarget: boolean;
  primaryLabel: string;
  primaryValue: string;
  secondaryValue: string;
  statusLabel: string;
  statusTone: ReviewTone;
  progressPercent: number;
  details: string[];
};

export type WeeklyReviewItem = {
  id: string;
  tone: ReviewTone;
  pillar: "readiness" | "run" | "gym" | "climb" | "balance";
  title: string;
  message: string;
};

export type WeeklyReviewAction = {
  id: string;
  accent: ReviewAccent;
  title: string;
  message: string;
  actionLabel: string;
  actionTarget: ReviewActionTarget;
  actionKind: ReviewActionKind;
};

export type WeeklyReviewSnapshot = {
  totalTrainingSessions: number;
  runSessions: number;
  runDistanceKm: number;
  gymSessions: number;
  gymSets: number;
  climbSessions: number;
  climbTries: number;
  activeProjectCount: number;
  activeWorkoutName: string | null;
};

export type WeeklyReviewInput = {
  checkIn: DailyCheckIn | null;
  trainingPreferences: TrainingPreferences;
  runningAnalytics: RunningAnalytics | null;
  gymAnalytics: GymAnalytics | null;
  climbingAnalytics: ClimbingAnalytics | null;
  activeWorkout: ActiveWorkout | null;
  climbingProjects: ClimbingProject[];
};

export type WeeklyReviewOutput = {
  goals: WeeklyGoalCard[];
  highlights: WeeklyReviewItem[];
  attention: WeeklyReviewItem[];
  nextActions: WeeklyReviewAction[];
  snapshot: WeeklyReviewSnapshot;
};

function safeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatNumber(value: number, digits = 0) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function pluralize(label: string, count: number) {
  return count === 1 ? label : `${label}s`;
}

function remainingLabel(target: number, actual: number, unit: string) {
  const remaining = Math.max(0, target - actual);
  return `${remaining} ${pluralize(unit, remaining)} left`;
}

function goalStatus(
  actual: number,
  target: number,
): Pick<WeeklyGoalCard, "hasTarget" | "statusLabel" | "statusTone" | "progressPercent"> {
  if (target <= 0) {
    return {
      hasTarget: false,
      statusLabel: "No target",
      statusTone: "info",
      progressPercent: 0,
    };
  }

  if (actual >= target) {
    return { hasTarget: true, statusLabel: "Target met", statusTone: "positive", progressPercent: 100 };
  }

  if (actual > 0) {
    return {
      hasTarget: true,
      statusLabel: "In progress",
      statusTone: "info",
      progressPercent: Math.max(8, Math.min(99, Math.round((actual / target) * 100))),
    };
  }

  return { hasTarget: true, statusLabel: "Not started", statusTone: "attention", progressPercent: 0 };
}

function runningGoalStatus(
  actualSessions: number,
  targetSessions: number,
  actualKm: number,
  targetKm: number,
): Pick<WeeklyGoalCard, "hasTarget" | "statusLabel" | "statusTone" | "progressPercent"> {
  const activeProgress = [
    ...(targetSessions > 0 ? [actualSessions / targetSessions] : []),
    ...(targetKm > 0 ? [actualKm / targetKm] : []),
  ];

  if (activeProgress.length === 0) {
    return {
      hasTarget: false,
      statusLabel: "No target",
      statusTone: "info",
      progressPercent: 0,
    };
  }

  const progress = Math.min(...activeProgress);
  if (activeProgress.every((value) => value >= 1)) {
    return { hasTarget: true, statusLabel: "Target met", statusTone: "positive", progressPercent: 100 };
  }
  if (activeProgress.some((value) => value > 0)) {
    return {
      hasTarget: true,
      statusLabel: "In progress",
      statusTone: "info",
      progressPercent: Math.max(0, Math.min(99, Math.round(progress * 100))),
    };
  }
  return { hasTarget: true, statusLabel: "Not started", statusTone: "attention", progressPercent: 0 };
}

function runningGoalDetails(
  actualSessions: number,
  targetSessions: number,
  actualKm: number,
  targetKm: number,
): string[] {
  const hasSessionTarget = targetSessions > 0;
  const hasDistanceTarget = targetKm > 0;

  if (!hasSessionTarget && !hasDistanceTarget) {
    return ["No weekly running target set."];
  }

  const sessionComplete = !hasSessionTarget || actualSessions >= targetSessions;
  const distanceComplete = !hasDistanceTarget || actualKm >= targetKm;
  if (sessionComplete && distanceComplete) {
    return ["Weekly running target complete."];
  }

  const details: string[] = [];
  if (hasSessionTarget && !sessionComplete) {
    details.push(remainingLabel(targetSessions, actualSessions, "run"));
  }
  if (hasDistanceTarget && !distanceComplete) {
    details.push(`${formatNumber(Math.max(0, targetKm - actualKm), 1)} km left to distance target.`);
  }
  return details;
}

function uniqueItems<T extends { id: string }>(items: T[], limit: number): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
    if (output.length >= limit) break;
  }

  return output;
}

function buildSnapshot(input: WeeklyReviewInput): WeeklyReviewSnapshot {
  const runSessions = safeNumber(input.runningAnalytics?.current_week.week_run_count);
  const runDistanceKm = safeNumber(input.runningAnalytics?.current_week.week_distance_km);
  const gymSessions = safeNumber(input.gymAnalytics?.summary.sessions_this_week);
  const gymSets = safeNumber(input.gymAnalytics?.summary.sets_this_week);
  const climbSessions = safeNumber(input.climbingAnalytics?.summary.sessions_this_week);
  const climbTries = safeNumber(input.climbingAnalytics?.summary.attempts_this_week);
  const activeProjectCount =
    input.climbingAnalytics === null
      ? input.climbingProjects.filter((project) => project.status === "active").length
      : safeNumber(input.climbingAnalytics.summary.active_project_count);

  return {
    totalTrainingSessions: runSessions + gymSessions + climbSessions,
    runSessions,
    runDistanceKm,
    gymSessions,
    gymSets,
    climbSessions,
    climbTries,
    activeProjectCount,
    activeWorkoutName: input.activeWorkout?.template_summary?.name ?? null,
  };
}

function buildGoalCards(input: WeeklyReviewInput, snapshot: WeeklyReviewSnapshot): WeeklyGoalCard[] {
  const runTarget = safeNumber(input.trainingPreferences.running_sessions_per_week);
  const runDistanceTarget = safeNumber(input.trainingPreferences.running_weekly_distance_target_km);
  const runStatus = runningGoalStatus(snapshot.runSessions, runTarget, snapshot.runDistanceKm, runDistanceTarget);
  const hasRunSessionTarget = runTarget > 0;
  const hasRunDistanceTarget = runDistanceTarget > 0;

  const gymTarget = safeNumber(input.trainingPreferences.gym_sessions_per_week);
  const gymStatus = goalStatus(snapshot.gymSessions, gymTarget);

  const climbTarget = safeNumber(input.trainingPreferences.climbing_sessions_per_week);
  const climbStatus = goalStatus(snapshot.climbSessions, climbTarget);

  return [
    {
      id: "run",
      title: "Running",
      accent: "green",
      primaryLabel: hasRunSessionTarget ? "Runs" : hasRunDistanceTarget ? "Distance" : "Runs this week",
      primaryValue: hasRunSessionTarget
        ? `${snapshot.runSessions} / ${runTarget}`
        : hasRunDistanceTarget
          ? `${formatNumber(snapshot.runDistanceKm, 1)} / ${formatNumber(runDistanceTarget, 1)} km`
          : String(snapshot.runSessions),
      secondaryValue:
        hasRunSessionTarget && hasRunDistanceTarget
          ? `${formatNumber(snapshot.runDistanceKm, 1)} / ${formatNumber(runDistanceTarget, 1)} km`
          : hasRunDistanceTarget
            ? `${snapshot.runSessions} ${pluralize("run", snapshot.runSessions)} this week`
            : `${formatNumber(snapshot.runDistanceKm, 1)} km this week`,
      ...runStatus,
      details: runningGoalDetails(snapshot.runSessions, runTarget, snapshot.runDistanceKm, runDistanceTarget),
    },
    {
      id: "gym",
      title: "Gym",
      accent: "amber",
      primaryLabel: "Sessions",
      primaryValue: gymTarget > 0 ? `${snapshot.gymSessions} / ${gymTarget}` : String(snapshot.gymSessions),
      secondaryValue: `${snapshot.gymSets} sets this week`,
      ...gymStatus,
      details: [
        gymTarget > 0 && snapshot.gymSessions < gymTarget
          ? remainingLabel(gymTarget, snapshot.gymSessions, "session")
          : gymTarget > 0
            ? "Weekly gym target complete."
            : "No weekly gym target set.",
        snapshot.gymSets > 0 ? `${snapshot.gymSets} strength sets logged.` : "No strength sets logged yet.",
      ],
    },
    {
      id: "climb",
      title: "Climbing",
      accent: "indigo",
      primaryLabel: "Sessions",
      primaryValue: climbTarget > 0 ? `${snapshot.climbSessions} / ${climbTarget}` : String(snapshot.climbSessions),
      secondaryValue: `${snapshot.climbTries} tries this week`,
      ...climbStatus,
      details: [
        climbTarget > 0 && snapshot.climbSessions < climbTarget
          ? remainingLabel(climbTarget, snapshot.climbSessions, "session")
          : climbTarget > 0
            ? "Weekly climbing target complete."
            : "No weekly climbing target set.",
        snapshot.activeProjectCount > 0
          ? `${snapshot.activeProjectCount} active ${pluralize("project", snapshot.activeProjectCount)}.`
          : "No active climbing projects.",
      ],
    },
  ];
}

function getStaleProject(projects: ClimbingProject[]) {
  return projects
    .filter((project) => project.status === "active")
    .map((project) => ({
      ...project,
      staleDays: project.days_since_last_attempt ?? project.days_active ?? 0,
    }))
    .filter((project) => project.staleDays >= 14)
    .sort((a, b) => b.staleDays - a.staleDays)[0] ?? null;
}

function buildHighlights(input: WeeklyReviewInput, snapshot: WeeklyReviewSnapshot, goals: WeeklyGoalCard[]): WeeklyReviewItem[] {
  const items: WeeklyReviewItem[] = [];

  for (const goal of goals) {
    if (goal.hasTarget && goal.statusLabel === "Target met") {
      items.push({
        id: `${goal.id}-target-met`,
        tone: "positive",
        pillar: goal.id,
        title: `${goal.title} target met`,
        message: `${goal.primaryValue} ${goal.primaryLabel.toLowerCase()} complete for the week.`,
      });
    }
  }

  if (snapshot.runSessions > 0 && snapshot.gymSessions > 0 && snapshot.climbSessions > 0) {
    items.push({
      id: "balanced-week",
      tone: "positive",
      pillar: "balance",
      title: "All three pillars logged",
      message: "Run, Gym, and Climb all have activity this week.",
    });
  }

  if (snapshot.runSessions >= 3) {
    items.push({
      id: "run-consistency",
      tone: "positive",
      pillar: "run",
      title: "Running consistency is building",
      message: `You logged ${snapshot.runSessions} runs this week.`,
    });
  }

  if (snapshot.gymSets > 0) {
    items.push({
      id: "gym-sets",
      tone: "info",
      pillar: "gym",
      title: "Strength work logged",
      message: `You logged ${snapshot.gymSets} sets this week.`,
    });
  }

  if (snapshot.climbTries > 0) {
    items.push({
      id: "climb-tries",
      tone: "info",
      pillar: "climb",
      title: "Climbing volume logged",
      message: `You logged ${snapshot.climbTries} tries this week.`,
    });
  }

  if (input.climbingAnalytics?.bouldering_progression.highest_sent_grade) {
    items.push({
      id: "boulder-highest",
      tone: "info",
      pillar: "climb",
      title: "Bouldering baseline",
      message: `Highest sent grade: ${input.climbingAnalytics.bouldering_progression.highest_sent_grade}.`,
    });
  }

  return uniqueItems(items, 5);
}

function buildAttention(input: WeeklyReviewInput, snapshot: WeeklyReviewSnapshot, goals: WeeklyGoalCard[]): WeeklyReviewItem[] {
  const items: WeeklyReviewItem[] = [];
  const staleProject = getStaleProject(input.climbingProjects);

  if (!input.checkIn) {
    items.push({
      id: "no-check-in",
      tone: "attention",
      pillar: "readiness",
      title: "No check-in logged today",
      message: "Log readiness to anchor weekly review context.",
    });
  }

  if (input.activeWorkout) {
    items.push({
      id: "active-workout",
      tone: "attention",
      pillar: "gym",
      title: "Workout still in progress",
      message: "Resume or cancel the active gym workout before starting another routine.",
    });
  }

  const runGoal = goals.find((goal) => goal.id === "run");
  if (runGoal?.hasTarget && runGoal.statusLabel !== "Target met") {
    if (snapshot.runSessions === 0) {
      items.push({
        id: "no-run",
        tone: "attention",
        pillar: "run",
        title: "No runs this week",
        message: "Log a run to start the active weekly running target.",
      });
    } else {
      items.push({
        id: "run-target-open",
        tone: "attention",
        pillar: "run",
        title: "Running target open",
        message: runGoal.details[0] ?? "Running target still needs work this week.",
      });
    }
  }

  const gymGoal = goals.find((goal) => goal.id === "gym");
  if (gymGoal?.hasTarget && gymGoal.statusLabel !== "Target met") {
    if (snapshot.gymSessions === 0) {
      items.push({
        id: "no-gym",
        tone: "attention",
        pillar: "gym",
        title: "No gym sessions this week",
        message: "Quick log a session or start a routine when strength work is next.",
      });
    } else {
      items.push({
        id: "gym-target-open",
        tone: "attention",
        pillar: "gym",
        title: "Gym target open",
        message: gymGoal.details[0] ?? "Gym target still needs work this week.",
      });
    }
  }

  const climbGoal = goals.find((goal) => goal.id === "climb");
  if (climbGoal?.hasTarget && climbGoal.statusLabel !== "Target met") {
    if (snapshot.climbSessions === 0) {
      items.push({
        id: "no-climb",
        tone: "attention",
        pillar: "climb",
        title: "No climbing sessions this week",
        message: "Log bouldering or top rope to keep the climbing baseline current.",
      });
    } else {
      items.push({
        id: "climb-target-open",
        tone: "attention",
        pillar: "climb",
        title: "Climbing target open",
        message: climbGoal.details[0] ?? "Climbing target still needs work this week.",
      });
    }
  }

  if (staleProject) {
    items.push({
      id: "stale-project",
      tone: "attention",
      pillar: "climb",
      title: "Project needs attention",
      message: `${staleProject.name} has not been touched in ${staleProject.staleDays} days.`,
    });
  }

  return uniqueItems(items, 6);
}

function buildNextActions(input: WeeklyReviewInput, snapshot: WeeklyReviewSnapshot, goals: WeeklyGoalCard[]): WeeklyReviewAction[] {
  const actions: WeeklyReviewAction[] = [];
  const staleProject = getStaleProject(input.climbingProjects);

  if (input.activeWorkout) {
    actions.push({
      id: "resume-workout",
      accent: "amber",
      title: "Resume active workout",
      message: input.activeWorkout.template_summary?.name ?? "Active gym workout is still open.",
      actionLabel: "Resume workout",
      actionTarget: "gym",
      actionKind: "navigate",
    });
  }

  if (!input.checkIn) {
    actions.push({
      id: "log-check-in",
      accent: "green",
      title: "Log check-in",
      message: "Add today's readiness so the weekly review has context.",
      actionLabel: "Log check-in",
      actionTarget: "check-in",
      actionKind: "quick-log",
    });
  }

  const runGoal = goals.find((goal) => goal.id === "run");
  if (runGoal?.hasTarget && runGoal.statusLabel !== "Target met") {
    actions.push({
      id: "log-run",
      accent: "green",
      title: "Move running target forward",
      message: runGoal.details[0] ?? "Running target still needs work.",
      actionLabel: "Log run",
      actionTarget: "run",
      actionKind: "quick-log",
    });
  }

  const gymGoal = goals.find((goal) => goal.id === "gym");
  if (gymGoal?.hasTarget && gymGoal.statusLabel !== "Target met" && !input.activeWorkout) {
    actions.push({
      id: "start-gym",
      accent: "amber",
      title: "Move gym target forward",
      message: snapshot.gymSessions > 0 ? "Start another routine or quick log strength work." : "Quick log a session or start a routine.",
      actionLabel: "Open gym",
      actionTarget: "gym",
      actionKind: "navigate",
    });
  }

  const climbGoal = goals.find((goal) => goal.id === "climb");
  if (climbGoal?.hasTarget && climbGoal.statusLabel !== "Target met") {
    actions.push({
      id: "log-climb",
      accent: "indigo",
      title: "Move climbing target forward",
      message: climbGoal.details[0] ?? "Climbing target still needs work.",
      actionLabel: "Log climb",
      actionTarget: "climb",
      actionKind: "quick-log",
    });
  }

  if (staleProject) {
    actions.push({
      id: "view-stale-project",
      accent: "indigo",
      title: "Review stale project",
      message: `${staleProject.name} has been idle for ${staleProject.staleDays} days.`,
      actionLabel: "View projects",
      actionTarget: "climb",
      actionKind: "navigate",
    });
  }

  if (snapshot.activeProjectCount === 0 && snapshot.climbSessions > 0) {
    actions.push({
      id: "create-project",
      accent: "indigo",
      title: "Create a climbing project",
      message: "Turn a climb you are working into a tracked project.",
      actionLabel: "Create project",
      actionTarget: "project",
      actionKind: "quick-log",
    });
  }

  return uniqueItems(actions, 5);
}

export function buildWeeklyReview(input: WeeklyReviewInput): WeeklyReviewOutput {
  const snapshot = buildSnapshot(input);
  const goals = buildGoalCards(input, snapshot);
  const highlights = buildHighlights(input, snapshot, goals);
  const attention = buildAttention(input, snapshot, goals);
  const nextActions = buildNextActions(input, snapshot, goals);

  return {
    goals,
    highlights,
    attention,
    nextActions,
    snapshot,
  };
}
