import { describe, expect, it } from "vitest";

import {
  defaultTrainingPreferences,
  type ClimbingAnalytics,
  type GymAnalytics,
  type RunningAnalytics,
  type TrainingPreferences,
} from "@/lib/api";
import { buildWeeklyReview } from "@/lib/weeklyReview";

type WeeklyReviewInput = Parameters<typeof buildWeeklyReview>[0];

function preferences(overrides: Partial<TrainingPreferences> = {}): TrainingPreferences {
  return {
    ...defaultTrainingPreferences,
    running_sessions_per_week: 0,
    running_weekly_distance_target_km: null,
    gym_sessions_per_week: 0,
    climbing_sessions_per_week: 0,
    ...overrides,
  };
}

function runningAnalytics(weekRuns: number, weekDistanceKm: number): RunningAnalytics {
  const analytics: Pick<RunningAnalytics, "current_week"> = {
    current_week: {
      week_start: "2026-07-27",
      week_distance_km: weekDistanceKm,
      week_run_count: weekRuns,
      week_duration_seconds: 0,
      week_avg_pace_seconds_per_km: null,
    },
  };
  return analytics as RunningAnalytics;
}

function gymAnalytics(sessions: number, sets = 0): GymAnalytics {
  const analytics: Pick<GymAnalytics, "summary"> = {
    summary: {
      total_sessions: sessions,
      total_sets: sets,
      total_exercises_used: 0,
      sessions_this_week: sessions,
      sessions_this_month: sessions,
      sets_this_week: sets,
      sets_this_month: sets,
    },
  };
  return analytics as GymAnalytics;
}

function climbingAnalytics(sessions: number, tries = 0): ClimbingAnalytics {
  const analytics: Pick<ClimbingAnalytics, "summary" | "bouldering_progression"> = {
    summary: {
      total_sessions: sessions,
      total_attempts: tries,
      sessions_this_week: sessions,
      sessions_this_month: sessions,
      attempts_this_week: tries,
      attempts_this_month: tries,
      active_project_count: 0,
      sent_project_count: 0,
    },
    bouldering_progression: {
      highest_sent_grade: null,
      highest_attempted_grade: null,
      recent_highest_sent_grade: null,
      recent_highest_attempted_grade: null,
      v4_gap_label: "",
      grade_distribution: [],
      send_rate_by_grade: [],
    },
  };
  return analytics as ClimbingAnalytics;
}

function reviewInput(overrides: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    checkIn: null,
    trainingPreferences: preferences(),
    runningAnalytics: null,
    gymAnalytics: null,
    climbingAnalytics: null,
    activeWorkout: null,
    climbingProjects: [],
    ...overrides,
  };
}

function goal(review: ReturnType<typeof buildWeeklyReview>, id: "run" | "gym" | "climb") {
  const result = review.goals.find((item) => item.id === id);
  if (!result) throw new Error(`Missing ${id} goal card`);
  return result;
}

