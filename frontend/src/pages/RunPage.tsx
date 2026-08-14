import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  FileUp,
  Gauge,
  History,
  LineChart as LineChartIcon,
  Target,
  Timer,
  TrendingUp,
  UploadCloud,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyActionCard, ErrorStateCard, LoadingStateCard } from "@/components/common/StateCards";
import { Button } from "@/components/ui/button";
import {
  api,
  type RunActivity,
  type RunImportSummary,
  type RunningAnalytics,
  type RunningAnalyticsRunSummary,
  type RunningLongRunSummary,
  type RunningImportBatch,
  type RunningImportResult,
  type RunningImportSource,
  type RunningPaceTrendPoint,
  type RunningWeeklyTrendPoint,
} from "@/lib/api";
import { formatDuration, formatExactDuration, formatPace, formatShortDate } from "@/lib/format";

const sourceOptions: Array<{ value: RunningImportSource; label: string }> = [
  { value: "garmin_export", label: "Garmin export" },
  { value: "strava_export", label: "Strava export" },
  { value: "other", label: "Other" },
];

const sourceLabels: Record<string, string> = {
  manual: "Manual",
  garmin_export: "Garmin import",
  strava_export: "Strava import",
  manual_upload: "Manual upload",
  other: "Other import",
};

const sourceBadgeClasses: Record<string, string> = {
  manual: "border-green bg-green-muted text-green",
  garmin_export: "border-green bg-green-muted text-green",
  strava_export: "border-indigo bg-indigo-muted text-indigo",
  manual_upload: "border-amber bg-amber-muted text-amber",
  other: "border-border bg-bg-elevated text-text-secondary",
};

type RunLike = Pick<
  RunActivity | RunImportSummary | RunningAnalyticsRunSummary,
  "distance_km" | "duration_seconds" | "avg_pace_seconds_per_km" | "source"
>;

export function RunPage() {
  const [runs, setRuns] = useState<RunActivity[]>([]);
  const [imports, setImports] = useState<RunningImportBatch[]>([]);
  const [analytics, setAnalytics] = useState<RunningAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function scrollToImportCard() {
    document.getElementById("running-import-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [runData, importData, analyticsData] = await Promise.all([
          api.runs.list(),
          api.runningImports.list(),
          api.runningAnalytics.get(),
        ]);

        if (!active) return;
        setRuns(runData);
        setImports(importData);
        setAnalytics(analyticsData);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load running data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  return (
    <>
      <PageHeader
        eyebrow="Running"
        title="Run Log"
        description="Manual logging stays live. TCX imports now feed a marathon-training baseline."
        accent="green"
        icon={Timer}
      />
      <section className="mt-7 space-y-4 md:mt-8 md:space-y-5">
        <RunningDashboard analytics={analytics} loading={loading} error={error} />
        <ImportRunCard onImported={() => setRefreshKey((value) => value + 1)} />
        <ImportHistory imports={imports} />

        <SectionHeader label="Recent runs" description="Manual and imported runs share one timeline." />
        {loading ? <LoadingStateCard message="Loading runs..." accent="green" /> : null}
        {error ? <ErrorStateCard title="Run log unavailable" message={error} /> : null}
        {!loading && !error && runs.length === 0 ? (
          <EmptyActionCard
            icon={FileUp}
            accent="green"
            title="No runs logged yet"
            message="Import a TCX file or log a manual run to build your running baseline."
            actionLabel="Import run"
            onAction={scrollToImportCard}
          />
        ) : null}
        {runs.map((run, index) => (
          <RunCard key={run.id} run={run} delay={index * 0.04} />
        ))}
      </section>
    </>
  );
}

