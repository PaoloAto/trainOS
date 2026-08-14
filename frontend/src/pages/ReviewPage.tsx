import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Dumbbell,
  Mountain,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { QuickLogSheet, type QuickLogMode } from "@/components/app/QuickLogSheet";
import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorStateCard, LoadingStateCard, LowDataCard } from "@/components/common/StateCards";
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
  TrainingPreferences,
} from "@/lib/api";
import { api, defaultTrainingPreferences } from "@/lib/api";
import { formatPace, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  buildWeeklyReview,
  type ReviewAccent,
  type ReviewTone,
  type WeeklyGoalCard,
  type WeeklyReviewAction,
  type WeeklyReviewItem,
} from "@/lib/weeklyReview";

type ReviewData = {
  checkIn: DailyCheckIn | null;
  trainingPreferences: TrainingPreferences;
  runningAnalytics: RunningAnalytics | null;
  gymAnalytics: GymAnalytics | null;
  climbingAnalytics: ClimbingAnalytics | null;
  activeWorkout: ActiveWorkout | null;
  climbingProjects: ClimbingProject[];
  runs: RunActivity[];
  gymSessions: GymSession[];
  climbingSessions: ClimbingSession[];
};

type ReviewErrors = Partial<Record<"preferences" | "running" | "gym" | "climbing", string>>;

const emptyReviewData: ReviewData = {
  checkIn: null,
  trainingPreferences: defaultTrainingPreferences,
  runningAnalytics: null,
  gymAnalytics: null,
  climbingAnalytics: null,
  activeWorkout: null,
  climbingProjects: [],
  runs: [],
  gymSessions: [],
  climbingSessions: [],
};

const accentStyles: Record<
  ReviewAccent,
  {
    border: string;
    bg: string;
    text: string;
    icon: string;
    badge: string;
    button: string;
    fill: string;
  }
> = {
  green: {
    border: "border-green/50",
    bg: "bg-green-muted",
    text: "text-green",
    icon: "border-green bg-green-muted text-green shadow-glow",
    badge: "border-green bg-green-muted text-green",
    button: "border-green bg-green-muted text-green hover:bg-green/20",
    fill: "bg-green",
  },
  amber: {
    border: "border-amber/50",
    bg: "bg-amber-muted",
    text: "text-amber",
    icon: "border-amber bg-amber-muted text-amber shadow-amber",
    badge: "border-amber bg-amber-muted text-amber",
    button: "border-amber bg-amber-muted text-amber hover:bg-amber/20",
    fill: "bg-amber",
  },
  indigo: {
    border: "border-indigo/50",
    bg: "bg-indigo-muted",
    text: "text-indigo",
    icon: "border-indigo bg-indigo-muted text-indigo shadow-indigo",
    badge: "border-indigo bg-indigo-muted text-indigo",
    button: "border-indigo bg-indigo-muted text-indigo hover:bg-indigo/20",
    fill: "bg-indigo",
  },
  neutral: {
    border: "border-border",
    bg: "bg-bg-elevated",
    text: "text-text-primary",
    icon: "border-border bg-bg-elevated text-text-secondary",
    badge: "border-border bg-bg-elevated text-text-secondary",
    button: "border-border bg-bg-elevated text-text-primary hover:bg-bg-card",
    fill: "bg-text-secondary",
  },
};

const toneStyles: Record<ReviewTone, { border: string; badge: string; text: string; icon: string }> = {
  positive: {
    border: "border-green/40",
    badge: "border-green bg-green-muted text-green",
    text: "text-green",
    icon: "border-green bg-green-muted text-green",
  },
  attention: {
    border: "border-amber/40",
    badge: "border-amber bg-amber-muted text-amber",
    text: "text-amber",
    icon: "border-amber bg-amber-muted text-amber",
  },
  info: {
    border: "border-indigo/40",
    badge: "border-indigo bg-indigo-muted text-indigo",
    text: "text-indigo",
    icon: "border-indigo bg-indigo-muted text-indigo",
  },
};

const pillarLabels: Record<WeeklyReviewItem["pillar"], string> = {
  readiness: "Readiness",
  run: "Run",
  gym: "Gym",
  climb: "Climb",
  balance: "Balance",
};

const goalIcons: Record<WeeklyGoalCard["id"], LucideIcon> = {
  run: Timer,
  gym: Dumbbell,
  climb: Mountain,
};

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

function sortedByDateDesc<T>(items: T[], getDate: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => {
    const dateA = getDate(a);
    const dateB = getDate(b);
    return new Date(dateB ?? 0).getTime() - new Date(dateA ?? 0).getTime();
  });
}

