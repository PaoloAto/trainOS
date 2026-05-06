import { Dumbbell } from "lucide-react";
import { useEffect, useState } from "react";

import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { api, type GymSession } from "@/lib/api";
import { formatShortDate } from "@/lib/format";

export function GymPage() {
  const [sessions, setSessions] = useState<GymSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.gymSessions.list();
        if (active) setSessions(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load gym sessions.");
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
        eyebrow="Gym"
        title="Strength Log"
        description="Recent split sessions with set counts and exercise names."
      />
      <section className="mt-7 space-y-4 md:mt-8 md:space-y-5">
        {loading ? <StateCard message="Loading gym sessions..." /> : null}
        {error ? <StateCard message={error} tone="error" /> : null}
        {!loading && !error && sessions.length === 0 ? <StateCard message="No gym sessions yet. Create an exercise and log a set from Home." /> : null}
        {sessions.map((session, index) => (
          <Card key={session.id} delay={index * 0.04}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{formatShortDate(session.date)}</p>
                <h2 className="mt-1 text-lg font-semibold capitalize text-text-primary">{session.split_type.replace("_", " ")}</h2>
                <p className="mt-1 text-sm text-text-secondary">{session.exercise_names.join(", ") || "No exercises"}</p>
              </div>
              <div className="rounded-2xl border border-amber bg-amber-muted p-3 text-amber">
                <Dumbbell className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-bg-elevated p-3">
              <span className="text-sm text-text-secondary">Sets logged</span>
              <span className="metric-number text-xl font-bold text-amber">{session.set_count}</span>
            </div>
          </Card>
        ))}
      </section>
    </>
  );
}

function StateCard({ message, tone = "default" }: { message: string; tone?: "default" | "error" }) {
  return <Card className={tone === "error" ? "border-red bg-red-muted text-red" : "text-text-secondary"}>{message}</Card>;
}