describe("buildWeeklyReview target semantics", () => {
  it("treats all zero targets as disabled", () => {
    const review = buildWeeklyReview(reviewInput());

    expect(review.goals).toHaveLength(3);
    for (const item of review.goals) {
      expect(item.hasTarget).toBe(false);
      expect(item.statusLabel).toBe("No target");
      expect(item.statusTone).toBe("info");
      expect(item.progressPercent).toBe(0);
    }
    expect(review.highlights.some((item) => item.id.endsWith("-target-met"))).toBe(false);
    expect(review.attention.some((item) => item.id.endsWith("-target-open"))).toBe(false);
    expect(review.nextActions.map((item) => item.id)).not.toEqual(
      expect.arrayContaining(["log-run", "start-gym", "log-climb"]),
    );
  });

  it("supports a distance-only running target", () => {
    const review = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({
          running_sessions_per_week: 0,
          running_weekly_distance_target_km: 10,
        }),
        runningAnalytics: runningAnalytics(1, 5),
      }),
    );
    const runGoal = goal(review, "run");

    expect(runGoal.hasTarget).toBe(true);
    expect(runGoal.primaryLabel).toBe("Distance");
    expect(runGoal.statusLabel).toBe("In progress");
    expect(runGoal.progressPercent).toBe(50);
    expect(runGoal.details).toEqual(["5.0 km left to distance target."]);
  });

  it("supports a session-only running target", () => {
    const review = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({
          running_sessions_per_week: 2,
          running_weekly_distance_target_km: null,
        }),
        runningAnalytics: runningAnalytics(1, 5),
      }),
    );
    const runGoal = goal(review, "run");

    expect(runGoal.statusLabel).toBe("In progress");
    expect(runGoal.progressPercent).toBe(50);
    expect(runGoal.details).toEqual(["1 run left"]);
  });

  it("requires both active running targets to be met", () => {
    const distanceOpen = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({
          running_sessions_per_week: 2,
          running_weekly_distance_target_km: 10,
        }),
        runningAnalytics: runningAnalytics(2, 5),
      }),
    );
    const bothComplete = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({
          running_sessions_per_week: 2,
          running_weekly_distance_target_km: 10,
        }),
        runningAnalytics: runningAnalytics(2, 10),
      }),
    );

    expect(goal(distanceOpen, "run").statusLabel).toBe("In progress");
    expect(goal(distanceOpen, "run").progressPercent).toBe(50);
    expect(goal(bothComplete, "run").statusLabel).toBe("Target met");
  });

  it("shows only the specific zero-gym attention item", () => {
    const review = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({ gym_sessions_per_week: 2 }),
        gymAnalytics: gymAnalytics(0),
      }),
    );
    const gymItems = review.attention.filter((item) => item.pillar === "gym");

    expect(gymItems.map((item) => item.id)).toEqual(["no-gym"]);
    expect(gymItems.map((item) => item.id)).not.toContain("gym-target-open");
  });

  it("shows only the specific zero-running attention item", () => {
    const review = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({ running_sessions_per_week: 2 }),
        runningAnalytics: runningAnalytics(0, 0),
      }),
    );
    const runItems = review.attention.filter((item) => item.pillar === "run");

    expect(runItems.map((item) => item.id)).toEqual(["no-run"]);
    expect(runItems.map((item) => item.id)).not.toContain("run-target-open");
  });

  it("shows only the specific zero-climb attention item", () => {
    const review = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({ climbing_sessions_per_week: 2 }),
        climbingAnalytics: climbingAnalytics(0),
      }),
    );
    const climbItems = review.attention.filter((item) => item.pillar === "climb");

    expect(climbItems.map((item) => item.id)).toEqual(["no-climb"]);
    expect(climbItems.map((item) => item.id)).not.toContain("climb-target-open");
  });

  it("uses the generic target-open item for partial progress", () => {
    const review = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({ gym_sessions_per_week: 2 }),
        gymAnalytics: gymAnalytics(1, 4),
      }),
    );
    const gymIds = review.attention.filter((item) => item.pillar === "gym").map((item) => item.id);

    expect(gymIds).toContain("gym-target-open");
    expect(gymIds).not.toContain("no-gym");
  });

  it("builds unique running details conditionally", () => {
    const bothOpen = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({
          running_sessions_per_week: 2,
          running_weekly_distance_target_km: 10,
        }),
        runningAnalytics: runningAnalytics(1, 5),
      }),
    );
    const distanceOpen = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({
          running_sessions_per_week: 2,
          running_weekly_distance_target_km: 10,
        }),
        runningAnalytics: runningAnalytics(2, 5),
      }),
    );
    const complete = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({
          running_sessions_per_week: 2,
          running_weekly_distance_target_km: 10,
        }),
        runningAnalytics: runningAnalytics(2, 10),
      }),
    );
    const noTarget = buildWeeklyReview(reviewInput());
    const details = goal(bothOpen, "run").details;

    expect(details).toEqual(["1 run left", "5.0 km left to distance target."]);
    expect(new Set(details).size).toBe(details.length);
    expect(goal(distanceOpen, "run").details).toEqual(["5.0 km left to distance target."]);
    expect(goal(complete, "run").details).toEqual(["Weekly running target complete."]);
    expect(goal(noTarget, "run").details).toEqual(["No weekly running target set."]);
  });

  it("uses safe finite zero values when analytics are missing", () => {
    const review = buildWeeklyReview(
      reviewInput({
        trainingPreferences: preferences({
          running_sessions_per_week: 2,
          gym_sessions_per_week: 2,
          climbing_sessions_per_week: 2,
        }),
      }),
    );

    expect(review.snapshot).toMatchObject({
      totalTrainingSessions: 0,
      runSessions: 0,
      runDistanceKm: 0,
      gymSessions: 0,
      gymSets: 0,
      climbSessions: 0,
      climbTries: 0,
      activeProjectCount: 0,
    });
    expect(review.goals.every((item) => Number.isFinite(item.progressPercent))).toBe(true);
    const displayText = review.goals
      .flatMap((item) => [
        item.primaryLabel,
        item.primaryValue,
        item.secondaryValue,
        item.statusLabel,
        ...item.details,
      ])
      .join(" ");
    expect(displayText).not.toMatch(/\b(?:undefined|null|NaN|Infinity)\b/);
  });
});
