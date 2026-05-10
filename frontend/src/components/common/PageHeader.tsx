import { format } from "date-fns";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  accent?: "green" | "amber" | "indigo";
  className?: string;
};

const accentClasses = {
  green: "border-green bg-green-muted text-green shadow-glow",
  amber: "border-amber bg-amber-muted text-amber shadow-amber",
  indigo: "border-indigo bg-indigo-muted text-indigo shadow-indigo",
};

export function PageHeader({ eyebrow, title, description, accent = "green", className }: PageHeaderProps) {
  return (
    <header className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[0.68rem] uppercase tracking-[0.22em] text-text-muted">
            {eyebrow ?? format(new Date(), "EEEE, MMM d")}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
            {title}
          </h1>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold", accentClasses[accent])}>
          T
        </div>
      </div>
      {description ? <p className="text-sm leading-6 text-text-secondary">{description}</p> : null}
    </header>
  );
}
