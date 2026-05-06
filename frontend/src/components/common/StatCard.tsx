import { cn } from "@/lib/utils";

import { Card } from "./Card";

type StatCardProps = {
  label: string;
  value: string;
  unit?: string;
  accent?: "green" | "amber" | "indigo" | "red";
};

const accentClasses: Record<NonNullable<StatCardProps["accent"]>, string> = {
  green: "text-green",
  amber: "text-amber",
  indigo: "text-indigo",
  red: "text-red",
};

export function StatCard({ label, value, unit, accent = "green" }: StatCardProps) {
  return (
    <Card className="rounded-2xl bg-bg-elevated p-4 shadow-none">
      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-text-muted">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn("metric-number text-2xl font-bold", accentClasses[accent])}>
          {value}
        </span>
        {unit ? <span className="text-xs text-text-secondary">{unit}</span> : null}
      </div>
    </Card>
  );
}
