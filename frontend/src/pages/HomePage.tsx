import { ArrowRight, ClipboardCheck, Dumbbell, FileUp, Mountain, Plus, Target, Timer } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { QuickLogSheet, type QuickLogMode } from "@/components/app/QuickLogSheet";
import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { QuickActionButton } from "@/components/common/QuickActionButton";
import { EmptyActionCard, ErrorStateCard, LoadingStateCard, LowDataCard } from "@/components/common/StateCards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClassName } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type {
  ActiveWorkout,
  ClimbingAnalytics,
  ClimbingProject,
  ClimbingSession,
  DailyCheckIn,
  GymAnalytics,
  GymSession,
  RunActivity,
  RunningAnalytics,
  TrainingPreferences,
  TrainingPreferencesInput,
  User,
  WorkoutTemplate,
} from "@/lib/api";
import { api, defaultTrainingPreferences } from "@/lib/api";
import { formatDuration, formatPace, formatShortDate } from "@/lib/format";
import { buildTrainingBrief, type TrainingBriefActionTarget, type TrainingBriefInsight } from "@/lib/trainingBrief";
import { cn } from "@/lib/utils";

type HomePageProps = {
  user: User | null;
};

type HomeData = {
  checkIn: DailyCheckIn | null;
  runs: RunActivity[];
  runningAnalytics: RunningAnalytics | null;
  gymSessions: GymSession[];
  gymAnalytics: GymAnalytics | null;
  activeWorkout: ActiveWorkout | null;
  routines: WorkoutTemplate[];
  climbingSessions: ClimbingSession[];
  climbingAnalytics: ClimbingAnalytics | null;
  climbingProjects: ClimbingProject[];
  trainingPreferences: TrainingPreferences;
};

type HomeErrors = Partial<Record<"running" | "gym" | "climbing" | "preferences", string>>;

type Accent = "green" | "amber" | "indigo";
type BriefTone = "positive" | "attention" | "info";

const emptyHomeData: HomeData = {
  checkIn: null,
  runs: [],
  runningAnalytics: null,
  gymSessions: [],
  gymAnalytics: null,
  activeWorkout: null,
  routines: [],
  climbingSessions: [],
  climbingAnalytics: null,
  climbingProjects: [],
  trainingPreferences: defaultTrainingPreferences,
};

const accentStyles: Record<
  Accent,
  {
    border: string;
    bg: string;
    text: string;
    badge: string;
    icon: string;
    button: string;
  }
> = {
  green: {
    border: "border-green/50",
    bg: "bg-green-muted",
    text: "text-green",
    badge: "border-green bg-green-muted text-green",
    icon: "border-green bg-green-muted text-green shadow-glow",
    button: "border-green bg-green-muted text-green hover:bg-green/20",
  },
  amber: {
    border: "border-amber/50",
    bg: "bg-amber-muted",
    text: "text-amber",
    badge: "border-amber bg-amber-muted text-amber",
    icon: "border-amber bg-amber-muted text-amber shadow-amber",
    button: "border-amber bg-amber-muted text-amber hover:bg-amber/20",
  },
  indigo: {
    border: "border-indigo/50",
    bg: "bg-indigo-muted",
    text: "text-indigo",
    badge: "border-indigo bg-indigo-muted text-indigo",
    icon: "border-indigo bg-indigo-muted text-indigo shadow-indigo",
    button: "border-indigo bg-indigo-muted text-indigo hover:bg-indigo/20",
  },
};

const briefToneStyles: Record<BriefTone, { border: string; badge: string; text: string; button: string }> = {
  positive: {
    border: "border-green/50",
    badge: "border-green bg-green-muted text-green",
    text: "text-green",
    button: "border-green bg-green-muted text-green hover:bg-green/20",
  },
  attention: {
    border: "border-amber/50",
    badge: "border-amber bg-amber-muted text-amber",
    text: "text-amber",
    button: "border-amber bg-amber-muted text-amber hover:bg-amber/20",
  },
  info: {
    border: "border-indigo/50",
    badge: "border-indigo bg-indigo-muted text-indigo",
    text: "text-indigo",
    button: "border-indigo bg-indigo-muted text-indigo hover:bg-indigo/20",
  },
};

const briefPillarLabels: Record<TrainingBriefInsight["pillar"], string> = {
  readiness: "Readiness",
  run: "Run",
  gym: "Gym",
  climb: "Climb",
  balance: "Balance",
};

const primaryFocusLabels: Record<TrainingPreferences["primary_focus"], string> = {
  balanced: "Balanced",
  running: "Running",
  gym: "Gym",
  climbing: "Climbing",
};

const runningGoalLabels: Record<TrainingPreferences["running_goal"], string> = {
  general_fitness: "General fitness",
  "5k": "5K",
  "10k": "10K",
  half_marathon: "Half marathon",
  marathon: "Marathon",
};

const gymGoalLabels: Record<TrainingPreferences["gym_goal"], string> = {
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  general_fitness: "General fitness",
  climbing_support: "Climbing support",
};

const climbingGoalLabels: Record<TrainingPreferences["climbing_goal"], string> = {
  bouldering: "Bouldering",
  top_rope: "Top rope",
  mixed: "Mixed",
  general_progression: "General progression",
};

function sortedByDateDesc<T>(items: T[], getDate: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => {
    const dateA = getDate(a);
    const dateB = getDate(b);
    return new Date(dateB ?? 0).getTime() - new Date(dateA ?? 0).getTime();
  });
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return value.toFixed(digits);
}

function labelize(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function pluralize(label: string, count: number) {
  return count === 1 ? label : `${label}s`;
}

function targetProgressLabel(current: number, target: number, label: string) {
  return target > 0
    ? `${current} / ${target} ${pluralize(label, target)}`
    : `${current} ${pluralize(label, current)} this week`;
}

function formatOptionalNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return value.toFixed(digits);
}