function RunningDashboard({ analytics, loading, error }: { analytics: RunningAnalytics | null; loading: boolean; error: string | null }) {
  if (loading) {
    return <LoadingStateCard message="Loading running dashboard..." accent="green" />;
  }

  if (error) {
    return <ErrorStateCard title="Running dashboard unavailable" message="Run history still stays saved. Try refreshing the page." />;
  }

  if (!analytics || analytics.summary.total_runs === 0) {
    return (
      <Card className="overflow-hidden p-0 shadow-glow" delay={0.01}>
        <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Running dashboard</p>
          <h2 className="mt-1 text-xl font-semibold text-text-primary">No running data yet</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Log a manual run or import a TCX file to start your marathon baseline.
          </p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3 md:p-6">
          <DashboardMetric label="This week" value="0.00" unit="km" accent="green" />
          <DashboardMetric label="This month" value="0.00" unit="km" accent="amber" />
          <DashboardMetric label="Total runs" value="0" accent="indigo" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <BenchmarkCard analytics={analytics} />
      <RunningMetricGrid analytics={analytics} />
      <div className="grid gap-4 xl:grid-cols-3">
        <MarathonBaselineCard analytics={analytics} />
        <DataConfidenceCard analytics={analytics} totalRuns={analytics.summary.total_runs} />
        <TrainingRhythmCard analytics={analytics} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <WeeklyMileageChart points={analytics.weekly_distance_trend} totalRuns={analytics.summary.total_runs} />
        <PaceTrendCard points={analytics.recent_pace_trend} totalRuns={analytics.summary.total_runs} />
      </div>
      <LongRunProgressionCard runs={analytics.long_run_progression} />
      <InsightsCard insights={analytics.insights} />
    </div>
  );
}

function BenchmarkCard({ analytics }: { analytics: RunningAnalytics }) {
  const run = analytics.longest_run;
  if (!run) return null;

  const context = getRunContext(run);
  const baseline = analytics.marathon_baseline;
  const trackpoints = metadataNumber(run.raw_metadata, "trackpoint_count");

  return (
    <Card className="overflow-hidden p-0 shadow-glow" delay={0.01}>
      <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Running dashboard</p>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">{baseline.baseline_label}</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{baseline.baseline_note}</p>
          </div>
          <SourceBadge source={run.source} />
        </div>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-[1fr_1.2fr] md:p-6">
        <div>
          <p className="metric-number text-6xl font-bold leading-none text-green">{run.distance_km.toFixed(2)}</p>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-text-secondary">km longest run</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniMetric label="Date" value={formatShortDate(run.started_at)} />
          <MiniMetric label="Exact duration" value={formatExactDuration(run.duration_seconds)} />
          <MiniMetric label="Pace" value={formatPace(run.avg_pace_seconds_per_km)} />
          {run.avg_hr ? <MiniMetric label="Avg HR" value={Math.round(run.avg_hr).toString()} unit="bpm" /> : null}
          {run.max_hr ? <MiniMetric label="Max HR" value={Math.round(run.max_hr).toString()} unit="bpm" /> : null}
          {run.elevation_gain_m ? <MiniMetric label="Elevation" value={Math.round(run.elevation_gain_m).toString()} unit="m" /> : null}
          {trackpoints ? <MiniMetric label="Trackpoints" value={Math.round(trackpoints).toLocaleString()} /> : null}
        </div>
      </div>
      <div className="border-t border-border px-5 py-3 md:px-6">
        <p className="text-xs leading-5 text-text-muted">{context.note}</p>
      </div>
    </Card>
  );
}

function RunningMetricGrid({ analytics }: { analytics: RunningAnalytics }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 md:gap-4">
      <DashboardMetric label="This week" value={analytics.current_week.week_distance_km.toFixed(2)} unit="km" accent="green" subvalue={`${analytics.current_week.week_run_count} runs`} />
      <DashboardMetric label="This month" value={analytics.current_month.month_distance_km.toFixed(2)} unit="km" accent="amber" subvalue={`${analytics.current_month.month_run_count} runs`} />
      <DashboardMetric label="Total distance" value={analytics.summary.total_distance_km.toFixed(2)} unit="km" accent="indigo" subvalue={`${formatDuration(analytics.summary.total_duration_seconds)} total`} />
      <DashboardMetric label="Total runs" value={String(analytics.summary.total_runs)} accent="green" subvalue={`${analytics.summary.imported_run_count} imported`} />
      <DashboardMetric label="Average pace" value={formatPace(analytics.summary.avg_pace_seconds_per_km)} accent="amber" subvalue={`${analytics.summary.average_distance_km.toFixed(2)} km avg`} />
      <DashboardMetric label="Longest run" value={analytics.summary.longest_run_distance_km.toFixed(2)} unit="km" accent="indigo" subvalue={analytics.summary.latest_run_date ? `Latest ${formatShortDate(analytics.summary.latest_run_date)}` : "No latest run"} />
    </div>
  );
}

