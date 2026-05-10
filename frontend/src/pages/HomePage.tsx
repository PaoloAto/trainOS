import { BrainCircuit, ClipboardCheck, Dumbbell, Mountain, Plus, Timer } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis } from "recharts";

import { QuickLogSheet, type QuickLogMode } from "@/components/app/QuickLogSheet";
import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { QuickActionButton } from "@/components/common/QuickActionButton";
import { StatCard } from "@/components/common/StatCard";
import { RingScore } from "@/components/metrics/RingScore";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/api";

type HomePageProps = {
  user: User | null;
};

const weeklyData = [
  { day: "M", load: 42 },
  { day: "T", load: 24 },
  { day: "W", load: 56 },
  { day: "T", load: 18 },
  { day: "F", load: 64 },
  { day: "S", load: 36 },
  { day: "S", load: 48 },
];

export function HomePage({ user }: HomePageProps) {
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogMode, setQuickLogMode] = useState<QuickLogMode>("menu");

  function openQuickLog(mode: QuickLogMode) {
    setQuickLogMode(mode);
    setQuickLogOpen(true);
  }

  return (
    <>
      <PageHeader
        title={user ? `Ready, ${user.username}` : "TrainOS Command"}
        description="Quick-log the minimum useful data for running, lifting, climbing, and daily readiness."
      />

      <section className="mt-7 space-y-5 md:mt-8 md:space-y-6">
        <Card className="overflow-hidden p-0 shadow-glow" delay={0.02}>
          <div className="border-b border-border bg-bg-elevated/60 px-5 py-4">
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">
              Readiness
            </p>
          </div>
          <div className="px-5 pb-6 pt-4 text-center">
            <RingScore score={81} label="Ready" />
            <p className="mt-1 text-sm font-medium text-green">Manual data capture is live.</p>
            <p className="mt-1 text-xs text-text-muted">Score remains a placeholder until analytics arrive.</p>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <StatCard label="Run" value="0" unit="km" accent="green" />
          <StatCard label="Lift" value="0" unit="sets" accent="amber" />
          <StatCard label="Climb" value="0" unit="tries" accent="indigo" />
        </div>

        <Card delay={0.08}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">
                Weekly Training Snapshot
              </p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">MVP training pulse</h2>
            </div>
            <span className="rounded-full border border-green bg-green-muted px-3 py-1 text-xs font-semibold text-green">
              MVP
            </span>
          </div>
          <div className="h-36 rounded-2xl border border-border bg-bg-elevated p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
                />
                <Bar dataKey="load" radius={[8, 8, 4, 4]} fill="var(--chart-green)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card delay={0.14} className="p-5 md:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Quick Log</p>
              <h2 className="mt-1 text-xl font-semibold text-text-primary">Capture the useful minimum</h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">Four fast paths, tuned for one-handed logging.</p>
            </div>
            <Button className="shrink-0 rounded-full" size="icon" onClick={() => openQuickLog("menu")} aria-label="Open quick log menu">
              <Plus className="h-5 w-5" />
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
              onClick={() => openQuickLog("check-in")}
            />
            <QuickActionButton
              icon={Timer}
              label="Run"
              hint="distance / pace / effort"
              accent="green"
              onClick={() => openQuickLog("run")}
            />
            <QuickActionButton
              icon={Dumbbell}
              label="Gym"
              hint="split / sets / weight"
              accent="amber"
              onClick={() => openQuickLog("gym")}
            />
            <QuickActionButton
              icon={Mountain}
              label="Climb"
              hint="grade / result / style"
              accent="indigo"
              onClick={() => openQuickLog("climb")}
            />
          </div>
        </Card>

        <Card delay={0.2} className="border-indigo/60 bg-bg-card">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-indigo bg-indigo-muted p-3 text-indigo shadow-indigo">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">AI Daily Brief</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">Reserved for Phase 7</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                No AI calls are implemented yet. This card only preserves the future daily brief slot.
              </p>
            </div>
          </div>
        </Card>
      </section>

      <QuickLogSheet open={quickLogOpen} onOpenChange={setQuickLogOpen} initialMode={quickLogMode} />
    </>
  );
}
