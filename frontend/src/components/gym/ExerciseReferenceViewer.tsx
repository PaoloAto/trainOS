import { ExternalLink, Library, ListVideo, Pencil, Plus, Target, Video } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/common/Card";
import { OptionalNotesField } from "@/components/common/OptionalNotesField";
import { ReferencePreview } from "@/components/gym/ReferencePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClassName } from "@/components/ui/form-control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  api,
  type Exercise,
  type ExerciseReference,
  type ExerciseReferenceInput,
  type ExerciseReferenceSource,
} from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  detectReferenceSource,
  getYouTubePreview,
  referenceKindLabel,
  sourceLabels,
} from "@/lib/video";

type ExerciseReferenceViewerProps = {
  exercises: Exercise[];
  onChanged: () => void;
  onLogSet: (exerciseId?: number) => void;
  onOpenExercise?: (exerciseId: number) => void;
  onCreateExercise?: () => void;
  onUseInRoutine?: (exercise: Exercise) => void;
};

type ReferenceEditorState = {
  exercise: Exercise;
  reference: ExerciseReference | null;
} | null;

const sourceOptions = Object.entries(sourceLabels) as Array<[ExerciseReferenceSource, string]>;
const upperBodyMuscles = ["Back", "Biceps", "Chest", "Forearms", "Shoulders", "Triceps"];
const lowerBodyMuscles = ["Calves", "Glutes", "Hamstrings", "Quads"];
const allMuscles = [...upperBodyMuscles, ...lowerBodyMuscles, "Core", "Full Body"];
const exerciseRegionStorageKey = "trainos:gym:exerciseRegionFilter";
const exerciseMuscleStorageKey = "trainos:gym:exerciseMuscleFilter";
type BodyRegionFilter = "all" | "upper" | "lower";