async function fetchReviewData(): Promise<{ data: ReviewData; errors: ReviewErrors }> {
  const [
    preferencesResult,
    checkInResult,
    runningAnalyticsResult,
    gymAnalyticsResult,
    climbingAnalyticsResult,
    activeWorkoutResult,
    climbingProjectsResult,
    runsResult,
    gymSessionsResult,
    climbingSessionsResult,
  ] = await Promise.allSettled([
    api.trainingPreferences.get(),
    api.checkIns.today(),
    api.runningAnalytics.get(),
    api.gymAnalytics.get(),
    api.climbingAnalytics.get(),
    api.activeWorkout.get(),
    api.climbingProjects.list(),
    api.runs.list(),
    api.gymSessions.list(),
    api.climbingSessions.list(),
  ] as const);

  const errors: ReviewErrors = {};

  if (preferencesResult.status === "rejected") {
    errors.preferences = "Training goals are using safe defaults for this review.";
  }
  if (runningAnalyticsResult.status === "rejected" || runsResult.status === "rejected") {
    errors.running = "Running data is temporarily unavailable.";
  }
  if (gymAnalyticsResult.status === "rejected" || activeWorkoutResult.status === "rejected" || gymSessionsResult.status === "rejected") {
    errors.gym = "Gym data is temporarily unavailable.";
  }
  if (
    climbingAnalyticsResult.status === "rejected" ||
    climbingProjectsResult.status === "rejected" ||
    climbingSessionsResult.status === "rejected"
  ) {
    errors.climbing = "Climbing data is temporarily unavailable.";
  }

  return {
    data: {
      trainingPreferences:
        preferencesResult.status === "fulfilled" ? preferencesResult.value : defaultTrainingPreferences,
      checkIn: checkInResult.status === "fulfilled" ? checkInResult.value : null,
      runningAnalytics:
        runningAnalyticsResult.status === "fulfilled" ? runningAnalyticsResult.value : null,
      gymAnalytics: gymAnalyticsResult.status === "fulfilled" ? gymAnalyticsResult.value : null,
      climbingAnalytics:
        climbingAnalyticsResult.status === "fulfilled" ? climbingAnalyticsResult.value : null,
      activeWorkout: activeWorkoutResult.status === "fulfilled" ? activeWorkoutResult.value : null,
      climbingProjects: climbingProjectsResult.status === "fulfilled" ? climbingProjectsResult.value : [],
      runs: runsResult.status === "fulfilled" ? runsResult.value : [],
      gymSessions: gymSessionsResult.status === "fulfilled" ? gymSessionsResult.value : [],
      climbingSessions: climbingSessionsResult.status === "fulfilled" ? climbingSessionsResult.value : [],
    },
    errors,
  };
}

export function ReviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ReviewData>(emptyReviewData);
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogMode, setQuickLogMode] = useState<QuickLogMode>("menu");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const result = await fetchReviewData();
      if (!active) return;
      setData(result.data);
      setErrors(result.errors);
      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const review = useMemo(
    () =>
      buildWeeklyReview({
        checkIn: data.checkIn,
        trainingPreferences: data.trainingPreferences,
        runningAnalytics: data.runningAnalytics,
        gymAnalytics: data.gymAnalytics,
        climbingAnalytics: data.climbingAnalytics,
        activeWorkout: data.activeWorkout,
        climbingProjects: data.climbingProjects,
      }),
    [
      data.activeWorkout,
      data.checkIn,
      data.climbingAnalytics,
      data.climbingProjects,
      data.gymAnalytics,
      data.runningAnalytics,
      data.trainingPreferences,
    ],
  );

  const latestRun = useMemo(() => sortedByDateDesc(data.runs, (run) => run.started_at)[0] ?? null, [data.runs]);
  const latestGymSession = useMemo(
    () => sortedByDateDesc(data.gymSessions, (session) => session.date)[0] ?? null,
    [data.gymSessions],
  );
  const latestClimbingSession = useMemo(
    () => sortedByDateDesc(data.climbingSessions, (session) => session.date)[0] ?? null,
    [data.climbingSessions],
  );

  function openQuickLog(mode: QuickLogMode) {
    setQuickLogMode(mode);
    setQuickLogOpen(true);
  }

  function handleAction(action: WeeklyReviewAction) {
    if (action.actionKind === "quick-log") {
      openQuickLog(action.actionTarget === "check-in" ? "check-in" : action.actionTarget);
      return;
    }

    if (action.actionTarget === "project" || action.actionTarget === "climb") {
      navigate("/climb");
      return;
    }
    if (action.actionTarget === "gym") {
      navigate("/gym");
      return;
    }
    if (action.actionTarget === "run") {
      navigate("/run");
      return;
    }
    navigate("/");
  }

  return (
    <>
      <PageHeader
        eyebrow="Review"
        title="Weekly Review"
        description="Goal progress, weekly highlights, attention items, and the next useful actions."
        accent="green"
        icon={ClipboardCheck}
      />

      <section className="mt-7 space-y-6 md:mt-8 md:space-y-7">
        {loading ? (
          <LoadingStateCard accent="green" message="Loading weekly review..." />
        ) : (
          <>
            <DataWarnings errors={errors} />

            <GoalCompletionSection goals={review.goals} />

            <HighlightsAndAttentionSection highlights={review.highlights} attention={review.attention} />

            <WeekSnapshotSection
              snapshot={review.snapshot}
              latestRun={latestRun}
              latestGymSession={latestGymSession}
              latestClimbingSession={latestClimbingSession}
              activeWorkout={data.activeWorkout}
            />

            <NextActionsSection actions={review.nextActions} onAction={handleAction} />
          </>
        )}
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

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div>
      <p className="text-[0.68rem] uppercase tracking-[0.22em] text-text-muted">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold text-text-primary">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p> : null}
    </div>
  );
}

