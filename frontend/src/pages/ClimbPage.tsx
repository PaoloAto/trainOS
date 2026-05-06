import { FolderPlus, Mountain } from "lucide-react";
import { useEffect, useState } from "react";

import { QuickLogSheet } from "@/components/app/QuickLogSheet";
import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { api, type ClimbingProject, type ClimbingSession } from "@/lib/api";
import { formatShortDate } from "@/lib/format";

export function ClimbPage() {
  const [sessions, setSessions] = useState<ClimbingSession[]>([]);
  const [projects, setProjects] = useState<ClimbingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [sessionData, projectData] = await Promise.all([
          api.climbingSessions.list(),
          api.climbingProjects.list(),
        ]);
        if (!active) return;
        setSessions(sessionData);
        setProjects(projectData);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load climbing data.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [refreshKey]);

  const activeProjects = projects.filter((project) => project.status === "active");

  return (
    <>
      <PageHeader
        eyebrow="Climbing"
        title="Climb Log"
        description="Bouldering and top-rope sessions are both supported from the start."
      />
      <div className="mt-6 md:mt-7">
        <Button className="h-12 w-full rounded-2xl md:max-w-sm" variant="secondary" onClick={() => setProjectSheetOpen(true)}>
          <FolderPlus className="h-4 w-4" />
          Create climbing project
        </Button>
      </div>

      <section className="mt-7 space-y-4 md:mt-8 md:space-y-5">
        <SectionTitle label="Active Projects" />
        {activeProjects.length === 0 ? <StateCard message="No active projects yet." /> : null}
        {activeProjects.map((project, index) => (
          <Card key={project.id} delay={index * 0.04} className="border-indigo/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{project.session_type.replace("_", " ") || "project"}</p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">{project.name}</h2>
                <p className="mt-1 text-sm text-text-secondary">{project.grade} - {project.location || "No location"}</p>
              </div>
              <span className="rounded-full border border-indigo bg-indigo-muted px-3 py-1 text-xs font-semibold text-indigo">{project.status}</span>
            </div>
          </Card>
        ))}
      </section>

      <section className="mt-7 space-y-4 md:mt-8 md:space-y-5">
        <SectionTitle label="Recent Sessions" />
        {loading ? <StateCard message="Loading climbing sessions..." /> : null}
        {error ? <StateCard message={error} tone="error" /> : null}
        {!loading && !error && sessions.length === 0 ? <StateCard message="No climbing sessions yet. Use Quick Log from Home to add bouldering or top rope." /> : null}
        {sessions.map((session, index) => (
          <Card key={session.id} delay={index * 0.04}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{formatShortDate(session.date)}</p>
                <h2 className="mt-1 text-lg font-semibold capitalize text-text-primary">{session.session_type.replace("_", " ")}</h2>
                <p className="mt-1 text-sm text-text-secondary">{session.location || "No location"}</p>
              </div>
              <div className="rounded-2xl border border-indigo bg-indigo-muted p-3 text-indigo">
                <Mountain className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-bg-elevated p-3 text-sm text-text-secondary">
              {session.summary.length > 0 ? session.summary.join(" - ") : `${session.attempt_count} attempts logged`}
            </div>
          </Card>
        ))}
      </section>

      <QuickLogSheet
        open={projectSheetOpen}
        onOpenChange={setProjectSheetOpen}
        initialMode="project"
        onSaved={() => setRefreshKey((value) => value + 1)}
      />
    </>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{label}</p>;
}

function StateCard({ message, tone = "default" }: { message: string; tone?: "default" | "error" }) {
  return <Card className={tone === "error" ? "border-red bg-red-muted text-red" : "text-text-secondary"}>{message}</Card>;
}
