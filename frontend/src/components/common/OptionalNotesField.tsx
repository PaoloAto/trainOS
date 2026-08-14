import { ChevronUp, Plus } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { textareaClassName } from "@/components/ui/form-control";
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

const accentClasses = {
  green: {
    collapsed: "hover:border-green hover:text-green",
  },
  amber: {
    collapsed: "hover:border-amber hover:text-amber",
  },
  indigo: {
    collapsed: "hover:border-indigo hover:text-indigo",
  },
};

export function OptionalNotesField({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  collapsedLabel = "+ Add notes",
  defaultOpen,
  accent = "amber",
  className,
}: OptionalNotesFieldProps) {
  const [open, setOpen] = useState(defaultOpen ?? value.trim().length > 0);
  const notesId = useId();
  const helperId = `${notesId}-helper`;

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
          "flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-bg-elevated px-4 py-3 text-left text-sm font-medium text-text-secondary transition",
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
    <div className={cn("border-t border-border pt-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={notesId} className="text-sm font-medium text-text-secondary">{label} <span className="text-text-muted">Optional</span></label>
        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-xl px-2 text-xs" onClick={() => setOpen(false)}>
          <ChevronUp className="h-3.5 w-3.5" />
          Hide notes
        </Button>
      </div>
      <textarea
        id={notesId}
        aria-describedby={helperText ? helperId : undefined}
        className={textareaClassName(accent)}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {helperText ? <p id={helperId} className="mt-2 text-xs leading-5 text-text-muted">{helperText}</p> : null}
    </div>
  );
}
