import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: "green" | "amber" | "indigo" | "red";
};

const accentClasses: Record<PlaceholderPageProps["accent"], string> = {
  green: "border-green bg-green-muted text-green shadow-glow",
  amber: "border-amber bg-amber-muted text-amber shadow-amber",
  indigo: "border-indigo bg-indigo-muted text-indigo shadow-indigo",
  red: "border-red bg-red-muted text-red",
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  icon: Icon,
  accent,
}: PlaceholderPageProps) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <Card className="mt-6">
        <div className="flex items-start gap-4">
          <div className={`rounded-3xl border p-4 ${accentClasses[accent]}`}>
            <Icon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Phase 1 Placeholder</p>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">No training records yet</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              This route exists so navigation, layout, and visual hierarchy are stable before domain models and logging flows are added.
            </p>
          </div>
        </div>
        <Button className="mt-6 w-full" variant="secondary" disabled>
          Logging arrives in a later phase
        </Button>
      </Card>
    </>
  );
}
