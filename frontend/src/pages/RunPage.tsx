import { AlertCircle, CheckCircle2, FileUp, History, Timer, UploadCloud } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { api, type RunActivity, type RunningImportBatch, type RunningImportResult, type RunningImportSource } from "@/lib/api";
import { formatDuration, formatPace, formatShortDate } from "@/lib/format";

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

export function RunPage() {
  const [runs, setRuns] = useState<RunActivity[]>([]);
  const [imports, setImports] = useState<RunningImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [runData, importData] = await Promise.all([
          api.runs.list(),
          api.runningImports.list(),
        ]);
        if (!active) return;
        setRuns(runData);
        setImports(importData);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load running data.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [refreshKey]);

  return (
    <>
      <PageHeader
        eyebrow="Running"
        title="Run Log"
        description="Manual logging stays live. Phase 3A adds single-file TCX import only."
      />
      <section className="mt-7 space-y-4 md:mt-8 md:space-y-5">
        <ImportRunCard onImported={() => setRefreshKey((value) => value + 1)} />
        <ImportHistory imports={imports} />

        {loading ? <StateCard message="Loading runs..." /> : null}
        {error ? <StateCard message={error} tone="error" /> : null}
        {!loading && !error && runs.length === 0 ? <StateCard message="No runs logged yet. Use Quick Log from Home or import a TCX file." /> : null}
        {runs.map((run, index) => (
          <Card key={run.id} delay={index * 0.04}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{formatShortDate(run.started_at)}</p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">{run.title || run.run_type.replace("_", " ")}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm capitalize text-text-secondary">{run.run_type.replace("_", " ")}</span>
                  <span className="text-text-muted">/</span>
                  <span className="text-sm text-text-secondary">effort {run.perceived_effort ?? "--"}/10</span>
                  <SourceBadge source={run.source} />
                </div>
              </div>
              <div className="rounded-2xl border border-green bg-green-muted p-3 text-green">
                <Timer className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 md:gap-4">
              <Metric label="Distance" value={run.distance_km.toFixed(2)} unit="km" />
              <Metric label="Duration" value={formatDuration(run.duration_seconds)} />
              <Metric label="Pace" value={formatPace(run.avg_pace_seconds_per_km)} />
            </div>
          </Card>
        ))}
      </section>
    </>
  );
}

function ImportRunCard({ onImported }: { onImported: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [source, setSource] = useState<RunningImportSource>("garmin_export");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<RunningImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setResult(null);
    setError(null);
    try {
      const uploadResult = await api.runningImports.upload(selectedFile, source);
      setResult(uploadResult);
      setSelectedFile(null);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import run.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="overflow-hidden p-0" delay={0.02}>
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
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-bg-elevated p-5 text-center transition hover:border-green hover:bg-green-muted">
          <input className="sr-only" type="file" accept=".tcx,application/vnd.garmin.tcx+xml,application/xml,text/xml" onChange={handleFileChange} />
          <div className="rounded-2xl border border-green bg-green-muted p-3 text-green shadow-glow">
            <UploadCloud className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-text-primary">{selectedFile ? selectedFile.name : "Choose a TCX file"}</p>
          <p className="mt-1 text-xs leading-5 text-text-muted">Garmin and Strava TCX exports are supported. Trackpoints are parsed but not stored yet.</p>
        </label>

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
  const message = run
    ? `Imported ${imported} run - ${run.distance_km.toFixed(2)} km - ${formatDuration(run.duration_seconds)}`
    : skipped > 0
      ? `No new runs imported. ${skipped} duplicate skipped.`
      : result.message;

  return (
    <div className="rounded-2xl border border-green bg-green-muted p-3 text-sm leading-6 text-green">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">{message}</p>
          <p className="text-xs text-text-secondary">Imported {imported} / skipped {skipped} / errors {errors}</p>
        </div>
      </div>
      {result.batch.errors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-text-secondary">
          {result.batch.errors.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
    </div>
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
            <p className="mt-2 text-sm leading-6 text-text-secondary">No imports yet. Upload one TCX file above to create the first batch.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {recent.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-bg-elevated p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">{item.original_filename}</p>
                      <p className="mt-1 text-xs text-text-muted">{sourceLabels[item.source] ?? item.source} / {formatShortDate(item.created_at)}</p>
                    </div>
                    <span className="rounded-full border border-border bg-bg-card px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-text-secondary">
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    Imported {item.imported_count} / skipped {item.skipped_count} / errors {item.error_count}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] ${sourceBadgeClasses[source] ?? sourceBadgeClasses.other}`}>
      {sourceLabels[source] ?? "Other import"}
    </span>
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

function StateCard({ message, tone = "default" }: { message: string; tone?: "default" | "error" }) {
  return <Card className={tone === "error" ? "border-red bg-red-muted text-red" : "text-text-secondary"}>{message}</Card>;
}
