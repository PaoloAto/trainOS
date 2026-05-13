import { ArrowRight, ClipboardCheck, Dumbbell, FileUp, Mountain, Plus, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { QuickLogSheet, type QuickLogMode } from "@/components/app/QuickLogSheet";
import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { QuickActionButton } from "@/components/common/QuickActionButton";
import { EmptyActionCard, ErrorStateCard, LoadingStateCard, LowDataCard } from "@/components/common/StateCards";
import { Button } from "@/components/ui/button";
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
  User,
  WorkoutTemplate,
} from "@/lib/api";
import { api } from "@/lib/api";
import { formatDuration, formatPace, formatShortDate } from "@/lib/format";
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
};

type HomeErrors = Partial<Record<"running" | "gym" | "climbing", string>>;

type Accent = "green" | "amber" | "indigo";

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

  if (loading) {
    return (
      <>
        <PageHeader
          title={user ? `Ready, ${user.username}` : "TrainOS Command"}
          description="Loading today's readiness, weekly balance, active work, and recent training."
          accent="green"
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
      />

      <section className="mt-7 space-y-6 md:mt-8 md:space-y-7">
        <TodayReadinessCard
          checkIn={data.checkIn}
          readiness={readiness}
          onCheckIn={() => openQuickLog("check-in")}
        />

        <WeeklyBalanceSection
          runningAnalytics={data.runningAnalytics}
          gymAnalytics={data.gymAnalytics}
          climbingAnalytics={data.climbingAnalytics}
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
    <Card className="overflow-hidden border-green/50 p-0 shadow-glow" delay={0.02}>
      <div className="border-b border-green/30 bg-green-muted/60 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.22em] text-text-muted">Today Readiness</p>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">{readiness.label}</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">{readiness.detail}</p>
          </div>
          {readiness.score !== null ? (
            <div className="rounded-2xl border border-green bg-bg-card px-4 py-3 text-center">
              <p className="font-mono text-3xl font-semibold text-green">{readiness.score}</p>
              <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">Score</p>
            </div>
          ) : (
            <span className="w-fit rounded-full border border-green bg-bg-card px-3 py-1 text-xs font-semibold text-green">
              Baseline
            </span>
          )}
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-border bg-bg-elevated p-3">
              <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{metric.label}</p>
              <p className="mt-2 font-mono text-xl font-semibold text-text-primary">{metric.value}</p>
            </div>
          ))}
        </div>
        {checkIn.notes ? (
          <div className="rounded-2xl border border-border bg-bg-elevated px-4 py-3">
            <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">Notes</p>
            <p className="mt-1 line-clamp-3 text-sm leading-6 text-text-secondary">{checkIn.notes}</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function WeeklyBalanceSection({
  runningAnalytics,
  gymAnalytics,
  climbingAnalytics,
  errors,
}: {
  runningAnalytics: RunningAnalytics | null;
  gymAnalytics: GymAnalytics | null;
  climbingAnalytics: ClimbingAnalytics | null;
  errors: HomeErrors;
}) {
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
              ? `${runningAnalytics.current_week.week_run_count} runs this week`
              : errors.running ?? "Import or log a run to build your week."
          }
        />
        <BalanceCard
          accent="amber"
          icon={Dumbbell}
          title="Gym"
          value={gymAnalytics ? `${gymAnalytics.summary.sessions_this_week}` : "--"}
          detail={
            gymAnalytics
              ? `${gymAnalytics.summary.sets_this_week} sets this week`
              : errors.gym ?? "Quick log gym work to build your strength map."
          }
        />
        <BalanceCard
          accent="indigo"
          icon={Mountain}
          title="Climb"
          value={climbingAnalytics ? `${climbingAnalytics.summary.sessions_this_week}` : "--"}
          detail={
            climbingAnalytics
              ? `${climbingAnalytics.summary.attempts_this_week} tries this week`
              : errors.climbing ?? "Log bouldering or top rope to build your baseline."
          }
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
}: {
  accent: Accent;
  icon: typeof Timer;
  title: string;
  value: string;
  detail: string;
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
                Create a bouldering or top-rope project when you want to track attempts over time.
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
