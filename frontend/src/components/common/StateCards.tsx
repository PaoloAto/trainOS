import type { LucideIcon } from "lucide-react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/common/Card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StateAccent = "green" | "amber" | "indigo" | "neutral";

const accentStyles: Record<StateAccent, { icon: string; action: string; border: string }> = {
  green: {
    icon: "border-green bg-green-muted text-green",
    action: "border-green bg-green-muted text-green hover:bg-green/20",
    border: "border-green/40",
  },
  amber: {
    icon: "border-amber bg-amber-muted text-amber",
    action: "border-amber bg-amber-muted text-amber hover:bg-amber/20",
    border: "border-amber/40",
  },
  indigo: {
    icon: "border-indigo bg-indigo-muted text-indigo",
    action: "border-indigo bg-indigo-muted text-indigo hover:bg-indigo/20",
    border: "border-indigo/40",
  },
  neutral: {
    icon: "border-border bg-bg-elevated text-text-secondary",
    action: "border-border bg-bg-elevated text-text-primary hover:bg-bg-card",
    border: "border-border",
  },
};

export function LoadingStateCard({ message = "Loading...", accent = "neutral", className }: { message?: string; accent?: StateAccent; className?: string }) {
  return (
    <Card className={cn("flex items-center gap-3 text-sm text-text-secondary", accentStyles[accent].border, className)}>
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl border", accentStyles[accent].icon)}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
      {message}
    </Card>
  );
}

export function ErrorStateCard({ title = "Something went wrong", message, className }: { title?: string; message: string; className?: string }) {
  return (
    <Card className={cn("border-red bg-red-muted text-red", className)}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6">{message}</p>
        </div>
      </div>
    </Card>
  );
}

export function EmptyActionCard({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
  accent = "neutral",
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  accent?: StateAccent;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn(accentStyles[accent].border, className)}>
      {Icon ? (
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl border", accentStyles[accent].icon)}>
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <h2 className={cn("text-lg font-semibold text-text-primary", Icon ? "mt-4" : "")}>{title}</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{message}</p>
      {children ? <div className="mt-4">{children}</div> : null}
      {actionLabel && onAction ? (
        <Button type="button" className={cn("mt-4 w-full sm:w-auto", accentStyles[accent].action)} onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}

export function LowDataCard({ title, message, accent = "neutral", className }: { title: string; message: string; accent?: StateAccent; className?: string }) {
  return (
    <Card className={cn(accentStyles[accent].border, className)}>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{message}</p>
    </Card>
  );
}