function DataWarnings({ errors }: { errors: ReviewErrors }) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {entries.map(([source, message]) => (
        <ErrorStateCard key={source} title={`${labelize(source)} unavailable`} message={message} />
      ))}
    </div>
  );
}

function GoalCompletionSection({ goals }: { goals: WeeklyGoalCard[] }) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Goals"
        title="Weekly goal completion"
        description="Actual training against your saved targets."
      />
      <div className="divide-y divide-border rounded-card border border-border bg-bg-card lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
      </div>
    </div>
  );
}

function GoalCard({ goal }: { goal: WeeklyGoalCard }) {
  const Icon = goalIcons[goal.id];
  const accent = accentStyles[goal.accent];
  const tone = toneStyles[goal.statusTone];

  return (
    <div className={cn("p-5", accent.border)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{goal.title}</p>
          <h3 className={cn("mt-3 font-mono text-3xl font-semibold tracking-tight", accent.text)}>
            {goal.primaryValue}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">{goal.primaryLabel}</p>
        </div>
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border", accent.icon)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-bg-elevated">
          <div
            className={cn("h-full rounded-full transition-all", accent.fill)}
            style={{ width: `${goal.progressPercent}%` }}
          />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className={cn("w-fit rounded-full border px-2.5 py-1 text-xs font-semibold", tone.badge)}>
            {goal.statusLabel}
          </span>
          <span className="text-sm font-medium text-text-primary">{goal.secondaryValue}</span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {goal.details.map((detail) => (
          <p key={detail} className="text-sm leading-6 text-text-secondary">
            {detail}
          </p>
        ))}
      </div>
    </div>
  );
}

function HighlightsAndAttentionSection({
  highlights,
  attention,
}: {
  highlights: WeeklyReviewItem[];
  attention: WeeklyReviewItem[];
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Review Notes"
        title="Highlights and attention"
        description="Short deterministic items from this week's data."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-green bg-green-muted text-green">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Highlights</p>
              <h3 className="text-lg font-semibold text-text-primary">What went well</h3>
            </div>
          </div>
          {highlights.length ? (
            <div className="mt-4 space-y-3">
              {highlights.map((item) => (
                <ReviewItemRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <LowDataCard
              className="mt-4"
              accent="green"
              title="No weekly highlights yet."
              message="Log across Run, Gym, or Climb to build a useful review."
            />
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber bg-amber-muted text-amber">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Attention</p>
              <h3 className="text-lg font-semibold text-text-primary">What still needs work</h3>
            </div>
          </div>
          {attention.length ? (
            <div className="mt-4 space-y-3">
              {attention.map((item) => (
                <ReviewItemRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <LowDataCard
              className="mt-4"
              accent="amber"
              title="No attention items right now."
              message="Weekly targets and active work look clear based on current data."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

function ReviewItemRow({ item }: { item: WeeklyReviewItem }) {
  const tone = toneStyles[item.tone];

  return (
    <div className={cn("rounded-2xl border bg-bg-elevated p-4", tone.border)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-semibold text-text-primary">{item.title}</h4>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{item.message}</p>
        </div>
        <span className={cn("w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold", tone.badge)}>
          {pillarLabels[item.pillar]}
        </span>
      </div>
    </div>
  );
}

function WeekSnapshotSection({
  snapshot,
  latestRun,
  latestGymSession,
  latestClimbingSession,
  activeWorkout,
}: {
  snapshot: ReturnType<typeof buildWeeklyReview>["snapshot"];
  latestRun: RunActivity | null;
  latestGymSession: GymSession | null;
  latestClimbingSession: ClimbingSession | null;
  activeWorkout: ActiveWorkout | null;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Snapshot"
        title="This week at a glance"
        description="Volume, active work, and latest saved records."
      />
      <Card className="p-4 md:p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SnapshotMetric label="Sessions" value={String(snapshot.totalTrainingSessions)} helper="Run + Gym + Climb" accent="green" />
          <SnapshotMetric label="Run km" value={formatNumber(snapshot.runDistanceKm, 1)} helper={`${snapshot.runSessions} runs`} accent="green" />
          <SnapshotMetric label="Gym sets" value={String(snapshot.gymSets)} helper={`${snapshot.gymSessions} sessions`} accent="amber" />
          <SnapshotMetric label="Climb tries" value={String(snapshot.climbTries)} helper={`${snapshot.climbSessions} sessions`} accent="indigo" />
          <SnapshotMetric label="Projects" value={String(snapshot.activeProjectCount)} helper="Active climbing" accent="indigo" />
          <SnapshotMetric
            label="Workout"
            value={activeWorkout ? "Active" : "Clear"}
            helper={snapshot.activeWorkoutName ?? "No active routine"}
            accent={activeWorkout ? "amber" : "neutral"}
          />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <RecentMiniCard
            accent="green"
            icon={Timer}
            title="Latest run"
            empty="No runs logged yet."
            value={latestRun ? `${formatNumber(latestRun.distance_km, 2)} km` : null}
            detail={latestRun ? `${formatShortDate(latestRun.started_at)} - ${formatPace(latestRun.avg_pace_seconds_per_km)}` : null}
          />
          <RecentMiniCard
            accent="amber"
            icon={Dumbbell}
            title="Latest completed workout"
            empty="No completed workouts yet."
            value={latestGymSession ? labelize(latestGymSession.split_type) : null}
            detail={
              latestGymSession
                ? `${formatShortDate(latestGymSession.date)} - ${latestGymSession.set_count} sets`
                : null
            }
          />
          <RecentMiniCard
            accent="indigo"
            icon={Mountain}
            title="Latest climbing session"
            empty="No climbing sessions yet."
            value={latestClimbingSession ? labelize(latestClimbingSession.session_type) : null}
            detail={
              latestClimbingSession
                ? `${formatShortDate(latestClimbingSession.date)} - ${latestClimbingSession.total_try_count} tries`
                : null
            }
          />
        </div>
      </Card>
    </div>
  );
}

function SnapshotMetric({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper: string;
  accent: ReviewAccent;
}) {
  const styles = accentStyles[accent];

  return (
    <div className={cn("rounded-2xl border bg-bg-elevated p-3", styles.border)}>
      <p className="text-[0.6rem] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className={cn("mt-2 font-mono text-2xl font-semibold", styles.text)}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-text-secondary">{helper}</p>
    </div>
  );
}

function RecentMiniCard({
  accent,
  icon: Icon,
  title,
  value,
  detail,
  empty,
}: {
  accent: ReviewAccent;
  icon: LucideIcon;
  title: string;
  value: string | null;
  detail: string | null;
  empty: string;
}) {
  const styles = accentStyles[accent];

  return (
    <div className={cn("rounded-2xl border bg-bg-elevated p-4", styles.border)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border", styles.icon)}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{title}</p>
          {value ? (
            <>
              <p className="mt-2 font-semibold text-text-primary">{value}</p>
              <p className="mt-1 text-xs leading-5 text-text-secondary">{detail}</p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-6 text-text-secondary">{empty}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function NextActionsSection({
  actions,
  onAction,
}: {
  actions: WeeklyReviewAction[];
  onAction: (action: WeeklyReviewAction) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Next"
        title="Next actions"
        description="Simple actions that move the week forward."
      />
      {actions.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {actions.map((action) => (
            <NextActionCard key={action.id} action={action} onAction={onAction} />
          ))}
        </div>
      ) : (
        <LowDataCard
          accent="green"
          title="No urgent next action."
          message="Targets and active work look clear. Use Quick Log when the next session happens."
        />
      )}
    </div>
  );
}

function NextActionCard({
  action,
  onAction,
}: {
  action: WeeklyReviewAction;
  onAction: (action: WeeklyReviewAction) => void;
}) {
  const styles = accentStyles[action.accent];

  return (
    <Card className={cn("p-4", styles.border)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border", styles.icon)}>
          {action.actionTarget === "check-in" ? <ClipboardCheck className="h-5 w-5" /> : null}
          {action.actionTarget === "run" ? <Timer className="h-5 w-5" /> : null}
          {action.actionTarget === "gym" ? <Dumbbell className="h-5 w-5" /> : null}
          {action.actionTarget === "climb" || action.actionTarget === "project" ? <Mountain className="h-5 w-5" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-text-primary">{action.title}</h3>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{action.message}</p>
          <Button
            type="button"
            variant="secondary"
            className={cn("mt-4 w-full rounded-2xl sm:w-auto", styles.button)}
            onClick={() => onAction(action)}
          >
            {action.actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