function MarathonBaselineCard({ analytics }: { analytics: RunningAnalytics }) {
  const baseline = analytics.marathon_baseline;
  const referenceTime = baseline.marathon_time_at_longest_run_pace_seconds;
  const referenceLabel = formatReferenceDuration(referenceTime);

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-green bg-green-muted p-3 text-green shadow-glow">
          <Target className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Marathon baseline</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">Reference, not prediction</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniMetric label="Gap to 42.2" value={baseline.distance_gap_to_marathon_km.toFixed(2)} unit="km" />
            <MiniMetric label="At current pace" value={referenceLabel} />
          </div>
          <p className="mt-4 text-sm leading-6 text-text-secondary">
            {referenceTime
              ? `At this pace, 42.2 km is about ${referenceLabel}. Treat this as a reference, not a race prediction.`
              : baseline.baseline_note}
          </p>
          <p className="mt-2 rounded-2xl border border-border bg-bg-elevated p-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Reference only, not a race prediction.
          </p>
        </div>
      </div>
    </Card>
  );
}

function DataConfidenceCard({ analytics, totalRuns }: { analytics: RunningAnalytics; totalRuns: number }) {
  const quality = analytics.data_quality;
  const tone = quality.confidence === "high" ? "green" : quality.confidence === "medium" ? "amber" : "red";
  const runCopy = totalRuns === 1 ? "only 1 run logged" : `${totalRuns} runs logged`;

  return (
    <Card className={tone === "green" ? "border-green/60" : tone === "amber" ? "border-amber/60" : "border-red/60"}>
      <div className="flex items-start gap-3">
        <div className={`rounded-2xl border p-3 ${tone === "green" ? "border-green bg-green-muted text-green" : tone === "amber" ? "border-amber bg-amber-muted text-amber" : "border-red bg-red-muted text-red"}`}>
          <Gauge className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Data confidence</p>
          <h2 className="mt-1 text-lg font-semibold capitalize text-text-primary">{quality.confidence} confidence</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {quality.confidence === "low" && totalRuns > 0 ? `${quality.reason} ${runCopy}.` : quality.reason}
          </p>
          <p className="mt-2 text-sm leading-6 text-text-primary">{quality.suggested_next_action}</p>
        </div>
      </div>
    </Card>
  );
}