export function ExerciseReferenceViewer({ exercises, onChanged, onLogSet, onOpenExercise, onCreateExercise, onUseInRoutine }: ExerciseReferenceViewerProps) {
  const activeExercises = useMemo(() => exercises.filter((exercise) => !exercise.is_archived), [exercises]);
  const [searchText, setSearchText] = useState("");
  const [regionFilter, setRegionFilter] = useState<BodyRegionFilter>(() => readRegionFilter(exerciseRegionStorageKey));
  const [muscleFilter, setMuscleFilter] = useState(() => sanitizeMuscleFilter(readStringFilter(exerciseMuscleStorageKey, "all"), readRegionFilter(exerciseRegionStorageKey)));
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(activeExercises[0]?.id ?? null);
  const [selectedReferenceId, setSelectedReferenceId] = useState<number | null>(null);
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<number[]>([]);
  const [editingReference, setEditingReference] = useState<ReferenceEditorState>(null);
  const [previewReference, setPreviewReference] = useState<ExerciseReference | null>(null);
  const muscleOptions = useMemo(() => musclesForRegion(regionFilter), [regionFilter]);
  const effectiveMuscleFilter = sanitizeMuscleFilter(muscleFilter, regionFilter);
  const filteredExercises = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    return activeExercises.filter((exercise) => {
      const matchesRegion = regionFilter === "all" || muscleMatchesRegion(exercise.primary_muscle_group_name, regionFilter);
      const matchesMuscle = effectiveMuscleFilter === "all" || normalizedMuscle(exercise.primary_muscle_group_name) === normalizedMuscle(effectiveMuscleFilter);
      const matchesSearch = !normalizedSearch || [
        exercise.name,
        exercise.primary_muscle_group_name,
        exercise.equipment,
        exercise.movement_pattern,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
      return matchesRegion && matchesMuscle && matchesSearch;
    });
  }, [activeExercises, effectiveMuscleFilter, regionFilter, searchText]);

  useEffect(() => {
    window.localStorage.setItem(exerciseRegionStorageKey, regionFilter);
  }, [regionFilter]);

  useEffect(() => {
    window.localStorage.setItem(exerciseMuscleStorageKey, muscleFilter);
  }, [muscleFilter]);

  const effectiveSelectedExerciseId = filteredExercises.some((exercise) => exercise.id === selectedExerciseId)
    ? selectedExerciseId
    : filteredExercises[0]?.id ?? null;
  const selectedExercise = filteredExercises.find((exercise) => exercise.id === effectiveSelectedExerciseId) ?? null;
  const selectedReference = selectedExercise
    ? selectedExercise.references.find((reference) => reference.id === selectedReferenceId) ?? selectedExercise.references[0] ?? null
    : null;
  const groupedExercises = useMemo(() => groupExercises(filteredExercises), [filteredExercises]);
  const totalReferences = activeExercises.reduce((sum, exercise) => sum + exercise.reference_count, 0);

  function handleRegionChange(nextRegion: BodyRegionFilter) {
    setRegionFilter(nextRegion);
    if (muscleFilter !== "all" && !musclesForRegion(nextRegion).some((muscle) => normalizedMuscle(muscle) === normalizedMuscle(muscleFilter))) {
      setMuscleFilter("all");
    }
  }

  function clearFilters() {
    setSearchText("");
    setRegionFilter("all");
    setMuscleFilter("all");
  }

  function toggleExpanded(exerciseId: number) {
    setExpandedExerciseIds((current) =>
      current.includes(exerciseId) ? current.filter((id) => id !== exerciseId) : [...current, exerciseId],
    );
  }

  function handleReferenceChanged() {
    onChanged();
  }

  function handleSelectExercise(exercise: Exercise) {
    setSelectedExerciseId(exercise.id);
    setSelectedReferenceId(exercise.references[0]?.id ?? null);
  }

  function handleDeletedReference(reference: ExerciseReference) {
    if (selectedReferenceId === reference.id) {
      setSelectedReferenceId(null);
    }
    handleReferenceChanged();
  }

  return (
    <Card className="overflow-hidden p-0" delay={0.03}>
      <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Exercise library</p>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">Exercises</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Create movements, save form videos, then use them in quick logs or routines.
            </p>
          </div>
          {onCreateExercise ? (
            <Button type="button" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={onCreateExercise}>
              <Plus className="h-4 w-4" />
              New Movement
            </Button>
          ) : null}
        </div>
        {activeExercises.length > 0 ? (
          <MovementLibraryFilters
            searchText={searchText}
            regionFilter={regionFilter}
            muscleFilter={effectiveMuscleFilter}
            muscleOptions={muscleOptions}
            onSearchTextChange={setSearchText}
            onRegionFilterChange={handleRegionChange}
            onMuscleFilterChange={setMuscleFilter}
          />
        ) : null}
      </div>

      {activeExercises.length === 0 ? (
        <div className="p-5 md:p-6">
          <div className="rounded-3xl border border-border bg-bg-elevated p-5 text-sm leading-6 text-text-secondary">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber bg-amber-muted text-amber">
              <Library className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">Start your exercise library</h3>
            <p className="mt-1">Create your first movement before building routines or saving form videos.</p>
            {onCreateExercise ? (
              <Button type="button" className="mt-4 rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={onCreateExercise}>
                <Plus className="h-4 w-4" />
                Create movement
              </Button>
            ) : null}
          </div>
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="p-5 md:p-6">
          <div className="rounded-3xl border border-dashed border-border bg-bg-elevated p-5 text-sm leading-6 text-text-secondary">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber bg-amber-muted text-amber">
              <Library className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">No movements found for this filter.</h3>
            <p className="mt-1">Create a movement or clear filters.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="rounded-2xl" onClick={clearFilters}>
                Clear filters
              </Button>
              {onCreateExercise ? (
                <Button type="button" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={onCreateExercise}>
                  <Plus className="h-4 w-4" />
                  Create movement
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="hidden min-h-[34rem] md:grid md:grid-cols-[17rem_1fr] xl:grid-cols-[18rem_1fr]">
            <aside className="border-r border-border bg-bg-base/40">
              <div className="max-h-[42rem] overflow-y-auto py-4">
                {groupedExercises.map((group) => (
                  <div key={group.label} className="border-b border-border/80 py-4 last:border-b-0">
                    <p className="px-5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-text-muted">{group.label}</p>
                    <div className="mt-3 space-y-1">
                      {group.exercises.map((exercise) => (
                        <ExerciseListRow
                          key={exercise.id}
                          exercise={exercise}
                          selected={exercise.id === selectedExercise?.id}
                          onSelect={() => handleSelectExercise(exercise)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <section className="min-w-0 p-6">
              {selectedExercise ? (
                <DesktopExercisePanel
                  exercise={selectedExercise}
                  selectedReference={selectedReference}
                  totalReferences={totalReferences}
                  onSelectReference={(referenceId) => setSelectedReferenceId(referenceId)}
                  onPreviewReference={setPreviewReference}
                  onEditReference={(reference) => setEditingReference({ exercise: selectedExercise, reference })}
                  onDeleteReference={async (reference) => {
                    await api.exerciseReferences.delete(reference.id);
                    handleDeletedReference(reference);
                  }}
                  onAddReference={() => setEditingReference({ exercise: selectedExercise, reference: null })}
                  onLogSet={() => onLogSet(selectedExercise.id)}
                  onUseInRoutine={onUseInRoutine ? () => onUseInRoutine(selectedExercise) : undefined}
                  onOpenExercise={onOpenExercise ? () => onOpenExercise(selectedExercise.id) : undefined}
                />
              ) : null}
            </section>
          </div>

          <div className="space-y-3 p-5 md:hidden">
            {filteredExercises.map((exercise) => {
              const expanded = expandedExerciseIds.includes(exercise.id);
              return (
                <MobileExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  expanded={expanded}
                  onToggle={() => toggleExpanded(exercise.id)}
                  onAddReference={() => setEditingReference({ exercise, reference: null })}
                  onEditReference={(reference) => setEditingReference({ exercise, reference })}
                  onDeleteReference={async (reference) => {
                    await api.exerciseReferences.delete(reference.id);
                    handleDeletedReference(reference);
                  }}
                  onPreviewReference={setPreviewReference}
                  onLogSet={() => onLogSet(exercise.id)}
                  onUseInRoutine={onUseInRoutine ? () => onUseInRoutine(exercise) : undefined}
                  onOpenExercise={onOpenExercise ? () => onOpenExercise(exercise.id) : undefined}
                />
              );
            })}
          </div>
        </>
      )}

      <ReferenceEditorSheet
        state={editingReference}
        open={editingReference !== null}
        onOpenChange={(open) => {
          if (!open) setEditingReference(null);
        }}
        onSaved={() => {
          setEditingReference(null);
          handleReferenceChanged();
        }}
      />
      <YoutubePreviewSheet
        reference={previewReference}
        open={previewReference !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewReference(null);
        }}
      />
    </Card>
  );
}

function MovementLibraryFilters({
  searchText,
  regionFilter,
  muscleFilter,
  muscleOptions,
  onSearchTextChange,
  onRegionFilterChange,
  onMuscleFilterChange,
}: {
  searchText: string;
  regionFilter: BodyRegionFilter;
  muscleFilter: string;
  muscleOptions: string[];
  onSearchTextChange: (value: string) => void;
  onRegionFilterChange: (value: BodyRegionFilter) => void;
  onMuscleFilterChange: (value: string) => void;
}) {
  const regionOptions: Array<{ value: BodyRegionFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "upper", label: "Upper" },
    { value: "lower", label: "Lower" },
  ];
  const allLabel = regionFilter === "upper" ? "All Upper" : regionFilter === "lower" ? "All Lower" : "All Muscles";

  return (
    <div className="mt-5 space-y-3 rounded-3xl border border-border bg-bg-base/40 p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          type="search"
          aria-label="Search movements"
          accent="amber"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder="Search movement, muscle, equipment..."
          className="h-11"
        />
        <div className="grid grid-cols-3 gap-2">
          {regionOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "rounded-2xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
                regionFilter === option.value ? "border-amber bg-amber-muted text-amber" : "border-border bg-bg-elevated text-text-secondary hover:border-amber/60",
              )}
              onClick={() => onRegionFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          className={cn(
            "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition",
            muscleFilter === "all" ? "border-amber bg-amber-muted text-amber" : "border-border bg-bg-elevated text-text-secondary hover:border-amber/60",
          )}
          onClick={() => onMuscleFilterChange("all")}
        >
          {allLabel}
        </button>
        {muscleOptions.map((muscle) => (
          <button
            key={muscle}
            type="button"
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              normalizedMuscle(muscleFilter) === normalizedMuscle(muscle) ? "border-amber bg-amber-muted text-amber" : "border-border bg-bg-elevated text-text-secondary hover:border-amber/60",
            )}
            onClick={() => onMuscleFilterChange(muscle)}
          >
            {muscle}
          </button>
        ))}
      </div>
    </div>
  );
}

function DesktopExercisePanel({
  exercise,
  selectedReference,
  totalReferences,
  onSelectReference,
  onPreviewReference,
  onEditReference,
  onDeleteReference,
  onAddReference,
  onLogSet,
  onUseInRoutine,
  onOpenExercise,
}: {
  exercise: Exercise;
  selectedReference: ExerciseReference | null;
  totalReferences: number;
  onSelectReference: (referenceId: number) => void;
  onPreviewReference: (reference: ExerciseReference) => void;
  onEditReference: (reference: ExerciseReference) => void;
  onDeleteReference: (reference: ExerciseReference) => Promise<void>;
  onAddReference: () => void;
  onLogSet: () => void;
  onUseInRoutine?: () => void;
  onOpenExercise?: () => void;
}) {
  return (
    <div className="flex h-full min-h-[30rem] flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-2xl font-semibold text-text-primary">{exercise.name}</h3>
          <p className="mt-1 text-sm text-text-secondary">
            {exercise.primary_muscle_group_name} / {exercise.equipment ? labelize(exercise.equipment) : "No equipment"} / {exercise.movement_pattern ? labelize(exercise.movement_pattern) : "No pattern"}
          </p>
          <p className="mt-2 text-sm text-text-muted">{exercise.last_session_summary_label || "No logged sets yet."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenExercise ? (
            <Button type="button" variant="secondary" className="rounded-2xl" onClick={onOpenExercise}>
              <Pencil className="h-4 w-4" />
              Edit exercise
            </Button>
          ) : null}
          <Button type="button" variant="secondary" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={onLogSet}>
            <Target className="h-4 w-4" />
            Log quick set
          </Button>
          {onUseInRoutine ? (
            <Button type="button" variant="secondary" className="rounded-2xl" onClick={onUseInRoutine}>
              <Plus className="h-4 w-4" />
              Use in routine
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <ViewerMetric label="Saved videos" value={String(exercise.reference_count)} />
        <ViewerMetric label="All saved cues" value={String(totalReferences)} />
        <ViewerMetric label="Last done" value={exercise.last_performed_date ? formatShortDate(exercise.last_performed_date) : "--"} />
      </div>

      <div className="mt-6 flex-1 space-y-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-text-muted">Form videos / {exercise.reference_count}</p>
        {selectedReference ? (
          <ReferencePreview
            reference={selectedReference}
            selected
            onPreview={() => onPreviewReference(selectedReference)}
            onEdit={() => onEditReference(selectedReference)}
            onDelete={() => onDeleteReference(selectedReference)}
            className="min-h-48"
          />
        ) : (
          <ReferenceEmptyState onAddReference={onAddReference} />
        )}

        <div className="border-t border-border pt-4">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {exercise.references.map((reference) => (
              <ReferencePreview
                key={reference.id}
                reference={reference}
                variant="strip"
                selected={selectedReference?.id === reference.id}
                onSelect={() => onSelectReference(reference.id)}
              />
            ))}
            <AddReferenceTile onClick={onAddReference} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileExerciseCard({
  exercise,
  expanded,
  onToggle,
  onAddReference,
  onEditReference,
  onDeleteReference,
  onPreviewReference,
  onLogSet,
  onUseInRoutine,
  onOpenExercise,
}: {
  exercise: Exercise;
  expanded: boolean;
  onToggle: () => void;
  onAddReference: () => void;
  onEditReference: (reference: ExerciseReference) => void;
  onDeleteReference: (reference: ExerciseReference) => Promise<void>;
  onPreviewReference: (reference: ExerciseReference) => void;
  onLogSet: () => void;
  onUseInRoutine?: () => void;
  onOpenExercise?: () => void;
}) {
  return (
    <div className="rounded-3xl border border-border bg-bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-text-primary">{exercise.name}</p>
          <p className="mt-1 text-sm text-text-secondary">
            {exercise.primary_muscle_group_name} / {exercise.equipment ? labelize(exercise.equipment) : "No equipment"}
          </p>
        </div>
        <span className="rounded-full border border-amber bg-amber-muted px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber">
          {exercise.reference_count} videos
        </span>
      </div>
      <p className="mt-3 rounded-2xl border border-border bg-bg-card p-3 text-xs leading-5 text-text-secondary">
        {exercise.last_session_summary_label || "No logged sets yet."}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" className="rounded-2xl" onClick={onToggle}>
          <ListVideo className="h-4 w-4" />
          {expanded ? "Hide videos" : "Show videos"}
        </Button>
        <Button type="button" variant="secondary" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={onLogSet}>
          <Target className="h-4 w-4" />
          Log set
        </Button>
      </div>
      {onUseInRoutine ? (
        <Button type="button" variant="secondary" className="mt-2 h-9 w-full rounded-2xl text-xs" onClick={onUseInRoutine}>
          <Plus className="h-3.5 w-3.5" />
          Use in routine
        </Button>
      ) : null}
      {onOpenExercise ? (
        <Button type="button" variant="ghost" className="mt-2 h-9 w-full rounded-2xl text-xs" onClick={onOpenExercise}>
          <Pencil className="h-3.5 w-3.5" />
          Edit exercise details
        </Button>
      ) : null}

      {expanded ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {exercise.references.length === 0 ? <MobileReferenceEmptyState /> : null}
          {exercise.references.map((reference) => (
            <ReferencePreview
              key={reference.id}
              reference={reference}
              variant="mobile"
              onPreview={() => onPreviewReference(reference)}
              onEdit={() => onEditReference(reference)}
              onDelete={() => onDeleteReference(reference)}
            />
          ))}
          <AddReferenceTile onClick={onAddReference} mobile />
        </div>
      ) : null}
    </div>
  );
}

function MobileReferenceEmptyState() {
  return (
    <div className="min-w-[18rem] rounded-3xl border border-dashed border-border bg-bg-card p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber bg-amber-muted text-amber">
        <Video className="h-4 w-4" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-text-primary">No form videos yet.</h3>
      <p className="mt-2 text-xs leading-5 text-text-secondary">Add a YouTube Short, Reel, TikTok, or form cue.</p>
    </div>
  );
}

function ExerciseListRow({ exercise, selected, onSelect }: { exercise: Exercise; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-l-2 px-5 py-3 text-left transition hover:bg-bg-elevated/70",
        selected ? "border-amber bg-bg-elevated text-text-primary" : "border-transparent text-text-secondary",
      )}
    >
      <span className={cn("h-2.5 w-2.5 rounded-full", selected ? "bg-amber" : "bg-amber/80")} />
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-text-primary">{exercise.name}</span>
        <span className="mt-0.5 block truncate text-sm text-text-muted">
          {exercise.primary_muscle_group_name} / {exercise.equipment ? labelize(exercise.equipment) : "No equipment"}
        </span>
        <span className="mt-1 block truncate text-xs text-text-muted">{exercise.last_session_summary_label || "No logged sets yet."}</span>
      </span>
      <span className={cn("rounded-xl border px-2 py-1 metric-number text-xs font-bold", exercise.reference_count ? "border-amber bg-amber-muted text-amber" : "border-border bg-bg-card text-text-muted")}>
        {exercise.reference_count}
      </span>
    </button>
  );
}

function ReferenceEditorSheet({ state, open, onOpenChange, onSaved }: { state: ReferenceEditorState; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto md:w-[min(92vw,36rem)]">
        <SheetHeader>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Form video</p>
          <SheetTitle>{state?.reference ? "Edit form cue" : "Add form video"}</SheetTitle>
          <SheetDescription>
            {state ? `${state.exercise.name} / store only the URL, title, and your form cues.` : "Store form cue metadata only."}
          </SheetDescription>
        </SheetHeader>
        {state ? <ReferenceForm exercise={state.exercise} reference={state.reference} onSaved={onSaved} onCancel={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function ReferenceForm({ exercise, reference, onSaved, onCancel }: { exercise: Exercise; reference: ExerciseReference | null; onSaved: () => void; onCancel: () => void }) {
  const [url, setUrl] = useState(reference?.url ?? "");
  const [source, setSource] = useState<ExerciseReferenceSource>(reference?.source ?? "youtube");
  const [sourceTouched, setSourceTouched] = useState(Boolean(reference));
  const [title, setTitle] = useState(reference?.title ?? "");
  const [notes, setNotes] = useState(reference?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleUrlChange(value: string) {
    setUrl(value);
    if (!sourceTouched) setSource(detectReferenceSource(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const input: ExerciseReferenceInput = { url, source, title, notes };
    try {
      if (reference) {
        await api.exerciseReferences.update(reference.id, input);
      } else {
        await api.exerciseReferences.create(exercise.id, input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save form video.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Field label="URL">
        <Input value={url} onChange={(event) => handleUrlChange(event.target.value)} required placeholder="https://youtube.com/shorts/..." className="focus:border-amber focus:ring-amber/20" />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Source">
          <select
            className={selectClassName("amber")}
            value={source}
            onChange={(event) => {
              setSource(event.target.value as ExerciseReferenceSource);
              setSourceTouched(true);
            }}
          >
            {sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Strict barbell row" className="focus:border-amber focus:ring-amber/20" />
        </Field>
      </div>
      <OptionalNotesField
        label="Cue notes"
        value={notes}
        onChange={setNotes}
        collapsedLabel="+ Add cue notes"
        placeholder="Setup cue, tempo, range of motion, or mistake to avoid."
        helperText="Optional cues for this saved form video or link."
      />
      {error ? <p className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" className="rounded-2xl" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="rounded-2xl" disabled={saving || !url}>{saving ? "Saving..." : reference ? "Save changes" : "Save video"}</Button>
      </div>
    </form>
  );
}

function YoutubePreviewSheet({ reference, open, onOpenChange }: { reference: ExerciseReference | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const preview = reference?.source === "youtube" ? getYouTubePreview(reference.url) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto md:w-[min(92vw,44rem)]">
        <SheetHeader>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Video preview</p>
          <SheetTitle>{reference?.title || "YouTube form video"}</SheetTitle>
          <SheetDescription>Preview uses youtube-nocookie.com. TrainOS only stores the URL and your notes.</SheetDescription>
        </SheetHeader>
        {reference && preview ? (
          <div className="space-y-4">
            <div className={cn("overflow-hidden rounded-3xl border border-border bg-bg-elevated", preview.isShort ? "mx-auto aspect-[9/16] max-h-[72vh] w-full max-w-sm" : "aspect-video")}> 
              <iframe
                className="h-full w-full"
                src={preview.embedUrl}
                title={reference.title || "YouTube preview"}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <div className="rounded-2xl border border-border bg-bg-elevated p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{referenceKindLabel(reference.url)}</p>
              {reference.notes ? <p className="mt-2 text-sm leading-6 text-text-secondary">{reference.notes}</p> : null}
            </div>
            <Button asChild variant="secondary" className="h-11 w-full rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20">
              <a href={reference.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open in YouTube
              </a>
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">
            Preview unavailable for this cue. Open it in the source app or site.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ReferenceEmptyState({ onAddReference }: { onAddReference: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-bg-elevated p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber bg-amber-muted text-amber">
        <Video className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-text-primary">No form videos yet</h3>
      <p className="mt-2 text-sm leading-6 text-text-secondary">Add a YouTube Short, Reel, TikTok, or form cue.</p>
      <Button type="button" className="mt-4 rounded-2xl" onClick={onAddReference}>
        <Plus className="h-4 w-4" />
        Add video
      </Button>
    </div>
  );
}

function AddReferenceTile({ onClick, mobile = false }: { onClick: () => void; mobile?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-card p-4 text-center text-sm font-semibold text-text-secondary transition hover:border-amber hover:text-amber",
        mobile ? "min-w-[14rem]" : "",
      )}
    >
      <Plus className="mb-2 h-5 w-5" />
      Add video
    </button>
  );
}

function ViewerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-3">
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="metric-number mt-1 text-sm font-bold text-text-primary">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function groupExercises(exercises: Exercise[]) {
  const groups = new Map<string, Exercise[]>();
  for (const exercise of exercises) {
    const label = labelize(exercise.movement_pattern || exercise.primary_muscle_group_name || "other");
    const current = groups.get(label) ?? [];
    current.push(exercise);
    groups.set(label, current);
  }
  return Array.from(groups.entries())
    .map(([label, groupExercises]) => ({ label, exercises: groupExercises.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function musclesForRegion(region: BodyRegionFilter) {
  if (region === "upper") return upperBodyMuscles;
  if (region === "lower") return lowerBodyMuscles;
  return allMuscles;
}

function muscleMatchesRegion(muscleName: string, region: BodyRegionFilter) {
  const normalized = normalizedMuscle(muscleName);
  return musclesForRegion(region).some((muscle) => normalizedMuscle(muscle) === normalized);
}

function sanitizeMuscleFilter(muscleFilter: string, region: BodyRegionFilter) {
  if (muscleFilter === "all") return "all";
  return musclesForRegion(region).some((muscle) => normalizedMuscle(muscle) === normalizedMuscle(muscleFilter)) ? muscleFilter : "all";
}

function normalizedMuscle(value: string) {
  return value.trim().toLowerCase();
}

function readStringFilter(key: string, fallback: string) {
  return window.localStorage.getItem(key) ?? fallback;
}

function readRegionFilter(key: string): BodyRegionFilter {
  const stored = window.localStorage.getItem(key);
  return stored === "upper" || stored === "lower" || stored === "all" ? stored : "all";
}

function labelize(value: string) {
  if (!value) return "None";
  return value.replaceAll("_", " ");
}
