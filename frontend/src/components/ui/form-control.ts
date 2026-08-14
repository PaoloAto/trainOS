import { cn } from "@/lib/utils";

export type FormControlAccent = "green" | "amber" | "indigo";

const baseClassName =
  "w-full rounded-xl border border-border bg-bg-elevated px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-60";

const focusClassName: Record<FormControlAccent, string> = {
  green: "focus:border-green focus:ring-2 focus:ring-green/20",
  amber: "focus:border-amber focus:ring-2 focus:ring-amber/20",
  indigo: "focus:border-indigo focus:ring-2 focus:ring-indigo/20",
};

export function formControlClassName(accent: FormControlAccent = "green") {
  return cn(baseClassName, focusClassName[accent]);
}

export function selectClassName(accent: FormControlAccent = "green") {
  return cn("h-11", formControlClassName(accent));
}

export function textareaClassName(accent: FormControlAccent = "green") {
  return cn("min-h-28 resize-y leading-6", formControlClassName(accent));
}