function TrainingRhythmCard({ analytics }: { analytics: RunningAnalytics }) {
  const consistency = analytics.consistency;
  const tone = consistency.consistency_label === "Consistent" ? "green" : consistency.consistency_label === "Building consistency" ? "amber" : "indigo";
  const toneClass = tone === "green" ? "border-green bg-green-muted text-green" : tone === "amber" ? "border-amber bg-amber-muted text-amber" : "border-indigo bg-indigo-muted text-indigo";

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className={`rounded-2xl border p-3 ${toneClass}`}>
          <TrendingUp className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Training rhythm</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">{consistency.consistency_label}</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{consistency.consistency_note}</p>
          <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
            <MiniMetric label="7 days" value={String(consistency.runs_last_7_days)} />
            <MiniMetric label="30 days" value={String(consistency.runs_last_30_days)} />
            <MiniMetric label="Active weeks" value={`${consistency.active_weeks_last_8}/8`} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function WeeklyMileageChart({ points, totalRuns }: { points: RunningWeeklyTrendPoint[]; totalRuns: number }) {
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-2xl border border-green bg-green-muted p-3 text-green">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Weekly mileage</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">Last 8 weeks</h2>
        </div>
      </div>
      {totalRuns < 2 ? (
        <p className="mb-3 rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">
          Low data: this chart is ready, but one run is not enough to establish a weekly mileage trend.
        </p>
      ) : null}
      <div className="h-48 rounded-2xl border border-border bg-bg-elevated p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points}>
            <XAxis
              dataKey="week_start"
              axisLine={false}
              tickLine={false}
              tickFormatter={formatShortDate}
              tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
            />
            <YAxis hide domain={[0, "dataMax + 5"]} />
            <Tooltip content={<WeeklyTooltip />} cursor={{ fill: "var(--chart-muted)", opacity: 0.08 }} />
            <Bar dataKey="distance_km" radius={[8, 8, 4, 4]} fill="var(--chart-green)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function WeeklyTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: RunningWeeklyTrendPoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-2xl border border-border bg-bg-card p-3 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{label ? formatShortDate(label) : "Week"}</p>
      <p className="metric-number mt-1 text-sm font-bold text-text-primary">{point.distance_km.toFixed(2)} km</p>
      <p className="mt-1 text-xs text-text-secondary">{point.run_count} runs / {formatDuration(point.duration_seconds)}</p>
    </div>
  );
}

