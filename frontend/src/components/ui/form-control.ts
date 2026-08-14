import { cn } from "@/lib/utils";

export const formControlClassName =
  "w-full rounded-xl border border-border bg-bg-elevated px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-green focus:ring-2 focus:ring-green/20 disabled:cursor-not-allowed disabled:opacity-60";

export const selectClassName = cn(formControlClassName, "h-11");
export const textareaClassName = cn(formControlClassName, "min-h-28 resize-y leading-6");