function getReadiness(checkIn: DailyCheckIn | null) {
  if (!checkIn) {
    return {
      label: "Check-in pending",
      detail: "No readiness baseline yet.",
      score: null as number | null,
    };
  }

  const positiveScores = [
    checkIn.mood,
    checkIn.energy,
    checkIn.sleep_quality,
    checkIn.sleep_hours ? Math.min(10, (checkIn.sleep_hours / 8) * 10) : null,
  ].filter((value): value is number => value !== null && value !== undefined);
  const strainScores = [checkIn.soreness, checkIn.stress].filter(
    (value): value is number => value !== null && value !== undefined,
  );

  if (positiveScores.length < 2) {
    return {
      label: "Baseline needed",
      detail: "Add mood, energy, sleep, soreness, and stress for a clearer read.",
      score: null,
    };
  }

  const positiveAverage = positiveScores.reduce((total, value) => total + value, 0) / positiveScores.length;
  const strainAverage = strainScores.length
    ? strainScores.reduce((total, value) => total + value, 0) / strainScores.length
    : 5;
  const score = Math.max(0, Math.min(100, Math.round(positiveAverage * 10 - Math.max(0, strainAverage - 5) * 4)));

  if (score >= 75) {
    return { label: "Ready", detail: "Energy and recovery look supportive today.", score };
  }
  if (score >= 55) {
    return { label: "Steady", detail: "A normal training day. Keep the plan flexible.", score };
  }
  return { label: "Caution", detail: "Recovery signals are lower. Keep intensity honest.", score };
}

function getActiveWorkoutProgress(activeWorkout: ActiveWorkout | null) {
  if (!activeWorkout) return null;

  const exerciseCount = activeWorkout.template_items.length;
  const currentExercise = exerciseCount
    ? Math.min(activeWorkout.current_exercise_index + 1, exerciseCount)
    : activeWorkout.current_exercise_index + 1;
  const currentSet = activeWorkout.current_set_index + 1;

  return {
    exerciseLabel: exerciseCount ? `Exercise ${currentExercise} of ${exerciseCount}` : "Open workout",
    setLabel: `Set ${currentSet}`,
    loggedSetCount: activeWorkout.logged_sets.length,
    percent: exerciseCount ? Math.min(100, Math.round((currentExercise / exerciseCount) * 100)) : 0,
  };
}

async function fetchHomeData(): Promise<{ data: HomeData; errors: HomeErrors }> {
  const [
    checkInResult,
    runsResult,
    runningAnalyticsResult,
    gymSessionsResult,
    gymAnalyticsResult,
    activeWorkoutResult,
    routinesResult,
    climbingSessionsResult,
    climbingAnalyticsResult,
    climbingProjectsResult,
    trainingPreferencesResult,
  ] = await Promise.allSettled([
    api.checkIns.today(),
    api.runs.list(),
    api.runningAnalytics.get(),
    api.gymSessions.list(),
    api.gymAnalytics.get(),
    api.activeWorkout.get(),
    api.workoutTemplates.list(),
    api.climbingSessions.list(),
    api.climbingAnalytics.get(),
    api.climbingProjects.list(),
    api.trainingPreferences.get(),
  ] as const);

  const errors: HomeErrors = {};

  if (runsResult.status === "rejected" || runningAnalyticsResult.status === "rejected") {
    errors.running = "Running data is temporarily unavailable.";
  }
  if (
    gymSessionsResult.status === "rejected" ||
    gymAnalyticsResult.status === "rejected" ||
    activeWorkoutResult.status === "rejected" ||
    routinesResult.status === "rejected"
  ) {
    errors.gym = "Gym data is temporarily unavailable.";
  }
  if (
    climbingSessionsResult.status === "rejected" ||
    climbingAnalyticsResult.status === "rejected" ||
    climbingProjectsResult.status === "rejected"
  ) {
    errors.climbing = "Climbing data is temporarily unavailable.";
  }
  if (trainingPreferencesResult.status === "rejected") {
    errors.preferences = "Training goals are using safe defaults for now.";
  }

  return {
    data: {
      checkIn: checkInResult.status === "fulfilled" ? checkInResult.value : null,
      runs: runsResult.status === "fulfilled" ? runsResult.value : [],
      runningAnalytics: runningAnalyticsResult.status === "fulfilled" ? runningAnalyticsResult.value : null,
      gymSessions: gymSessionsResult.status === "fulfilled" ? gymSessionsResult.value : [],
      gymAnalytics: gymAnalyticsResult.status === "fulfilled" ? gymAnalyticsResult.value : null,
      activeWorkout: activeWorkoutResult.status === "fulfilled" ? activeWorkoutResult.value : null,
      routines: routinesResult.status === "fulfilled" ? routinesResult.value : [],
      climbingSessions: climbingSessionsResult.status === "fulfilled" ? climbingSessionsResult.value : [],
      climbingAnalytics: climbingAnalyticsResult.status === "fulfilled" ? climbingAnalyticsResult.value : null,
      climbingProjects: climbingProjectsResult.status === "fulfilled" ? climbingProjectsResult.value : [],
      trainingPreferences:
        trainingPreferencesResult.status === "fulfilled"
          ? trainingPreferencesResult.value
          : defaultTrainingPreferences,
    },
    errors,
  };
}

