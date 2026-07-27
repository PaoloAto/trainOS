import { describe, expect, it } from "vitest";

import {
  defaultTrainingPreferences,
  type RunActivity,
  type RunningAnalytics,
  type TrainingPreferences,
} from "@/lib/api";
import { buildTrainingBrief } from "@/lib/trainingBrief";

type TrainingBriefInput = Parameters<typeof buildTrainingBrief>[0];

function preferences(overrides: Partial<TrainingPreferences> = {}): TrainingPreferences {
  return {
    ...defaultTrainingPreferences,
    ...overrides,
  };
}

function runningAnalytics({
  totalRuns = 4,
  weekRuns = 0,
  weekDistanceKm = 0,
}: {
  totalRuns?: number;
  weekRuns?: number;
  weekDistanceKm?: number;
} = {}): RunningAnalytics {
  return {
    summary: {
      total_runs: totalRuns,
      total_distance_km: 20,
      total_duration_seconds: 7_200,
      avg_pace_seconds_per_km: 360,
      imported_run_count: 0,
      manual_run_count: totalRuns,
      average_distance_km: totalRuns > 0 ? 5 : 0,
      longest_run_distance_km: totalRuns > 0 ? 8 : 0,
      latest_run_date: totalRuns > 0 ? "2026-07-20" : null,
    },
    current_week: {
      week_start: "2026-07-27",
      week_distance_km: weekDistanceKm,
      week_run_count: weekRuns,
      week_duration_seconds: 0,
      week_avg_pace_seconds_per_km: null,
    },
    current_month: {
      month_distance_km: 20,
      month_run_count: totalRuns,
      month_duration_seconds: 7_200,
      month_avg_pace_seconds_per_km: 360,
    },
    longest_run: null,
    recent_long_runs: [],
    weekly_distance_trend: [],
    monthly_distance_trend: [],
    recent_pace_trend: [],
    long_run_progression: [],
    marathon_baseline: {
      longest_distance_km: 8,
      distance_gap_to_marathon_km: 34.2,
      marathon_time_at_longest_run_pace_seconds: null,
      half_marathon_benchmark: false,
      baseline_label: "Starting baseline",
      baseline_note: "Keep building.",
    },
    consistency: {
      runs_last_7_days: weekRuns,
      runs_last_30_days: totalRuns,
      active_weeks_last_8: totalRuns > 0 ? 2 : 0,
      consistency_label: totalRuns > 0 ? "Starting baseline" : "No data",
      consistency_note: "Keep logging.",
    },
    data_quality: {
      confidence: totalRuns > 0 ? "medium" : "low",
      reason: "Fixture data.",
      suggested_next_action: "Log another run.",
    },
    insights: [],
  };
}

function latestRun(): RunActivity {
  return {
    id: 1,
    title: "Easy run",
    started_at: "2026-07-20T07:00:00+08:00",
    distance_km: 5,
    duration_seconds: 1_800,
    avg_pace_seconds_per_km: 360,
    avg_hr: null,
    max_hr: null,
    elevation_gain_m: null,
    run_type: "easy",
    perceived_effort: null,
    notes: "",
    source: "manual",
    import_batch: null,
    source_activity_id: "",
    raw_metadata: {},
    created_at: "2026-07-20T07:30:00+08:00",
    updated_at: "2026-07-20T07:30:00+08:00",
  };
}

function briefInput(overrides: Partial<TrainingBriefInput> = {}): TrainingBriefInput {
  return {
    checkIn: null,
    runningAnalytics: runningAnalytics(),
    gymAnalytics: null,
    climbingAnalytics: null,
    activeWorkout: null,
    climbingProjects: [],
    latestRun: latestRun(),
    latestGymSession: null,
    latestClimbingSession: null,
    trainingPreferences: preferences({ running_sessions_per_week: 2 }),
    ...overrides,
  };
}

describe("buildTrainingBrief running target audit rules", () => {
  it("shows target-not-started when historical runs exist but this week has zero runs", () => {
    const insights = buildTrainingBrief(briefInput());
    const ids = insights.map((insight) => insight.id);

    expect(ids).toContain("run:target-not-started");
    expect(ids).not.toContain("run:target-pending");
  });

  it("uses the focused zero-week insight when running is the primary focus", () => {
    const insights = buildTrainingBrief(
      briefInput({
        trainingPreferences: preferences({
          primary_focus: "running",
          running_sessions_per_week: 2,
        }),
      }),
    );

    expect(insights).toContainEqual(
      expect.objectContaining({
        id: "run:focus-no-week",
        title: "Running focus needs a run",
        message: "Running is your focus, but no run is logged this week.",
        tone: "attention",
        actionLabel: "Open Run",
        actionTarget: "run",
      }),
    );
  });

  it("does not warn about a disabled running session target", () => {
    const insights = buildTrainingBrief(
      briefInput({
        trainingPreferences: preferences({ running_sessions_per_week: 0 }),
      }),
    );

    expect(insights.map((insight) => insight.id)).not.toEqual(
      expect.arrayContaining(["run:target-not-started", "run:target-pending"]),
    );
  });

  it("preserves the existing no-runs-ever insight", () => {
    const insights = buildTrainingBrief(
      briefInput({
        runningAnalytics: runningAnalytics({ totalRuns: 0 }),
        latestRun: null,
      }),
    );
    const ids = insights.map((insight) => insight.id);

    expect(ids).toContain("run:no-runs");
    expect(ids).not.toContain("run:target-not-started");
  });

  it("keeps display text valid when analytics are missing", () => {
    const insights = buildTrainingBrief(
      briefInput({
        runningAnalytics: null,
        latestRun: latestRun(),
      }),
    );
    const displayText = insights
      .flatMap((insight) => [insight.title, insight.message, insight.actionLabel ?? ""])
      .join(" ");

    expect(displayText).not.toMatch(/\b(?:undefined|null|NaN|Infinity)\b/);
  });
});
