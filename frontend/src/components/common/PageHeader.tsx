import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  accent?: "green" | "amber" | "indigo";
  icon?: LucideIcon;
  className?: string;
};

const accentClasses = {
  green: "border-green/50 bg-green-muted text-green",
  amber: "border-amber/50 bg-amber-muted text-amber",
  indigo: "border-indigo/50 bg-indigo-muted text-indigo",
};

export function PageHeader({ eyebrow, title, description, accent = "green", icon: Icon, className }: PageHeaderProps) {
  return (
    <header className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="telemetry-label">
            {eyebrow ?? format(new Date(), "EEEE, MMM d")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
            {title}
          </h1>
        </div>
        {Icon ? <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", accentClasses[accent])}><Icon className="h-5 w-5" /></div> : null}
      </div>
      {description ? <p className="text-sm leading-6 text-text-secondary">{description}</p> : null}
    </header>
  );
}