function MiniMetric({
  label,
  value,
  helper,
  accent = "green",
}: {
  label: string;
  value: string;
  helper?: string;
  accent?: Accent;
}) {
  return (
    <div className={cn("rounded-2xl border bg-bg-elevated p-4", accentStyles[accent].border)}>
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className={cn("mt-2 font-mono text-2xl font-semibold tracking-tight", accentStyles[accent].text)}>{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5 text-text-secondary">{helper}</p> : null}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div>
      <p className="text-[0.68rem] uppercase tracking-[0.22em] text-text-muted">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold text-text-primary">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p> : null}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  accent = "green",
  variant = "accent",
}: {
  label: string;
  onClick: () => void;
  accent?: Accent;
  variant?: "accent" | "ghost";
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className={cn("w-full rounded-2xl sm:w-auto", variant === "accent" ? accentStyles[accent].button : "")}
      onClick={onClick}
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}

export function HomePage({ user }: HomePageProps) {
  const navigate = useNavigate();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogMode, setQuickLogMode] = useState<QuickLogMode>("menu");
  const [data, setData] = useState<HomeData>(emptyHomeData);
  const [errors, setErrors] = useState<HomeErrors>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [goalsOpen, setGoalsOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      const result = await fetchHomeData();

      if (!active) return;
      setData(result.data);
      setErrors(result.errors);
      setLoading(false);
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  function openQuickLog(mode: QuickLogMode) {
    setQuickLogMode(mode);
    setQuickLogOpen(true);
  }

  const readiness = useMemo(() => getReadiness(data.checkIn), [data.checkIn]);
  const latestRun = useMemo(() => sortedByDateDesc(data.runs, (run) => run.started_at)[0] ?? null, [data.runs]);
  const latestGymSession = useMemo(
    () => sortedByDateDesc(data.gymSessions, (session) => session.date)[0] ?? null,
    [data.gymSessions],
  );
  const latestClimbingSession = useMemo(
    () => sortedByDateDesc(data.climbingSessions, (session) => session.date)[0] ?? null,
    [data.climbingSessions],
  );
  const activeProjects = useMemo(
    () => data.climbingProjects.filter((project) => project.status === "active").slice(0, 3),
    [data.climbingProjects],
  );
  const activeWorkoutProgress = useMemo(() => getActiveWorkoutProgress(data.activeWorkout), [data.activeWorkout]);
  const trainingBrief = useMemo(
    () =>
      buildTrainingBrief({
        checkIn: data.checkIn,
        runningAnalytics: data.runningAnalytics,
        gymAnalytics: data.gymAnalytics,
        climbingAnalytics: data.climbingAnalytics,
        activeWorkout: data.activeWorkout,
        climbingProjects: data.climbingProjects,
        latestRun,
        latestGymSession,
        latestClimbingSession,
        trainingPreferences: data.trainingPreferences,
      }),
    [
      data.activeWorkout,
      data.checkIn,
      data.climbingAnalytics,
      data.climbingProjects,
      data.gymAnalytics,
      data.runningAnalytics,
      data.trainingPreferences,
      latestClimbingSession,
      latestGymSession,
      latestRun,
    ],
  );

  function handleTrainingBriefAction(target?: TrainingBriefActionTarget) {
    if (!target) return;
    if (target === "check-in") {
      openQuickLog("check-in");
      return;
    }
    if (target === "project") {
      openQuickLog("project");
      return;
    }
    navigate(`/${target}`);
  }

  if (loading) {
    return (
      <>
        <PageHeader
          title={user ? `Ready, ${user.username}` : "TrainOS Command"}
          description="Loading today's readiness, weekly balance, active work, and recent training."
          accent="green"
          icon={ClipboardCheck}
        />
        <section className="mt-7 md:mt-8">
          <LoadingStateCard accent="green" message="Loading TrainOS command center..." />
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={user ? `Ready, ${user.username}` : "TrainOS Command"}
        description="Today, this week, active work, and the fastest paths to log what matters."
        accent="green"
        icon={ClipboardCheck}
      />

      <section className="mt-7 space-y-6 md:mt-8 md:space-y-7">
        <TodayReadinessCard
          checkIn={data.checkIn}
          readiness={readiness}
          onCheckIn={() => openQuickLog("check-in")}
        />

        <TrainingPulse
          runs={data.runs}
          gymSessions={data.gymSessions}
          climbingSessions={data.climbingSessions}
        />

        <TrainingBriefSection insights={trainingBrief} onAction={handleTrainingBriefAction} />

        <TrainingGoalsSection
          preferences={data.trainingPreferences}
          error={errors.preferences}
          onEdit={() => setGoalsOpen(true)}
        />

        <WeeklyBalanceSection
          runningAnalytics={data.runningAnalytics}
          gymAnalytics={data.gymAnalytics}
          climbingAnalytics={data.climbingAnalytics}
          trainingPreferences={data.trainingPreferences}
          errors={errors}
        />

        <ActiveFocusSection
          activeWorkout={data.activeWorkout}
          activeWorkoutProgress={activeWorkoutProgress}
          routines={data.routines}
          activeProjects={activeProjects}
          latestRun={latestRun}
          runningAnalytics={data.runningAnalytics}
          errors={errors}
          onNavigate={navigate}
          onQuickLog={openQuickLog}
        />

        <RecentTrainingSection
          latestRun={latestRun}
          latestGymSession={latestGymSession}
          latestClimbingSession={latestClimbingSession}
          errors={errors}
          onNavigate={navigate}
          onQuickLog={openQuickLog}
        />

        <QuickActionsSection onQuickLog={openQuickLog} />
      </section>

      <QuickLogSheet
        open={quickLogOpen}
        onOpenChange={setQuickLogOpen}
        initialMode={quickLogMode}
        onSaved={() => setRefreshKey((key) => key + 1)}
      />
      <TrainingGoalsSheet
        key={`${goalsOpen}-${data.trainingPreferences.id}-${data.trainingPreferences.updated_at}`}
        open={goalsOpen}
        preferences={data.trainingPreferences}
        onOpenChange={setGoalsOpen}
        onSaved={(preferences) => {
          setData((current) => ({ ...current, trainingPreferences: preferences }));
          setRefreshKey((key) => key + 1);
        }}
      />
    </>
  );
}

function TodayReadinessCard({
  checkIn,
  readiness,
  onCheckIn,
}: {
  checkIn: DailyCheckIn | null;
  readiness: ReturnType<typeof getReadiness>;
  onCheckIn: () => void;
}) {
  if (!checkIn) {
    return (
      <EmptyActionCard
        icon={ClipboardCheck}
        title="No check-in yet"
        message="Log sleep, mood, energy, soreness, and stress to anchor today."
        actionLabel="Log check-in"
        onAction={onCheckIn}
        accent="green"
        className="shadow-glow"
      />
    );
  }

  const metrics = [
    { label: "Sleep", value: checkIn.sleep_hours ? `${formatNumber(checkIn.sleep_hours, 1)}h` : "--" },
    { label: "Mood", value: checkIn.mood ? `${checkIn.mood}/10` : "--" },
    { label: "Energy", value: checkIn.energy ? `${checkIn.energy}/10` : "--" },
    { label: "Soreness", value: checkIn.soreness ? `${checkIn.soreness}/10` : "--" },
    { label: "Stress", value: checkIn.stress ? `${checkIn.stress}/10` : "--" },
  ];

  return (
    <Card className="border-l-2 border-l-green p-5 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="telemetry-label">Today readiness</p>
          <h2 className="mt-2 text-xl font-semibold text-text-primary">{readiness.label}</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{readiness.detail}</p>
        </div>
        {readiness.score !== null ? (
          <div className="shrink-0 text-left sm:text-right">
            <p className="metric-number text-4xl font-semibold text-green">{readiness.score}</p>
            <p className="telemetry-label mt-1">Readiness</p>
          </div>
        ) : <span className="w-fit rounded-full border border-green/50 bg-green-muted px-3 py-1 text-xs font-semibold text-green">Baseline</span>}
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="min-w-[4.5rem]">
              <p className="telemetry-label">{metric.label}</p>
              <p className="metric-number mt-1 text-lg font-semibold text-text-primary">{metric.value}</p>
            </div>
          ))}
        </div>
        {checkIn.notes ? (
          <div className="mt-4 border-t border-border pt-4">
            <p className="telemetry-label">Notes</p>
            <p className="mt-1 line-clamp-3 text-sm leading-6 text-text-secondary">{checkIn.notes}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function TrainingPulse({
  runs,
  gymSessions,
  climbingSessions,
}: {
  runs: RunActivity[];
  gymSessions: GymSession[];
  climbingSessions: ClimbingSession[];
}) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const markersByDay = new Map<string, Set<"run" | "gym" | "climb">>();
  const add = (value: string | null | undefined, kind: "run" | "gym" | "climb") => {
    if (!value) return;
    const parsed = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
    if (Number.isNaN(parsed.valueOf())) return;
    const key = `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
    const current = markersByDay.get(key) ?? new Set();
    current.add(kind);
    markersByDay.set(key, current);
  };
  runs.forEach((run) => add(run.started_at, "run"));
  gymSessions.forEach((session) => add(session.date, "gym"));
  climbingSessions.forEach((session) => add(session.date, "climb"));

  const markerClass = { run: "bg-green", gym: "bg-amber", climb: "bg-indigo" };
  const markerLabel = { run: "Run", gym: "Gym", climb: "Climb" };

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="telemetry-label">Training pulse</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">Your last seven days</h2>
        </div>
        <p className="text-xs text-text-muted">Real session records</p>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-3">
        {days.map((date) => {
          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const markers = [...(markersByDay.get(key) ?? new Set<"run" | "gym" | "climb">())];
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <div key={key} className={cn("min-w-0 border-l border-border pl-2 sm:pl-3", isToday && "border-l-green") }>
              <p className={cn("telemetry-label text-[0.62rem]", isToday && "text-green")}>{date.toLocaleDateString(undefined, { weekday: "short" })}</p>
              <div className="mt-3 flex min-h-5 flex-wrap gap-1" aria-label={markers.length ? markers.map((marker) => markerLabel[marker]).join(", ") : "Rest day"}>
                {markers.map((marker) => <span key={marker} title={markerLabel[marker]} className={cn("h-2.5 w-2.5 rounded-full", markerClass[marker])} />)}
              </div>
              <p className="mt-2 truncate text-[0.68rem] text-text-muted">{isToday ? "Today" : markers.length ? markers.map((marker) => markerLabel[marker]).join(" · ") : "Rest"}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TrainingBriefSection({
  insights,
  onAction,
}: {
  insights: TrainingBriefInsight[];
  onAction: (target?: TrainingBriefActionTarget) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Training Brief"
        title="Today's rule-based brief"
        description="Deterministic signals from readiness, running, gym, and climbing."
      />
      {insights.length === 0 ? (
        <LowDataCard
          accent="indigo"
          title="No brief yet"
          message="Log across Run, Gym, and Climb to unlock your training brief."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {insights.map((insight, index) => (
            <TrainingBriefCard key={insight.id} insight={insight} delay={index * 0.03} primary={index === 0} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingBriefCard({
  insight,
  delay,
  primary,
  onAction,
}: {
  insight: TrainingBriefInsight;
  delay: number;
  primary: boolean;
  onAction: (target?: TrainingBriefActionTarget) => void;
}) {
  const tone = briefToneStyles[insight.tone];

  return (
    <Card className={cn("p-4", tone.border, primary && "border-l-2 border-l-green lg:col-span-2 lg:p-5")} delay={delay}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em]", tone.badge)}>
          {briefPillarLabels[insight.pillar]}
        </span>
        <span className={cn("text-[0.62rem] font-semibold uppercase tracking-[0.16em]", tone.text)}>
          {insight.tone}
        </span>
      </div>
      <h3 className="mt-3 text-base font-semibold text-text-primary">{insight.title}</h3>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{insight.message}</p>
      {insight.actionLabel && insight.actionTarget ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn("mt-4 w-full rounded-xl sm:w-auto", tone.button)}
          onClick={() => onAction(insight.actionTarget)}
        >
          {insight.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </Card>
  );
}

function TrainingGoalsSection({
  preferences,
  error,
  onEdit,
}: {
  preferences: TrainingPreferences;
  error?: string;
  onEdit: () => void;
}) {
  const runDistanceTarget = formatOptionalNumber(preferences.running_weekly_distance_target_km, 1);

  return (
    <Card className="border-green/40 p-5 md:p-6" delay={0.04}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-green bg-green-muted px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-green">
              Goals
            </span>
            <span className="rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-xs font-semibold text-text-secondary">
              {primaryFocusLabels[preferences.primary_focus]} focus
            </span>
          </div>
          <h2 className="mt-3 text-xl font-semibold text-text-primary">Training goals</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Weekly targets for the Training Brief and balance cards.
          </p>
          {error ? <p className="mt-2 text-sm leading-6 text-amber">{error}</p> : null}
        </div>
        <Button type="button" variant="secondary" className="w-full rounded-2xl border-green bg-green-muted text-green hover:bg-green/20 sm:w-auto" onClick={onEdit}>
          <Target className="h-4 w-4" />
          Edit goals
        </Button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <GoalTile
          accent="green"
          title="Run target"
          value={`${preferences.running_sessions_per_week} ${pluralize("run", preferences.running_sessions_per_week)}/week`}
          detail={
            runDistanceTarget
              ? `${runDistanceTarget} km weekly distance · ${runningGoalLabels[preferences.running_goal]}`
              : runningGoalLabels[preferences.running_goal]
          }
        />
        <GoalTile
          accent="amber"
          title="Gym target"
          value={`${preferences.gym_sessions_per_week} ${pluralize("session", preferences.gym_sessions_per_week)}/week`}
          detail={gymGoalLabels[preferences.gym_goal]}
        />
        <GoalTile
          accent="indigo"
          title="Climb target"
          value={`${preferences.climbing_sessions_per_week} ${pluralize("session", preferences.climbing_sessions_per_week)}/week`}
          detail={`${climbingGoalLabels[preferences.climbing_goal]} · ${preferences.climbing_target_bouldering_grade} / ${preferences.climbing_target_route_grade}`}
        />
      </div>
    </Card>
  );
}

function GoalTile({
  accent,
  title,
  value,
  detail,
}: {
  accent: Accent;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-bg-elevated p-4", accentStyles[accent].border)}>
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{title}</p>
      <p className={cn("mt-2 font-mono text-lg font-semibold", accentStyles[accent].text)}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-text-secondary">{detail}</p>
    </div>
  );
}

type TrainingGoalsFormState = {
  primary_focus: TrainingPreferences["primary_focus"];
  running_goal: TrainingPreferences["running_goal"];
  running_sessions_per_week: string;
  running_weekly_distance_target_km: string;
  gym_goal: TrainingPreferences["gym_goal"];
  gym_sessions_per_week: string;
  climbing_goal: TrainingPreferences["climbing_goal"];
  climbing_sessions_per_week: string;
  climbing_target_bouldering_grade: string;
  climbing_target_route_grade: string;
};

function toGoalsForm(preferences: TrainingPreferences): TrainingGoalsFormState {
  return {
    primary_focus: preferences.primary_focus,
    running_goal: preferences.running_goal,
    running_sessions_per_week: String(preferences.running_sessions_per_week),
    running_weekly_distance_target_km:
      preferences.running_weekly_distance_target_km === null ? "" : String(preferences.running_weekly_distance_target_km),
    gym_goal: preferences.gym_goal,
    gym_sessions_per_week: String(preferences.gym_sessions_per_week),
    climbing_goal: preferences.climbing_goal,
    climbing_sessions_per_week: String(preferences.climbing_sessions_per_week),
    climbing_target_bouldering_grade: preferences.climbing_target_bouldering_grade,
    climbing_target_route_grade: preferences.climbing_target_route_grade,
  };
}

function TrainingGoalsSheet({
  open,
  preferences,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  preferences: TrainingPreferences;
  onOpenChange: (open: boolean) => void;
  onSaved: (preferences: TrainingPreferences) => void;
}) {
  const [form, setForm] = useState<TrainingGoalsFormState>(() => toGoalsForm(preferences));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateForm<K extends keyof TrainingGoalsFormState>(key: K, value: TrainingGoalsFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function parseSessionTarget(value: string, label: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 14) {
      throw new Error(`${label} sessions per week must be a whole number between 0 and 14.`);
    }
    return parsed;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const runningSessions = parseSessionTarget(form.running_sessions_per_week, "Running");
      const gymSessions = parseSessionTarget(form.gym_sessions_per_week, "Gym");
      const climbingSessions = parseSessionTarget(form.climbing_sessions_per_week, "Climbing");
      const distanceText = form.running_weekly_distance_target_km.trim();
      const distanceTarget = distanceText ? Number(distanceText) : null;

      if (distanceTarget !== null && (!Number.isFinite(distanceTarget) || distanceTarget < 0)) {
        throw new Error("Running weekly distance target must be empty or zero or greater.");
      }

      const payload: TrainingPreferencesInput = {
        primary_focus: form.primary_focus,
        running_goal: form.running_goal,
        running_sessions_per_week: runningSessions,
        running_weekly_distance_target_km: distanceTarget,
        gym_goal: form.gym_goal,
        gym_sessions_per_week: gymSessions,
        climbing_goal: form.climbing_goal,
        climbing_sessions_per_week: climbingSessions,
        climbing_target_bouldering_grade: form.climbing_target_bouldering_grade.trim() || "V4",
        climbing_target_route_grade: form.climbing_target_route_grade.trim() || "5.10a",
      };

      setSaving(true);
      const updatedPreferences = await api.trainingPreferences.update(payload);
      onSaved(updatedPreferences);
      setSuccess("Training goals saved.");
      window.setTimeout(() => onOpenChange(false), 450);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save training goals.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto md:w-[min(92vw,44rem)]">
        <SheetHeader>
          <SheetTitle>Training goals</SheetTitle>
          <SheetDescription>
            Set simple weekly targets for Home balance and the deterministic Training Brief.
          </SheetDescription>
        </SheetHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {error ? (
            <div className="rounded-2xl border border-red bg-red-muted px-4 py-3 text-sm leading-6 text-red">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-2xl border border-green bg-green-muted px-4 py-3 text-sm leading-6 text-green">
              {success}
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-bg-elevated p-4">
            <GoalFormField label="Primary focus" htmlFor="training-goals-primary-focus">
              <select
                id="training-goals-primary-focus"
                className={selectClassName()}
                value={form.primary_focus}
                onChange={(event) => updateForm("primary_focus", event.target.value as TrainingPreferences["primary_focus"])}
              >
                {Object.entries(primaryFocusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </GoalFormField>
          </div>

          <div className="rounded-2xl border border-green/40 bg-bg-elevated p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-green">Running</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <GoalFormField label="Running goal" htmlFor="training-goals-running-goal">
                <select
                  id="training-goals-running-goal"
                  className={selectClassName()}
                  value={form.running_goal}
                  onChange={(event) => updateForm("running_goal", event.target.value as TrainingPreferences["running_goal"])}
                >
                  {Object.entries(runningGoalLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </GoalFormField>
              <GoalFormField label="Sessions/week" htmlFor="training-goals-running-sessions">
                <Input
                  id="training-goals-running-sessions"
                  type="number"
                  min={0}
                  max={14}
                  value={form.running_sessions_per_week}
                  onChange={(event) => updateForm("running_sessions_per_week", event.target.value)}
                />
              </GoalFormField>
              <GoalFormField label="Weekly distance target km" htmlFor="training-goals-running-distance" className="md:col-span-2">
                <Input
                  id="training-goals-running-distance"
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.running_weekly_distance_target_km}
                  placeholder="Optional"
                  onChange={(event) => updateForm("running_weekly_distance_target_km", event.target.value)}
                />
              </GoalFormField>
            </div>
          </div>

          <div className="rounded-2xl border border-amber/40 bg-bg-elevated p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-amber">Gym</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <GoalFormField label="Gym goal" htmlFor="training-goals-gym-goal">
                <select
                  id="training-goals-gym-goal"
                  className={selectClassName("amber")}
                  value={form.gym_goal}
                  onChange={(event) => updateForm("gym_goal", event.target.value as TrainingPreferences["gym_goal"])}
                >
                  {Object.entries(gymGoalLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </GoalFormField>
              <GoalFormField label="Sessions/week" htmlFor="training-goals-gym-sessions">
                <Input
                  id="training-goals-gym-sessions"
                  accent="amber"
                  type="number"
                  min={0}
                  max={14}
                  value={form.gym_sessions_per_week}
                  onChange={(event) => updateForm("gym_sessions_per_week", event.target.value)}
                />
              </GoalFormField>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo/40 bg-bg-elevated p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-indigo">Climbing</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <GoalFormField label="Climbing goal" htmlFor="training-goals-climbing-goal">
                <select
                  id="training-goals-climbing-goal"
                  className={selectClassName("indigo")}
                  value={form.climbing_goal}
                  onChange={(event) => updateForm("climbing_goal", event.target.value as TrainingPreferences["climbing_goal"])}
                >
                  {Object.entries(climbingGoalLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </GoalFormField>
              <GoalFormField label="Sessions/week" htmlFor="training-goals-climbing-sessions">
                <Input
                  id="training-goals-climbing-sessions"
                  accent="indigo"
                  type="number"
                  min={0}
                  max={14}
                  value={form.climbing_sessions_per_week}
                  onChange={(event) => updateForm("climbing_sessions_per_week", event.target.value)}
                />
              </GoalFormField>
              <GoalFormField label="Bouldering target" htmlFor="training-goals-bouldering-target">
                <Input
                  id="training-goals-bouldering-target"
                  accent="indigo"
                  value={form.climbing_target_bouldering_grade}
                  placeholder="V4"
                  onChange={(event) => updateForm("climbing_target_bouldering_grade", event.target.value)}
                />
              </GoalFormField>
              <GoalFormField label="Route target" htmlFor="training-goals-route-target">
                <Input
                  id="training-goals-route-target"
                  accent="indigo"
                  value={form.climbing_target_route_grade}
                  placeholder="5.10a"
                  onChange={(event) => updateForm("climbing_target_route_grade", event.target.value)}
                />
              </GoalFormField>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-2xl" disabled={saving}>
              {saving ? "Saving..." : "Save goals"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function GoalFormField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function WeeklyBalanceSection({
  runningAnalytics,
  gymAnalytics,
  climbingAnalytics,
  trainingPreferences,
  errors,
}: {
  runningAnalytics: RunningAnalytics | null;
  gymAnalytics: GymAnalytics | null;
  climbingAnalytics: ClimbingAnalytics | null;
  trainingPreferences: TrainingPreferences;
  errors: HomeErrors;
}) {
  const runningDistanceTarget = trainingPreferences.running_weekly_distance_target_km;

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="This Week"
        title="Training balance"
        description="A real-time split across running, gym, and climbing."
      />
      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        <BalanceCard
          accent="green"
          icon={Timer}
          title="Run"
          value={
            runningAnalytics
              ? `${formatNumber(runningAnalytics.current_week.week_distance_km, 1)} km`
              : "--"
          }
          detail={
            runningAnalytics
              ? targetProgressLabel(
                  runningAnalytics.current_week.week_run_count,
                  trainingPreferences.running_sessions_per_week,
                  "run",
                )
              : errors.running ?? "Import or log a run to build your week."
          }
          targetDetail={
            runningAnalytics && runningDistanceTarget
              ? `${formatNumber(runningAnalytics.current_week.week_distance_km, 1)} / ${formatNumber(runningDistanceTarget, 1)} km target`
              : undefined
          }
        />
        <BalanceCard
          accent="amber"
          icon={Dumbbell}
          title="Gym"
          value={gymAnalytics ? `${gymAnalytics.summary.sessions_this_week}` : "--"}
          detail={
            gymAnalytics
              ? targetProgressLabel(
                  gymAnalytics.summary.sessions_this_week,
                  trainingPreferences.gym_sessions_per_week,
                  "session",
                )
              : errors.gym ?? "Quick log gym work to build your strength map."
          }
          targetDetail={gymAnalytics ? `${gymAnalytics.summary.sets_this_week} sets this week` : undefined}
        />
        <BalanceCard
          accent="indigo"
          icon={Mountain}
          title="Climb"
          value={climbingAnalytics ? `${climbingAnalytics.summary.sessions_this_week}` : "--"}
          detail={
            climbingAnalytics
              ? targetProgressLabel(
                  climbingAnalytics.summary.sessions_this_week,
                  trainingPreferences.climbing_sessions_per_week,
                  "session",
                )
              : errors.climbing ?? "Log bouldering or top rope to build your baseline."
          }
          targetDetail={climbingAnalytics ? `${climbingAnalytics.summary.attempts_this_week} tries this week` : undefined}
        />
      </div>
    </div>
  );
}

function BalanceCard({
  accent,
  icon: Icon,
  title,
  value,
  detail,
  targetDetail,
}: {
  accent: Accent;
  icon: typeof Timer;
  title: string;
  value: string;
  detail: string;
  targetDetail?: string;
}) {
  return (
    <Card className={cn("p-4", accentStyles[accent].border)} delay={0.04}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{title}</p>
          <p className={cn("mt-3 font-mono text-3xl font-semibold tracking-tight", accentStyles[accent].text)}>
            {value}
          </p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{detail}</p>
          {targetDetail ? (
            <p className={cn("mt-2 w-fit rounded-full border px-2.5 py-1 text-xs font-semibold", accentStyles[accent].badge)}>
              {targetDetail}
            </p>
          ) : null}
        </div>
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border", accentStyles[accent].icon)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

function ActiveFocusSection({
  activeWorkout,
  activeWorkoutProgress,
  routines,
  activeProjects,
  latestRun,
  runningAnalytics,
  errors,
  onNavigate,
  onQuickLog,
}: {
  activeWorkout: ActiveWorkout | null;
  activeWorkoutProgress: ReturnType<typeof getActiveWorkoutProgress>;
  routines: WorkoutTemplate[];
  activeProjects: ClimbingProject[];
  latestRun: RunActivity | null;
  runningAnalytics: RunningAnalytics | null;
  errors: HomeErrors;
  onNavigate: (path: string) => void;
  onQuickLog: (mode: QuickLogMode) => void;
}) {
  const noActiveFocus = !activeWorkout && activeProjects.length === 0 && !latestRun;

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Active Focus"
        title="Continue what matters"
        description="In-progress work, active projects, and the next useful action."
      />
      {noActiveFocus ? (
        <LowDataCard
          accent="green"
          title="No active workout or urgent climbing project right now."
          message="Use Quick Log for a fast session, or start a routine from Gym when you are training today."
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={cn("p-4", activeWorkout ? "border-amber/70 shadow-amber" : "border-border")} delay={0.06}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Gym</p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">
                {activeWorkout ? "Workout in progress" : routines.length ? "Routine ready" : "Quick log strength"}
              </h3>
            </div>
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border", accentStyles.amber.icon)}>
              <Dumbbell className="h-5 w-5" />
            </span>
          </div>
          {errors.gym ? (
            <p className="mt-4 text-sm leading-6 text-red">{errors.gym}</p>
          ) : activeWorkout ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="font-semibold text-text-primary">{activeWorkout.template_summary?.name ?? "Open workout"}</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {activeWorkoutProgress?.exerciseLabel} - {activeWorkoutProgress?.setLabel} -{" "}
                  {activeWorkoutProgress?.loggedSetCount ?? 0} sets logged
                </p>
              </div>
              <div className="h-2 rounded-full bg-bg-elevated">
                <div
                  className="h-full rounded-full bg-amber transition-all"
                  style={{ width: `${activeWorkoutProgress?.percent ?? 0}%` }}
                />
              </div>
              <ActionButton label="Resume workout" accent="amber" onClick={() => onNavigate("/gym")} />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-text-secondary">
                {routines.length
                  ? `${routines.length} routines saved. Start one from the Gym routines tab.`
                  : "No active routine is running. Log a quick set if you just need fast capture."}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <ActionButton
                  label={routines.length ? "Start routine" : "Quick log gym"}
                  accent="amber"
                  onClick={() => (routines.length ? onNavigate("/gym") : onQuickLog("gym"))}
                />
                {routines.length ? (
                  <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => onQuickLog("gym")}>
                    Quick log
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </Card>

        <Card className={cn("p-4", activeProjects.length ? "border-indigo/70 shadow-indigo" : "border-border")} delay={0.08}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Climb</p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">
                {activeProjects.length ? "Active projects" : "No active projects"}
              </h3>
            </div>
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border", accentStyles.indigo.icon)}>
              <Mountain className="h-5 w-5" />
            </span>
          </div>
          {errors.climbing ? (
            <p className="mt-4 text-sm leading-6 text-red">{errors.climbing}</p>
          ) : activeProjects.length ? (
            <div className="mt-4 space-y-3">
              {activeProjects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-border bg-bg-elevated px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-text-primary">{project.name}</p>
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", accentStyles.indigo.badge)}>
                      {project.grade}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {project.total_try_count} tries
                    {project.latest_attempt_date ? ` - last ${formatShortDate(project.latest_attempt_date)}` : " - no linked tries yet"}
                  </p>
                </div>
              ))}
              <ActionButton label="View projects" accent="indigo" onClick={() => onNavigate("/climb")} />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-text-secondary">
                Create a bouldering or top-rope project when you want to track tries over time.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <ActionButton label="Create project" accent="indigo" onClick={() => onQuickLog("project")} />
                <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => onQuickLog("climb")}>
                  Log climb
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className={cn("p-4", latestRun ? "border-green/70 shadow-glow" : "border-border")} delay={0.1}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Run</p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">
                {latestRun ? "Latest run loaded" : "Build your run baseline"}
              </h3>
            </div>
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border", accentStyles.green.icon)}>
              <Timer className="h-5 w-5" />
            </span>
          </div>
          {errors.running ? (
            <p className="mt-4 text-sm leading-6 text-red">{errors.running}</p>
          ) : latestRun ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MiniMetric label="Distance" value={`${formatNumber(latestRun.distance_km, 2)} km`} accent="green" />
                <MiniMetric label="Pace" value={formatPace(latestRun.avg_pace_seconds_per_km)} accent="green" />
              </div>
              <p className="text-sm leading-6 text-text-secondary">
                Week volume: {runningAnalytics ? `${formatNumber(runningAnalytics.current_week.week_distance_km, 1)} km` : "--"}
              </p>
              <ActionButton label="Open run dashboard" accent="green" onClick={() => onNavigate("/run")} />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-text-secondary">
                Import a TCX file or log a manual run to start your marathon baseline.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <ActionButton label="Import run" accent="green" onClick={() => onNavigate("/run")} />
                <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => onQuickLog("run")}>
                  Log run
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function RecentTrainingSection({
  latestRun,
  latestGymSession,
  latestClimbingSession,
  errors,
  onNavigate,
  onQuickLog,
}: {
  latestRun: RunActivity | null;
  latestGymSession: GymSession | null;
  latestClimbingSession: ClimbingSession | null;
  errors: HomeErrors;
  onNavigate: (path: string) => void;
  onQuickLog: (mode: QuickLogMode) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Recent Training"
        title="Last logged work"
        description="The latest saved activity from each training pillar."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {errors.running ? (
          <ErrorStateCard title="Running unavailable" message={errors.running} />
        ) : latestRun ? (
          <RecentCard
            accent="green"
            icon={Timer}
            title="Latest run"
            date={formatShortDate(latestRun.started_at)}
            metric={`${formatNumber(latestRun.distance_km, 2)} km`}
            detail={`${formatDuration(latestRun.duration_seconds)} - ${formatPace(latestRun.avg_pace_seconds_per_km)}`}
            actionLabel="View run"
            onAction={() => onNavigate("/run")}
          />
        ) : (
          <EmptyActionCard
            icon={FileUp}
            accent="green"
            title="No runs yet"
            message="Import a TCX file or log a manual run to build your running baseline."
            actionLabel="Import run"
            onAction={() => onNavigate("/run")}
          />
        )}

        {errors.gym ? (
          <ErrorStateCard title="Gym unavailable" message={errors.gym} />
        ) : latestGymSession ? (
          <RecentCard
            accent="amber"
            icon={Dumbbell}
            title="Latest completed workout"
            date={formatShortDate(latestGymSession.date)}
            metric={labelize(latestGymSession.split_type)}
            detail={`${latestGymSession.set_count} sets${
              latestGymSession.exercise_names.length ? ` - ${latestGymSession.exercise_names.slice(0, 2).join(", ")}` : ""
            }`}
            actionLabel="View gym"
            onAction={() => onNavigate("/gym")}
          />
        ) : (
          <EmptyActionCard
            icon={Dumbbell}
            accent="amber"
            title="No completed workouts yet"
            message="Quick log a set or start a routine to build your strength history."
            actionLabel="Quick log gym"
            onAction={() => onQuickLog("gym")}
          />
        )}

        {errors.climbing ? (
          <ErrorStateCard title="Climbing unavailable" message={errors.climbing} />
        ) : latestClimbingSession ? (
          <RecentCard
            accent="indigo"
            icon={Mountain}
            title="Latest climbing session"
            date={formatShortDate(latestClimbingSession.date)}
            metric={labelize(latestClimbingSession.session_type)}
            detail={`${latestClimbingSession.total_try_count} tries - ${latestClimbingSession.logged_climb_count} logged climbs`}
            actionLabel="View climb"
            onAction={() => onNavigate("/climb")}
          />
        ) : (
          <EmptyActionCard
            icon={Mountain}
            accent="indigo"
            title="No climbing sessions yet"
            message="Log bouldering or top rope to build your climbing baseline."
            actionLabel="Log climbing session"
            onAction={() => onQuickLog("climb")}
          />
        )}
      </div>
    </div>
  );
}

function RecentCard({
  accent,
  icon: Icon,
  title,
  date,
  metric,
  detail,
  actionLabel,
  onAction,
}: {
  accent: Accent;
  icon: typeof Timer;
  title: string;
  date: string;
  metric: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Card className={cn("p-4", accentStyles[accent].border)} delay={0.08}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{title}</p>
          <h3 className={cn("mt-3 font-mono text-2xl font-semibold", accentStyles[accent].text)}>{metric}</h3>
        </div>
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border", accentStyles[accent].icon)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 text-sm font-medium text-text-primary">{date}</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{detail}</p>
      <Button
        type="button"
        variant="secondary"
        className={cn("mt-4 w-full rounded-2xl", accentStyles[accent].button)}
        onClick={onAction}
      >
        {actionLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </Card>
  );
}

function QuickActionsSection({ onQuickLog }: { onQuickLog: (mode: QuickLogMode) => void }) {
  return (
    <Card delay={0.14} className="p-5 md:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Quick Log</p>
          <h2 className="mt-1 text-xl font-semibold text-text-primary">Capture the useful minimum</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Four fast paths for daily readiness, runs, gym work, and climbing.
          </p>
        </div>
        <Button
          className="w-full shrink-0 rounded-2xl sm:w-auto"
          onClick={() => onQuickLog("menu")}
          aria-label="Open quick log menu"
        >
          <Plus className="h-5 w-5" />
          Open menu
        </Button>
      </div>
      <div className="mb-4 flex">
        <span className="rounded-full border border-green bg-green-muted px-3 py-1 text-xs font-semibold text-green">
          Under 60s
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <QuickActionButton
          icon={ClipboardCheck}
          label="Check-in"
          hint="mood / sleep / energy"
          accent="green"
          onClick={() => onQuickLog("check-in")}
        />
        <QuickActionButton
          icon={Timer}
          label="Run"
          hint="distance / pace / effort"
          accent="green"
          onClick={() => onQuickLog("run")}
        />
        <QuickActionButton
          icon={Dumbbell}
          label="Gym"
          hint="split / sets / weight"
          accent="amber"
          onClick={() => onQuickLog("gym")}
        />
        <QuickActionButton
          icon={Mountain}
          label="Climb"
          hint="grade / result / style"
          accent="indigo"
          onClick={() => onQuickLog("climb")}
        />
      </div>
    </Card>
  );
}
