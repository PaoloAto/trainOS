import { ChevronUp, Plus } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OptionalNotesFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  collapsedLabel?: string;
  defaultOpen?: boolean;
  accent?: "green" | "amber" | "indigo";
  className?: string;
};

const textareaClass = "min-h-24 w-full resize-none rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm leading-6 text-text-primary outline-none transition placeholder:text-text-muted";
const accentClasses = {
  green: {
    collapsed: "hover:border-green hover:text-green",
    focus: "focus:border-green focus:ring-2 focus:ring-green/20",
  },
  amber: {
    collapsed: "hover:border-amber hover:text-amber",
    focus: "focus:border-amber focus:ring-2 focus:ring-amber/20",
  },
  indigo: {
    collapsed: "hover:border-indigo hover:text-indigo",
    focus: "focus:border-indigo focus:ring-2 focus:ring-indigo/20",
  },
};

export function OptionalNotesField({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  collapsedLabel = "+ Add optional notes",
  defaultOpen,
  accent = "amber",
  className,
}: OptionalNotesFieldProps) {
  const [open, setOpen] = useState(defaultOpen ?? value.trim().length > 0);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    event.stopPropagation();
  }

  if (!open) {
    return (
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-bg-elevated px-4 py-3 text-left text-sm font-semibold text-text-secondary transition",
          accentClasses[accent].collapsed,
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {collapsedLabel}
        </span>
      </button>
    );
  }

  return (
    <div className={cn("rounded-3xl border border-border bg-bg-base/40 p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">{label}</label>
        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-xl px-2 text-xs" onClick={() => setOpen(false)}>
          <ChevronUp className="h-3.5 w-3.5" />
          Hide notes
        </Button>
      </div>
      <textarea
        className={cn(textareaClass, accentClasses[accent].focus)}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {helperText ? <p className="mt-2 text-xs leading-5 text-text-muted">{helperText}</p> : null}
    </div>
  );
}
