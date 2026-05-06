import { Timer } from "lucide-react";
import { useEffect, useState } from "react";

import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { api, type RunActivity } from "@/lib/api";
import { formatDuration, formatPace, formatShortDate } from "@/lib/format";

export function RunPage() {
  const [runs, setRuns] = useState<RunActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.runs.list();
        if (active) setRuns(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load runs.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Running"
        title="Run Log"
        description="Manual runs are stored now. Strava import waits for a later phase."
      />
      <section className="mt-7 space-y-4 md:mt-8 md:space-y-5">
        {loading ? <StateCard message="Loading runs..." /> : null}
        {error ? <StateCard message={error} tone="error" /> : null}
        {!loading && !error && runs.length === 0 ? <StateCard message="No runs logged yet. Use Quick Log from Home to add one." /> : null}
        {runs.map((run, index) => (
          <Card key={run.id} delay={index * 0.04}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{formatShortDate(run.started_at)}</p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">{run.title || run.run_type.replace("_", " ")}</h2>
                <p className="mt-1 text-sm text-text-secondary">{run.run_type.replace("_", " ")} - effort {run.perceived_effort ?? "--"}/10</p>
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
