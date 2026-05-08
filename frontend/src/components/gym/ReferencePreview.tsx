import { ExternalLink, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ExerciseReference } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  displayDomain,
  externalReferenceLabel,
  getYouTubePreview,
  referenceKindLabel,
  sourceBadgeClasses,
} from "@/lib/video";

type ReferencePreviewProps = {
  reference: ExerciseReference;
  variant?: "feature" | "strip" | "mobile";
  selected?: boolean;
  showControls?: boolean;
  onSelect?: () => void;
  onPreview?: () => void;
  onEdit?: () => void;
  onDelete?: () => Promise<void> | void;
  className?: string;
};

export function ReferencePreview({
  reference,
  variant = "feature",
  selected = false,
  showControls = true,
  onSelect,
  onPreview,
  onEdit,
  onDelete,
  className,
}: ReferencePreviewProps) {
  const [deleting, setDeleting] = useState(false);
  const youtubePreview = getYouTubePreview(reference.url);
  const canPreview = reference.source === "youtube" && youtubePreview !== null;
  const title = reference.title || displayDomain(reference.url);
  const kindLabel = canPreview ? referenceKindLabel(reference.url) : externalReferenceLabel(reference.source);

  async function handleDelete() {
    if (!onDelete) return;
    const confirmed = window.confirm("Delete this reference link?");
    if (!confirmed) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  if (variant === "strip") {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "min-w-44 rounded-2xl border bg-bg-elevated p-3 text-left transition hover:border-amber/70",
          selected ? "border-amber shadow-amber" : "border-border",
          className,
        )}
      >
        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em]", sourceBadgeClasses[reference.source])}>
          {kindLabel}
        </span>
        <p className="mt-2 line-clamp-1 text-sm font-semibold text-text-primary">{title}</p>
        <p className="mt-1 text-xs text-text-muted">{canPreview ? "Preview inside TrainOS" : "Open externally"}</p>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-3xl border bg-bg-elevated p-4 transition",
        selected ? "border-amber shadow-amber" : "border-border",
        variant === "mobile" ? "min-w-[18rem]" : "",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em]", sourceBadgeClasses[reference.source])}>
            {kindLabel}
          </span>
          <h3 className="mt-3 line-clamp-2 text-base font-semibold text-text-primary">{title}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-text-muted">
            {canPreview ? "Preview inside TrainOS" : "Open externally to view this cue"}
          </p>
        </div>
        {canPreview ? (
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-green bg-green-muted text-green", youtubePreview.isShort ? "aspect-[9/16] h-16" : "")}>
            <Play className="h-5 w-5 fill-current" />
          </div>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber bg-amber-muted text-amber">
            <ExternalLink className="h-5 w-5" />
          </div>
        )}
      </div>

      {reference.notes ? <p className="mt-3 text-sm leading-6 text-text-secondary">{reference.notes}</p> : null}
      {!canPreview ? (
        <p className="mt-3 rounded-2xl border border-border bg-bg-card p-3 text-xs leading-5 text-text-muted">
          {reference.source === "youtube"
            ? "Open externally to view this cue. This YouTube URL cannot be embedded."
            : "Preview opens externally for this source. Open this cue in the source app or website."}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canPreview && onPreview ? (
          <Button type="button" variant="secondary" size="sm" className="rounded-xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={onPreview}>
            <Play className="h-3.5 w-3.5" />
            Preview
          </Button>
        ) : null}
        <Button
          asChild
          variant="secondary"
          size="sm"
          className={cn("rounded-xl", !canPreview ? "min-w-28 border-amber bg-amber-muted text-amber hover:bg-amber/20" : "")}
        >
          <a href={reference.url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        </Button>
        {showControls && (onEdit || onDelete) ? (
          <div className="ml-auto flex gap-1">
            {onEdit ? (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-text-muted hover:text-text-primary" onClick={onEdit} title="Edit reference">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {onDelete ? (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-red hover:bg-red-muted hover:text-red" onClick={handleDelete} disabled={deleting} title="Delete reference">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
