import { isAfter, isEqual, parseISO, startOfWeek } from "date-fns";
import { Activity, ClipboardCheck, Dumbbell, Mountain, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { api, type ClimbingSession, type DailyCheckIn, type GymSession, type RunActivity } from "@/lib/api";

type ReviewData = {
  checkIns: DailyCheckIn[];
  runs: RunActivity[];
  gymSessions: GymSession[];
  climbingSessions: ClimbingSession[];
};

export function ReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [checkIns, runs, gymSessions, climbingSessions] = await Promise.all([
          api.checkIns.list(),
          api.runs.list(),
          api.gymSessions.list(),
          api.climbingSessions.list(),
        ]);
        if (active) setData({ checkIns, runs, gymSessions, climbingSessions });
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load review.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const inCurrentWeek = (value: string) => {
      const date = parseISO(value);
      return isAfter(date, weekStart) || isEqual(date, weekStart);
    };

    return {
      checkIns: data?.checkIns.filter((item) => inCurrentWeek(item.date)).length ?? 0,
      runs: data?.runs.filter((item) => inCurrentWeek(item.started_at)).length ?? 0,
      gym: data?.gymSessions.filter((item) => inCurrentWeek(item.date)).length ?? 0,
      climb: data?.climbingSessions.filter((item) => inCurrentWeek(item.date)).length ?? 0,
    };
  }, [data]);
  const weeklyTotal = counts.checkIns + counts.runs + counts.gym + counts.climb;

  return (
    <>
      <PageHeader
        eyebrow="Review"
        title="Weekly Counts"
        description="Simple volume checks only. Advanced analytics come later."
      />
      <section className="mt-7 space-y-5 md:mt-8 md:space-y-6">
        {loading ? <Card className="text-text-secondary">Loading weekly counts...</Card> : null}
        {error ? <Card className="border-red bg-red-muted text-red">{error}</Card> : null}
        {!loading && !error ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <StatCard label="Check-ins" value={String(counts.checkIns)} accent="green" />
              <StatCard label="Runs" value={String(counts.runs)} accent="green" />
              <StatCard label="Gym" value={String(counts.gym)} accent="amber" />
              <StatCard label="Climb" value={String(counts.climb)} accent="indigo" />
            </div>
            <Card>
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-border bg-bg-elevated p-3 text-text-secondary">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">This Week</p>
                  <h2 className="mt-1 text-lg font-semibold text-text-primary">Training records only</h2>
                  {weeklyTotal === 0 ? (
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      No records for this week yet. Use Quick Log from Home to capture the first check-in or session.
                    </p>
                  ) : null}
                  <div className="mt-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                    <MiniCount icon={ClipboardCheck} label="Check" value={counts.checkIns} />
                    <MiniCount icon={Timer} label="Run" value={counts.runs} />
                    <MiniCount icon={Dumbbell} label="Gym" value={counts.gym} />
                    <MiniCount icon={Mountain} label="Climb" value={counts.climb} />
                  </div>
                </div>
              </div>
            </Card>
          </>
        ) : null}
      </section>
    </>
  );
}

function MiniCount({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-2">
      <Icon className="mx-auto h-4 w-4 text-text-secondary" />
      <p className="metric-number mt-1 text-lg font-bold text-text-primary">{value}</p>
      <p className="text-[0.6rem] uppercase tracking-[0.14em] text-text-muted">{label}</p>
    </div>
  );
}
