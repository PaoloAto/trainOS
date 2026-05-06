import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QuickActionButtonProps = {
  icon: LucideIcon;
  label: string;
  hint?: string;
  accent?: "green" | "amber" | "indigo" | "red";
  onClick?: () => void;
};

const tileClasses: Record<NonNullable<QuickActionButtonProps["accent"]>, string> = {
  green: "border-green/70 bg-green-muted text-green hover:border-green hover:bg-green/20",
  amber: "border-amber/70 bg-amber-muted text-amber hover:border-amber hover:bg-amber/20",
  indigo: "border-indigo/70 bg-indigo-muted text-indigo hover:border-indigo hover:bg-indigo/20",
  red: "border-red/70 bg-red-muted text-red hover:border-red hover:bg-red/20",
};

const chipClasses: Record<NonNullable<QuickActionButtonProps["accent"]>, string> = {
  green: "border-green bg-green-muted text-green shadow-glow",
  amber: "border-amber bg-amber-muted text-amber shadow-amber",
  indigo: "border-indigo bg-indigo-muted text-indigo shadow-indigo",
  red: "border-red bg-red-muted text-red",
};

export function QuickActionButton({
  icon: Icon,
  label,
  hint,
  accent = "green",
  onClick,
}: QuickActionButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      className={cn(
        "group h-full min-h-28 items-start justify-start whitespace-normal rounded-2xl px-4 py-4 text-left transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]",
        tileClasses[accent],
      )}
      onClick={onClick}
    >
      <span className="flex w-full flex-col items-start gap-3">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl border", chipClasses[accent])}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="space-y-1">
          <span className="block text-sm font-bold uppercase tracking-[0.14em] text-text-primary group-hover:text-current">
            {label}
          </span>
          {hint ? <span className="block text-xs font-medium normal-case tracking-normal text-text-secondary">{hint}</span> : null}
        </span>
      </span>
    </Button>
  );
}