function PaceTrendCard({ points, totalRuns }: { points: RunningPaceTrendPoint[]; totalRuns: number }) {
  const usefulPoints = points.filter((point) => point.avg_pace_seconds_per_km !== null);

  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-2xl border border-indigo bg-indigo-muted p-3 text-indigo">
          <LineChartIcon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Pace trend</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">Recent runs</h2>
        </div>
      </div>
      {totalRuns < 3 || usefulPoints.length < 3 ? (
        <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">
          Import more runs to unlock pace trend.
        </div>
      ) : (
        <div className="h-48 rounded-2xl border border-border bg-bg-elevated p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={usefulPoints}>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tickFormatter={formatShortDate}
                tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
              />
              <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} reversed />
              <Tooltip content={<PaceTooltip />} cursor={{ stroke: "var(--chart-muted)", opacity: 0.2 }} />
              <Line
                type="monotone"
                dataKey="avg_pace_seconds_per_km"
                stroke="var(--chart-green)"
                strokeWidth={3}
                dot={{ r: 4, fill: "var(--chart-green)" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function LongRunProgressionCard({ runs }: { runs: RunningLongRunSummary[] }) {
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-2xl border border-green bg-green-muted p-3 text-green">
          <Target className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Long-run progression</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">Runs 10 km and longer</h2>
        </div>
      </div>
      {runs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">
          No long runs yet. Build toward a 10 km baseline before reading marathon progression.
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run, index) => (
            <div key={run.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-border bg-bg-elevated p-3 md:grid-cols-[auto_1fr_auto]">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-green bg-green-muted text-xs font-bold text-green">
                {index + 1}
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">{run.distance_km.toFixed(2)} km / {formatPace(run.avg_pace_seconds_per_km)}</p>
                <p className="mt-1 text-xs text-text-muted">{formatShortDate(run.date)} / {sourceLabels[run.source] ?? "Run"}</p>
              </div>
              <p className="metric-number self-center text-sm font-bold text-text-secondary">{formatExactDuration(run.duration_seconds)}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PaceTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: RunningPaceTrendPoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-2xl border border-border bg-bg-card p-3 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{label ? formatShortDate(label) : "Run"}</p>
      <p className="metric-number mt-1 text-sm font-bold text-text-primary">{formatPace(point.avg_pace_seconds_per_km)}</p>
      <p className="mt-1 text-xs text-text-secondary">{point.distance_km.toFixed(2)} km</p>
    </div>
  );
}

function InsightsCard({ insights }: { insights: string[] }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-amber bg-amber-muted p-3 text-amber">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Training insights</p>
          <div className="mt-3 space-y-2">
            {insights.map((insight) => (
              <p key={insight} className="rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">
                {insight}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ImportRunCard({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [source, setSource] = useState<RunningImportSource>("garmin_export");
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<RunningImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function selectFile(file: File | null) {
    setResult(null);
    setError(null);

    if (!file) {
      setSelectedFile(null);
      resetFileInput();
      return;
    }

    if (!isTcxFile(file)) {
      setSelectedFile(null);
      resetFileInput();
      setError("Only TCX files are supported in Phase 3A. GPX and FIT are coming later.");
      return;
    }

    setSelectedFile(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!uploading) setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (uploading) return;
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }

  function clearSelectedFile() {
    selectFile(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || uploading) return;

    setUploading(true);
    setResult(null);
    setError(null);

    try {
      const uploadResult = await api.runningImports.upload(selectedFile, source);
      setResult(uploadResult);
      setSelectedFile(null);
      resetFileInput();
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import run.");
    } finally {
      setUploading(false);
    }
  }

  const dropzoneTone = isDragging
    ? "border-green bg-green-muted shadow-glow"
    : selectedFile
      ? "border-green bg-green-muted/60"
      : "border-border bg-bg-elevated hover:border-green hover:bg-green-muted";

  return (
    <Card id="running-import-card" className="scroll-mt-6 overflow-hidden p-0" delay={0.02}>
      <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Import run</p>
            <h2 className="mt-1 text-lg font-semibold text-text-primary">Upload a Garmin or Strava TCX file.</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">GPX, FIT, and bulk ZIP later. Phase 3A is single-file TCX only.</p>
          </div>
          <span className="rounded-full border border-green bg-green-muted px-3 py-1 text-xs font-semibold text-green">TCX supported</span>
        </div>
      </div>

      <form className="space-y-4 p-5 md:p-6" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept=".tcx,application/vnd.garmin.tcx+xml,application/xml,text/xml"
          onChange={handleFileChange}
        />

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={handleDropzoneKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed p-5 text-center transition ${dropzoneTone}`}
        >
          <div className="rounded-2xl border border-green bg-green-muted p-3 text-green shadow-glow">
            {selectedFile ? <FileCheck2 className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
          </div>
          <p className="mt-3 text-sm font-semibold text-text-primary">
            {isDragging
              ? "Drop to attach TCX file"
              : selectedFile
                ? selectedFile.name
                : "Drop a TCX file here or click to browse"}
          </p>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {selectedFile
              ? `${formatFileSize(selectedFile.size)} / Ready to import`
              : "Drag-and-drop is the fastest path. Click-to-browse still works as a fallback."}
          </p>
        </div>

        {selectedFile ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-bg-elevated px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">{selectedFile.name}</p>
              <p className="text-xs text-text-muted">{formatFileSize(selectedFile.size)} selected</p>
            </div>
            <button
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-red hover:text-red"
              type="button"
              onClick={clearSelectedFile}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-[1fr_auto]">
          <select
            className="h-11 rounded-xl border border-border bg-bg-elevated px-3 text-sm text-text-primary outline-none transition focus:border-green focus:ring-2 focus:ring-green/20"
            value={source}
            onChange={(event) => setSource(event.target.value as RunningImportSource)}
          >
            {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Button className="h-11 rounded-2xl px-5" type="submit" disabled={!selectedFile || uploading}>
            <FileUp className="h-4 w-4" />
            {uploading ? "Importing..." : "Upload"}
          </Button>
        </div>

        {result ? <ImportResult result={result} /> : null}
        {error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-red bg-red-muted p-3 text-sm leading-6 text-red">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function ImportResult({ result }: { result: RunningImportResult }) {
  const run = result.created_run;
  const imported = result.batch.imported_count;
  const skipped = result.batch.skipped_count;
  const errors = result.batch.error_count;

  if (!run) {
    return (
      <div className="rounded-2xl border border-amber bg-amber-muted p-4 text-sm leading-6 text-amber">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{skipped > 0 ? "No new runs imported" : result.message}</p>
            <p className="text-xs text-text-secondary">Imported {imported} / skipped {skipped} / errors {errors}</p>
            {skipped > 0 ? <p className="mt-1 text-xs text-text-secondary">{skipped} duplicate skipped.</p> : null}
          </div>
        </div>
        <ImportMessages messages={result.batch.errors} />
      </div>
    );
  }

  const context = getRunContext(run);
  const metadata = run.raw_metadata ?? {};
  const calories = metadataNumber(metadata, "calories");
  const lapCount = metadataNumber(metadata, "lap_count");
  const trackpointCount = metadataNumber(metadata, "trackpoint_count");

  return (
    <div className="rounded-2xl border border-green bg-green-muted p-4 text-sm leading-6 text-green">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{context.shortLabel}</p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">{context.note}</p>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
            <MiniMetric label="Distance" value={run.distance_km.toFixed(2)} unit="km" />
            <MiniMetric label="Duration" value={formatExactDuration(run.duration_seconds)} />
            <MiniMetric label="Pace" value={formatPace(run.avg_pace_seconds_per_km)} />
            <MiniMetric label="Activity" value={formatShortDate(run.started_at)} />
            <MiniMetric label="Source" value={sourceLabels[run.source] ?? "Import"} />
            {run.avg_hr ? <MiniMetric label="Avg HR" value={Math.round(run.avg_hr).toString()} unit="bpm" /> : null}
            {run.max_hr ? <MiniMetric label="Max HR" value={Math.round(run.max_hr).toString()} unit="bpm" /> : null}
            {run.elevation_gain_m ? <MiniMetric label="Elevation" value={Math.round(run.elevation_gain_m).toString()} unit="m" /> : null}
            {calories ? <MiniMetric label="Calories" value={Math.round(calories).toString()} /> : null}
            {lapCount ? <MiniMetric label="Laps" value={Math.round(lapCount).toString()} /> : null}
            {trackpointCount ? <MiniMetric label="Trackpoints" value={Math.round(trackpointCount).toLocaleString()} /> : null}
          </div>

          <p className="mt-3 text-xs text-text-secondary">Imported {imported} / skipped {skipped} / errors {errors}</p>
          <ImportMessages messages={result.batch.errors} />
        </div>
      </div>
    </div>
  );
}

function ImportMessages({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1 text-xs text-text-secondary">
      {messages.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

function ImportHistory({ imports }: { imports: RunningImportBatch[] }) {
  const recent = imports.slice(0, 5);

  return (
    <Card delay={0.04}>
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-border bg-bg-elevated p-3 text-text-secondary">
          <History className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Import history</p>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-text-secondary">No imports yet. Upload one TCX file above to create the first import.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {recent.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-bg-elevated p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{item.original_filename}</p>
                      <p className="mt-1 text-xs text-text-muted">{sourceLabels[item.source] ?? item.source} / {formatShortDate(item.created_at)}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${importStatusClass(item)}`}>
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    Imported {item.imported_count} / skipped {item.skipped_count} / errors {item.error_count}
                  </p>
                  {item.skipped_count > 0 ? <p className="mt-1 text-xs font-semibold text-amber">Duplicate skipped</p> : null}
                  {item.errors.length > 0 ? <p className="mt-1 text-xs text-text-muted">{item.errors[0]}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function RunCard({ run, delay }: { run: RunActivity; delay: number }) {
  const context = getRunContext(run);
  const isImported = isImportedRun(run);

  return (
    <Card delay={delay}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{formatShortDate(run.started_at)}</p>
          <h2 className="mt-1 text-lg font-semibold text-text-primary">{run.title || (isImported ? context.title : run.run_type.replace("_", " "))}</h2>
          {isImported ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-green bg-green-muted px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-green">Imported TCX</span>
              <SourceBadge source={run.source} />
              <span className="text-sm font-semibold text-text-primary">{context.shortLabel}</span>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm capitalize text-text-secondary">{run.run_type.replace("_", " ")}</span>
              {run.perceived_effort ? (
                <>
                  <span className="text-text-muted">/</span>
                  <span className="text-sm text-text-secondary">effort {run.perceived_effort}/10</span>
                </>
              ) : null}
              <SourceBadge source={run.source} />
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-green bg-green-muted p-3 text-green">
          <Timer className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Metric label="Distance" value={run.distance_km.toFixed(2)} unit="km" />
        <Metric label="Duration" value={formatDuration(run.duration_seconds)} />
        <Metric label="Pace" value={formatPace(run.avg_pace_seconds_per_km)} />
        {run.avg_hr ? <Metric label="Avg HR" value={Math.round(run.avg_hr).toString()} unit="bpm" /> : null}
        {run.max_hr ? <Metric label="Max HR" value={Math.round(run.max_hr).toString()} unit="bpm" /> : null}
        {run.elevation_gain_m ? <Metric label="Elevation" value={Math.round(run.elevation_gain_m).toString()} unit="m" /> : null}
      </div>
    </Card>
  );
}

function SectionHeader({ label, description }: { label: string; description: string }) {
  return (
    <div>
      <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{label}</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${sourceBadgeClasses[source] ?? sourceBadgeClasses.other}`}>
      {sourceLabels[source] ?? "Other import"}
    </span>
  );
}

function DashboardMetric({ label, value, unit, accent = "green", subvalue }: { label: string; value: string; unit?: string; accent?: "green" | "amber" | "indigo"; subvalue?: string }) {
  const accentClass = accent === "green" ? "text-green" : accent === "amber" ? "text-amber" : "text-indigo";
  return (
    <Card className="p-4" delay={0.03}>
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className={`metric-number mt-2 text-2xl font-bold ${accentClass}`}>
        {value}{unit ? <span className="ml-1 font-sans text-xs font-normal text-text-secondary">{unit}</span> : null}
      </p>
      {subvalue ? <p className="mt-1 text-xs text-text-muted">{subvalue}</p> : null}
    </Card>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-3">
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="metric-number mt-1 text-sm font-bold text-text-primary">{value}{unit ? <span className="ml-1 font-sans text-xs font-normal text-text-secondary">{unit}</span> : null}</p>
    </div>
  );
}

function MiniMetric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-green/30 bg-bg-card/70 p-2">
      <p className="text-[0.58rem] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="metric-number mt-1 text-xs font-bold text-text-primary">{value}{unit ? <span className="ml-1 font-sans text-[0.65rem] font-normal text-text-secondary">{unit}</span> : null}</p>
    </div>
  );
}

function isTcxFile(file: File) {
  return file.name.toLowerCase().endsWith(".tcx");
}

function isImportedRun(run: Pick<RunActivity, "source" | "import_batch" | "source_activity_id">) {
  return run.source !== "manual" || run.import_batch !== null || Boolean(run.source_activity_id);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatReferenceDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (minutes === 60) {
    return `${hours + 1}:00`;
  }
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function getRunContext(run: Pick<RunLike, "distance_km">) {
  if (run.distance_km >= 21) {
    return {
      title: "Half-marathon distance",
      shortLabel: "Half-marathon benchmark",
      note: "Use this as a long-run benchmark for your marathon build.",
    };
  }

  if (run.distance_km >= 18) {
    return {
      title: "Long run benchmark",
      shortLabel: "Long-run benchmark",
      note: "This is a meaningful aerobic endurance session.",
    };
  }

  if (run.distance_km >= 10) {
    return {
      title: "Endurance run",
      shortLabel: "Endurance baseline",
      note: "A solid aerobic session for your running base.",
    };
  }

  return {
    title: "Imported run",
    shortLabel: "Imported run",
    note: "This run is now part of your training history.",
  };
}

function metadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function importStatusClass(item: RunningImportBatch) {
  if (item.error_count > 0 || item.status === "failed") return "border-red bg-red-muted text-red";
  if (item.skipped_count > 0 && item.imported_count === 0) return "border-amber bg-amber-muted text-amber";
  if (item.status === "completed") return "border-green bg-green-muted text-green";
  return "border-border bg-bg-card text-text-secondary";
}
