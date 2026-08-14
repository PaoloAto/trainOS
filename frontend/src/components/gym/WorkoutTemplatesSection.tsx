import { Archive, ArrowDown, ArrowUp, Dumbbell, ExternalLink, Pencil, Play, Plus, Timer, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/common/Card";
import { OptionalNotesField } from "@/components/common/OptionalNotesField";
import { ReferencePreview } from "@/components/gym/ReferencePreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClassName } from "@/components/ui/form-control";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  api,
  type ActiveWorkout,
  type Exercise,
  type ExerciseReference,
  type GymSession,
  type MuscleGroup,
  type WorkoutLoggedSet,
  type WorkoutTemplate,
  type WorkoutTemplateExercise,
  type WorkoutTemplateExerciseInput,
} from "@/lib/api";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getYouTubePreview, referenceKindLabel } from "@/lib/video";

const splitOptions = ["push", "pull", "legs", "upper", "lower", "full_body", "custom"];
const movementOptions = ["push", "pull", "squat", "hinge", "lunge", "carry", "rotation", "isolation", "core", "other"];
const equipmentOptions = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "other"];
type WorkoutTemplatesSectionProps = {
  templates: WorkoutTemplate[];
  activeWorkout: ActiveWorkout | null;
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  onChanged: () => void | Promise<void>;
  onStartWithoutTemplate: () => void;
  resumeRequest?: number;
  onResumeRequestHandled?: () => void;
};

type TemplateEditorState = WorkoutTemplate | "new" | null;

type TemplateItemDraft = {
  key: string;
  exerciseId: string;
  targetSets: string;
  targetRepsLow: string;
  targetRepsHigh: string;
  suggestedWeight: string;
  restSeconds: string;
  notes: string;
};

export function WorkoutTemplatesSection({ templates, activeWorkout, exercises, muscleGroups, onChanged, onStartWithoutTemplate, resumeRequest = 0, onResumeRequestHandled }: WorkoutTemplatesSectionProps) {
  const [editorState, setEditorState] = useState<TemplateEditorState>(null);
  const [sheetWorkout, setSheetWorkout] = useState<ActiveWorkout | null>(null);
  const [startingId, setStartingId] = useState<number | null>(null);
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [cancellingActiveWorkout, setCancellingActiveWorkout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visibleWorkout = sheetWorkout ?? activeWorkout;
  const activeBannerProgress = activeWorkout ? workoutProgress(activeWorkout) : null;

  useEffect(() => {
    if (!resumeRequest || !activeWorkout) return;
    const requestId = window.setTimeout(() => {
      setSheetWorkout(activeWorkout);
      onResumeRequestHandled?.();
    }, 0);
    return () => window.clearTimeout(requestId);
  }, [activeWorkout, onResumeRequestHandled, resumeRequest]);

  async function refresh() {
    await Promise.resolve(onChanged());
  }

  async function handleStart(template: WorkoutTemplate) {
    setStartingId(template.id);
    setError(null);
    try {
      const workout = await api.workoutTemplates.start(template.id);
      setSheetWorkout(workout);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start workout.");
    } finally {
      setStartingId(null);
    }
  }

  async function handleArchive(template: WorkoutTemplate) {
    const confirmed = window.confirm(`Archive ${template.name}? You can restore it later.`);
    if (!confirmed) return;
    setArchivingId(template.id);
    setError(null);
    try {
      await api.workoutTemplates.archive(template.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to archive routine.");
    } finally {
      setArchivingId(null);
    }
  }

  async function handleCancelActiveWorkout() {
    const confirmed = window.confirm("Cancel this workout? Logged in-progress sets will be discarded.");
    if (!confirmed) return;
    setCancellingActiveWorkout(true);
    setError(null);
    try {
      await api.activeWorkout.cancel();
      setSheetWorkout(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel active workout.");
    } finally {
      setCancellingActiveWorkout(false);
    }
  }

  return (
    <Card className="overflow-hidden p-0" delay={0.04}>
      <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Routines</p>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">Guided workout routines</h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">Build reusable Push, Pull, Legs, Upper, Lower, or custom routines, then log sets step by step.</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button type="button" variant="secondary" className="w-full rounded-2xl sm:w-auto" onClick={onStartWithoutTemplate}>
              Quick Log
            </Button>
            <Button type="button" className="w-full rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20 sm:w-auto" onClick={() => setEditorState("new")}>
              <Plus className="h-4 w-4" />
              Create routine
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5 md:p-6">
        {error ? <p className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">{error}</p> : null}
        {activeWorkout ? (
          <div className="rounded-3xl border border-amber bg-amber-muted p-4 text-amber shadow-amber">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em]">Workout in progress</p>
                <h3 className="mt-1 text-lg font-semibold">Resume {activeWorkout.template_summary?.name ?? "workout"}</h3>
                <p className="mt-1 text-sm opacity-90">
                  Started {formatWorkoutStartedAt(activeWorkout.started_at)} / {activeWorkout.logged_sets.length} sets logged
                  {activeBannerProgress?.currentExercise ? ` / ${activeBannerProgress.currentExercise}` : ""}
                </p>
                {activeBannerProgress ? (
                  <div className="mt-3 max-w-xl">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] opacity-90">
                      <span>{activeBannerProgress.exerciseLabel}</span>
                      <span>{activeBannerProgress.percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-bg-card">
                      <div className="h-full rounded-full bg-amber transition-all" style={{ width: `${activeBannerProgress.percent}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button type="button" variant="secondary" className="w-full rounded-2xl border-amber bg-bg-card text-amber hover:bg-amber/20 sm:w-auto" onClick={() => setSheetWorkout(activeWorkout)} disabled={cancellingActiveWorkout}>
                  Resume workout
                </Button>
                <Button type="button" variant="danger" className="w-full rounded-2xl sm:w-auto" onClick={() => void handleCancelActiveWorkout()} disabled={cancellingActiveWorkout}>
                  <X className="h-4 w-4" />
                  {cancellingActiveWorkout ? "Cancelling..." : "Cancel workout"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {templates.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-bg-elevated p-5 text-sm leading-6 text-text-secondary">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber bg-amber-muted text-amber">
              <Dumbbell className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">No routines yet.</h3>
            <p className="mt-1">Build Upper, Push, Pull, Legs, or a custom routine from your exercises.</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                activeWorkout={activeWorkout}
                starting={startingId === template.id}
                archiving={archivingId === template.id}
                onStart={() => handleStart(template)}
                onResume={() => {
                  if (activeWorkout) setSheetWorkout(activeWorkout);
                }}
                onEdit={() => setEditorState(template)}
                onArchive={() => handleArchive(template)}
              />
            ))}
          </div>
        )}
      </div>

      <TemplateEditorSheet
        key={editorState === "new" ? "new-template" : editorState?.id ?? "closed-template"}
        state={editorState}
        exercises={exercises}
        muscleGroups={muscleGroups}
        open={editorState !== null}
        onOpenChange={(open) => {
          if (!open) setEditorState(null);
        }}
        onSaved={async () => {
          setEditorState(null);
          await refresh();
        }}
      />
      <ActiveWorkoutSheet
        key={visibleWorkout?.id ?? "no-active-workout"}
        activeWorkout={visibleWorkout}
        open={visibleWorkout !== null && sheetWorkout !== null}
        onOpenChange={(open) => {
          if (!open) setSheetWorkout(null);
        }}
        onChanged={refresh}
        onCompleted={async () => {
          setSheetWorkout(null);
          await refresh();
        }}
        onCancelled={async () => {
          setSheetWorkout(null);
          await refresh();
        }}
      />
    </Card>
  );
}

function TemplateCard({
  template,
  activeWorkout,
  starting,
  archiving,
  onStart,
  onResume,
  onEdit,
  onArchive,
}: {
  template: WorkoutTemplate;
  activeWorkout: ActiveWorkout | null;
  starting: boolean;
  archiving: boolean;
  onStart: () => void;
  onResume: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const isActiveTemplate = activeWorkout ? activeWorkout.template === template.id || activeWorkout.template_summary?.id === template.id : false;
  const anotherWorkoutActive = Boolean(activeWorkout && !isActiveTemplate);

  return (
    <div className={cn("rounded-3xl border bg-bg-elevated p-4 transition hover:border-amber/70", isActiveTemplate ? "border-amber shadow-amber" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.68rem] uppercase tracking-[0.18em] text-text-muted">{labelize(template.split_type)}</p>
          <h3 className="mt-1 truncate text-lg font-semibold text-text-primary">{template.name}</h3>
          {template.notes ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">{template.notes}</p> : null}
        </div>
        <span className="rounded-full border border-amber bg-amber-muted px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber">
          {template.exercise_count} exercises
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <TemplateMetric label="Target sets" value={String(template.target_set_count)} />
        <TemplateMetric label="Updated" value={formatShortDate(template.updated_at)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {isActiveTemplate ? (
          <>
            <div className="inline-flex h-10 items-center gap-2 rounded-2xl border border-amber bg-amber-muted px-3 text-sm font-semibold text-amber">
              <span className="h-2 w-2 rounded-full bg-amber" />
              In progress
            </div>
            <Button type="button" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={onResume}>
              Resume
            </Button>
          </>
        ) : anotherWorkoutActive ? (
          <div className="rounded-2xl border border-border bg-bg-card px-3 py-2 text-sm leading-5 text-text-secondary">
            Another workout is active. Resume or cancel it before starting this routine.
          </div>
        ) : (
          <Button type="button" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={onStart} disabled={starting || template.exercise_count === 0}>
            <Play className="h-4 w-4" />
            {starting ? "Starting..." : "Start"}
          </Button>
        )}
        <Button type="button" variant="secondary" className="rounded-2xl" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button type="button" variant="ghost" className="rounded-2xl text-text-muted hover:text-red" onClick={onArchive} disabled={archiving}>
          <Archive className="h-4 w-4" />
          {archiving ? "Archiving..." : "Archive"}
        </Button>
      </div>
    </div>
  );
}

function TemplateEditorSheet({
  state,
  exercises,
  muscleGroups,
  open,
  onOpenChange,
  onSaved,
}: {
  state: TemplateEditorState;
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const editingTemplate = typeof state === "object" ? state : null;
  const [name, setName] = useState(editingTemplate?.name ?? "");
  const [splitType, setSplitType] = useState(editingTemplate?.split_type ?? "pull");
  const [notes, setNotes] = useState(editingTemplate?.notes ?? "");
  const [items, setItems] = useState<TemplateItemDraft[]>(() => (editingTemplate?.items ?? []).map(templateItemToDraft));
  const [createdExercises, setCreatedExercises] = useState<Exercise[]>([]);
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeExercises = useMemo(() => mergeExercises(createdExercises, exercises).filter((exercise) => !exercise.is_archived), [createdExercises, exercises]);
  const exerciseLookup = useMemo(() => new Map(activeExercises.map((exercise) => [exercise.id, exercise])), [activeExercises]);
  const selectedExerciseIds = useMemo(() => items.map((item) => item.exerciseId).filter(Boolean), [items]);
  const unusedExercise = activeExercises.find((exercise) => !selectedExerciseIds.includes(String(exercise.id)));
  const hasDuplicateExercises = new Set(selectedExerciseIds).size !== selectedExerciseIds.length;
  const hasInvalidExercises = items.some((item) => !exerciseLookup.has(Number(item.exerciseId)));
  const validationMessages = templateValidationMessages(name, splitType, items, hasInvalidExercises, hasDuplicateExercises);
  const validationMessage = validationMessages[0] ?? null;

  function addItem() {
    if (!unusedExercise) {
      setError(activeExercises.length === 0 ? "Create an active exercise before adding routine items." : "Every active exercise is already in this routine.");
      return;
    }

    setError(null);
    setItems((current) => [...current, newTemplateItemDraft(unusedExercise.id)]);
  }

  function updateItem(key: string, patch: Partial<TemplateItemDraft>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setSaving(true);
    setError(null);
    const input = {
      name: name.trim(),
      split_type: splitType,
      notes,
      items: items.map((item, index): WorkoutTemplateExerciseInput => ({
        exercise: Number(item.exerciseId),
        order: index + 1,
        target_sets: Math.max(1, Math.round(toRequiredNumber(item.targetSets, 3))),
        target_reps_low: toOptionalNumber(item.targetRepsLow),
        target_reps_high: toOptionalNumber(item.targetRepsHigh),
        suggested_weight: toOptionalNumber(item.suggestedWeight),
        rest_seconds: toOptionalNumber(item.restSeconds),
        notes: item.notes,
      })),
    };
    try {
      if (editingTemplate) {
        await api.workoutTemplates.update(editingTemplate.id, input);
      } else {
        await api.workoutTemplates.create(input);
      }
      await Promise.resolve(onSaved());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save routine.");
    } finally {
      setSaving(false);
    }
  }

  function handleExerciseCreated(exercise: Exercise) {
    setCreatedExercises((current) => [exercise, ...current]);
    setShowCreateExercise(false);
    setError(null);
    setItems((current) => [...current, newTemplateItemDraft(exercise.id)]);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto overscroll-contain pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:w-[min(92vw,64rem)] md:pb-6">
        <SheetHeader>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Workout routine</p>
          <SheetTitle>{editingTemplate ? "Edit routine" : "Create routine"}</SheetTitle>
          <SheetDescription>Plan the intended work. Actual logged sets are saved only when a workout is completed.</SheetDescription>
        </SheetHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="rounded-3xl border border-border bg-bg-base/40 p-4">
            <div className="mb-4 rounded-2xl border border-border bg-bg-elevated px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              1. Name routine / 2. Add exercises / 3. Save
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
              <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Upper V1" className="h-11 focus:border-amber focus:ring-amber/20" /></Field>
              <Field label="Split"><select className={selectClassName("amber")} value={splitType} onChange={(event) => setSplitType(event.target.value)}>{splitOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
            </div>
            <OptionalNotesField
              label="Routine notes"
              value={notes}
              onChange={setNotes}
              collapsedLabel="+ Add optional routine notes"
              placeholder="Optional intent, warm-up, or reminders for this routine."
              helperText="Optional intent, warm-up, or reminders for this routine."
              className="mt-3"
            />
          </div>
          <div className="rounded-3xl border border-border bg-bg-base/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Exercises</p>
                <p className="mt-1 text-sm text-text-secondary">Routines use exercises from your exercise library. Add target sets, reps, and rest.</p>
              </div>
              {activeExercises.length > 0 ? (
                <Button type="button" variant="secondary" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={addItem} disabled={saving || !unusedExercise}>
                  <Plus className="h-4 w-4" />
                  Add exercise
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={() => setShowCreateExercise(true)} disabled={saving}>
                  <Plus className="h-4 w-4" />
                  Create exercise
                </Button>
              )}
            </div>
            {showCreateExercise ? (
              <InlineCreateExercisePanel
                muscleGroups={muscleGroups}
                onCreated={handleExerciseCreated}
                onCancel={activeExercises.length > 0 || items.length > 0 ? () => setShowCreateExercise(false) : undefined}
              />
            ) : null}
            {activeExercises.length === 0 && !showCreateExercise ? (
              <div className="mt-4 rounded-2xl border border-dashed border-amber bg-amber-muted p-4 text-sm leading-6 text-amber">
                <h3 className="font-semibold text-text-primary">No active exercises available.</h3>
                <p className="mt-1">Create an exercise first, then add it to this routine. Archived exercises stay hidden from new routines.</p>
                <Button type="button" variant="secondary" className="mt-3 rounded-2xl border-amber bg-bg-card text-amber hover:bg-amber/20" onClick={() => setShowCreateExercise(true)}>
                  <Plus className="h-4 w-4" />
                  Create Exercise
                </Button>
              </div>
            ) : null}
            {activeExercises.length > 0 && !unusedExercise ? (
              <p className="mt-4 rounded-2xl border border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">
                Every active exercise is already in this routine. Create another exercise or remove one from the routine.
              </p>
            ) : null}
            {items.length === 0 && activeExercises.length > 0 ? <p className="mt-4 rounded-2xl border border-dashed border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">Add at least one exercise before saving this routine.</p> : null}
            <div className="mt-4 space-y-3">
              {items.map((item, index) => {
                const exercise = exerciseLookup.get(Number(item.exerciseId));
                const exerciseOptions = exerciseOptionsForItem(activeExercises, items, item);
                const itemMessages = itemValidationMessages(item, exerciseLookup, items);
                return (
                  <div key={item.key} className={cn("rounded-3xl border bg-bg-elevated p-4", itemMessages.length ? "border-red" : "border-border")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.68rem] uppercase tracking-[0.18em] text-text-muted">Exercise {index + 1}</p>
                        <p className="mt-1 text-sm text-text-secondary">{exercise?.last_session_summary_label ?? "No logged sets yet."}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon" className="rounded-xl" onClick={() => moveItem(index, -1)} disabled={index === 0}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="rounded-xl" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="rounded-xl text-red hover:bg-red-muted hover:text-red" onClick={() => removeItem(item.key)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      <Field label="Exercise">
                        {exerciseOptions.length > 0 ? (
                          <select className={selectClassName("amber")} value={item.exerciseId} onChange={(event) => updateItem(item.key, { exerciseId: event.target.value })} required>
                            {exerciseOptions.map((exerciseOption) => (
                              <option key={exerciseOption.id} value={exerciseOption.id}>{exerciseOption.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="rounded-xl border border-red bg-red-muted p-3 text-sm text-red">No valid active exercises remain for this row.</div>
                        )}
                      </Field>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Target sets"><Input className="h-11 focus:border-amber focus:ring-amber/20" inputMode="numeric" value={item.targetSets} onChange={(event) => updateItem(item.key, { targetSets: event.target.value })} /></Field>
                        <Field label="Rest sec"><Input className="h-11 focus:border-amber focus:ring-amber/20" inputMode="numeric" value={item.restSeconds} onChange={(event) => updateItem(item.key, { restSeconds: event.target.value })} placeholder="90" /></Field>
                      </div>
                      <div className="grid gap-3 md:grid-cols-4">
                        <Field label="Reps low"><Input className="h-11 focus:border-amber focus:ring-amber/20" inputMode="numeric" value={item.targetRepsLow} onChange={(event) => updateItem(item.key, { targetRepsLow: event.target.value })} placeholder="8" /></Field>
                        <Field label="Reps high"><Input className="h-11 focus:border-amber focus:ring-amber/20" inputMode="numeric" value={item.targetRepsHigh} onChange={(event) => updateItem(item.key, { targetRepsHigh: event.target.value })} placeholder="10" /></Field>
                        <Field label="Weight / Load"><Input className="h-11 focus:border-amber focus:ring-amber/20" inputMode="decimal" value={item.suggestedWeight} onChange={(event) => updateItem(item.key, { suggestedWeight: event.target.value })} placeholder="optional" /></Field>
                        <div className="space-y-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Videos</span>
                          <div className="flex h-11 items-center">
                            <span className="inline-flex rounded-full border border-amber bg-amber-muted px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-amber">
                              {exercise?.reference_count ?? 0} saved
                            </span>
                          </div>
                        </div>
                      </div>
                      <OptionalNotesField
                        label="Exercise notes"
                        value={item.notes}
                        onChange={(value) => updateItem(item.key, { notes: value })}
                        collapsedLabel="+ Add exercise notes"
                        placeholder="Optional tempo, setup cues, substitutions, or target effort."
                        helperText="These notes stay with this routine item."
                      />
                      {itemMessages.length ? (
                        <div className="space-y-1 rounded-2xl border border-red bg-red-muted p-3 text-sm leading-6 text-red">
                          {itemMessages.map((message) => <p key={message}>{message}</p>)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {error ? <p className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">{error}</p> : null}
          {validationMessages.length && !error ? (
            <div className="rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-text-muted">Before saving</p>
              <div className="mt-2 space-y-1">
                {validationMessages.map((message) => (
                  <p key={message} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber" />
                    <span>{message}</span>
                  </p>
                ))}
              </div>
            </div>
          ) : null}
          <div className="sticky bottom-0 grid grid-cols-2 gap-3 rounded-3xl border border-border bg-bg-card/95 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur md:pb-2">
            <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" disabled={saving || Boolean(validationMessage)}>{saving ? "Saving..." : "Save routine"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function InlineCreateExercisePanel({
  muscleGroups,
  onCreated,
  onCancel,
}: {
  muscleGroups: MuscleGroup[];
  onCreated: (exercise: Exercise) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [primaryGroup, setPrimaryGroup] = useState(() => String(muscleGroups[0]?.id ?? ""));
  const [equipment, setEquipment] = useState("bodyweight");
  const [movementPattern, setMovementPattern] = useState("pull");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!primaryGroup) {
      setError("Create or load a muscle group before creating an exercise.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const exercise = await api.exercises.create({
        name: name.trim(),
        primary_muscle_group: Number(primaryGroup),
        equipment,
        movement_pattern: movementPattern,
        form_notes: formNotes,
      });
      setName("");
      setFormNotes("");
      await Promise.resolve(onCreated(exercise));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create exercise.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="mt-4 space-y-4 rounded-3xl border border-amber bg-amber-muted p-4"
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.target instanceof HTMLTextAreaElement) return;
        event.preventDefault();
        void handleCreate();
      }}
    >
      <div className="border-b border-border pb-3">
        <p className="text-[0.68rem] uppercase tracking-[0.2em] text-amber">Create Exercise</p>
        <p className="mt-1 text-sm leading-6 text-text-secondary">Add the exercise here, then TrainOS will place it into this routine automatically.</p>
      </div>
      <Field label="Exercise name">
        <Input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Pull-up" className="focus:border-amber focus:ring-amber/20" />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Primary muscle">
          <select className={selectClassName("amber")} value={primaryGroup} onChange={(event) => setPrimaryGroup(event.target.value)} required>
            {muscleGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </Field>
        <Field label="Equipment">
          <select className={selectClassName("amber")} value={equipment} onChange={(event) => setEquipment(event.target.value)}>
            {equipmentOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
          </select>
        </Field>
        <Field label="Pattern">
          <select className={selectClassName("amber")} value={movementPattern} onChange={(event) => setMovementPattern(event.target.value)}>
            {movementOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
          </select>
        </Field>
      </div>
      <OptionalNotesField
        label="Form notes"
        value={formNotes}
        onChange={setFormNotes}
        collapsedLabel="+ Add form notes"
        placeholder="Optional setup cues or form reminders."
        helperText="These notes stay with the movement."
      />
      {error ? <p className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">{error}</p> : null}
      <div className={cn("grid gap-3", onCancel ? "grid-cols-2" : "grid-cols-1")}>
        {onCancel ? <Button type="button" variant="secondary" className="rounded-2xl" onClick={onCancel}>Cancel</Button> : null}
        <Button type="button" className="rounded-2xl border-amber bg-bg-card text-amber hover:bg-amber/20" onClick={() => void handleCreate()} disabled={saving || !name.trim() || !primaryGroup}>
          {saving ? "Creating..." : "Create and add"}
        </Button>
      </div>
    </div>
  );
}

function ActiveWorkoutSheet({ activeWorkout, open, onOpenChange, onChanged, onCompleted, onCancelled }: { activeWorkout: ActiveWorkout | null; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void | Promise<void>; onCompleted: (session: GymSession) => void | Promise<void>; onCancelled: () => void | Promise<void> }) {
  if (!activeWorkout) return null;
  return <ActiveWorkoutContent activeWorkout={activeWorkout} open={open} onOpenChange={onOpenChange} onChanged={onChanged} onCompleted={onCompleted} onCancelled={onCancelled} />;
}

function ActiveWorkoutContent({ activeWorkout, open, onOpenChange, onChanged, onCompleted, onCancelled }: { activeWorkout: ActiveWorkout; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void | Promise<void>; onCompleted: (session: GymSession) => void | Promise<void>; onCancelled: () => void | Promise<void> }) {
  const [workout, setWorkout] = useState(activeWorkout);
  const [weight, setWeight] = useState(() => initialWeight(activeWorkout));
  const [reps, setReps] = useState(() => initialReps(activeWorkout));
  const [rpe, setRpe] = useState("");
  const [setNotes, setSetNotes] = useState("");
  const [workoutNotes, setWorkoutNotes] = useState(activeWorkout.notes);
  const [restRemaining, setRestRemaining] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewReference, setPreviewReference] = useState<ExerciseReference | null>(null);
  const currentItem = workout.template_items[Math.min(workout.current_exercise_index, Math.max(0, workout.template_items.length - 1))] ?? null;
  const progress = workoutProgress(workout);
  const setNumberLabel = currentItem && workout.current_set_index >= currentItem.target_sets ? `Extra set ${workout.current_set_index - currentItem.target_sets + 1}` : `Set ${workout.current_set_index + 1} of ${currentItem?.target_sets ?? 0}`;
  const loggedVolume = workout.logged_sets.reduce((sum, item) => sum + ((item.weight ?? 0) > 0 ? (item.weight ?? 0) * item.reps : 0), 0);

  useEffect(() => {
    if (restRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setRestRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [restRemaining]);

  async function persist(input: Partial<ActiveWorkout>) {
    const updated = await api.activeWorkout.update({
      current_exercise_index: input.current_exercise_index ?? workout.current_exercise_index,
      current_set_index: input.current_set_index ?? workout.current_set_index,
      logged_sets: input.logged_sets ?? workout.logged_sets,
      notes: input.notes ?? workoutNotes,
    });
    setWorkout(updated);
    await Promise.resolve(onChanged());
    return updated;
  }

  function resetSetInputs(nextItem: WorkoutTemplateExercise | null) {
    setWeight(nextItem?.suggested_weight != null ? String(nextItem.suggested_weight) : "");
    setReps(nextItem?.target_reps_low != null ? String(nextItem.target_reps_low) : "");
    setRpe("");
    setSetNotes("");
  }

  function nextPosition(fromWorkout: ActiveWorkout) {
    const item = fromWorkout.template_items[fromWorkout.current_exercise_index];
    if (!item) return { exerciseIndex: fromWorkout.current_exercise_index, setIndex: fromWorkout.current_set_index };
    if (fromWorkout.current_set_index + 1 < item.target_sets) {
      return { exerciseIndex: fromWorkout.current_exercise_index, setIndex: fromWorkout.current_set_index + 1 };
    }
    const nextExerciseIndex = Math.min(fromWorkout.current_exercise_index + 1, Math.max(0, fromWorkout.template_items.length - 1));
    return { exerciseIndex: nextExerciseIndex, setIndex: nextExerciseIndex === fromWorkout.current_exercise_index ? fromWorkout.current_set_index + 1 : 0 };
  }

  async function handleLogSet() {
    if (!currentItem) return;
    setSaving(true);
    setError(null);
    try {
      const setForItem = workout.logged_sets.filter((item) => item.template_item === currentItem.id).length + 1;
      const nextLoggedSets: WorkoutLoggedSet[] = [
        ...workout.logged_sets,
        {
          exercise: currentItem.exercise,
          template_item: currentItem.id,
          set_number: setForItem,
          weight: toOptionalNumber(weight),
          reps: Math.max(1, Math.round(toRequiredNumber(reps, currentItem.target_reps_low ?? 1))),
          rpe: toOptionalNumber(rpe),
          notes: setNotes,
        },
      ];
      const position = nextPosition(workout);
      const updated = await persist({ current_exercise_index: position.exerciseIndex, current_set_index: position.setIndex, logged_sets: nextLoggedSets, notes: workoutNotes });
      resetSetInputs(updated.template_items[position.exerciseIndex] ?? currentItem);
      if (currentItem.rest_seconds) setRestRemaining(currentItem.rest_seconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log set.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkipSet() {
    setSaving(true);
    setError(null);
    try {
      const position = nextPosition(workout);
      const updated = await persist({ current_exercise_index: position.exerciseIndex, current_set_index: position.setIndex, notes: workoutNotes });
      resetSetInputs(updated.template_items[position.exerciseIndex] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to skip set.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreviousSet() {
    setSaving(true);
    setError(null);
    try {
      const previousExerciseIndex = workout.current_set_index > 0 ? workout.current_exercise_index : Math.max(0, workout.current_exercise_index - 1);
      const previousItem = workout.template_items[previousExerciseIndex] ?? null;
      const previousSetIndex = workout.current_set_index > 0 ? workout.current_set_index - 1 : Math.max(0, (previousItem?.target_sets ?? 1) - 1);
      const updated = await persist({ current_exercise_index: previousExerciseIndex, current_set_index: previousSetIndex, notes: workoutNotes });
      resetSetInputs(updated.template_items[previousExerciseIndex] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to move back.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddExtraSet() {
    if (!currentItem) return;
    setSaving(true);
    setError(null);
    try {
      await persist({ current_set_index: currentItem.target_sets, notes: workoutNotes });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add extra set.");
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    const confirmed = window.confirm("Finish this workout and save logged sets to your gym history?");
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await persist({ notes: workoutNotes });
      const session = await api.activeWorkout.complete();
      await Promise.resolve(onCompleted(session));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to finish workout.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm("Cancel this workout? Logged in-progress sets will be discarded.");
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await api.activeWorkout.cancel();
      await Promise.resolve(onCancelled());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel workout.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto overscroll-contain pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:w-[min(94vw,64rem)] md:max-h-[90vh] md:pb-6">
        <SheetHeader>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Active workout</p>
          <SheetTitle>{workout.template_summary?.name ?? "Workout"}</SheetTitle>
          <SheetDescription>{workout.logged_sets.length} sets logged / started {formatWorkoutStartedAt(workout.started_at)}</SheetDescription>
        </SheetHeader>
        <div className="mb-4 rounded-3xl border border-border bg-bg-base/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                <span>{progress.exerciseLabel}</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-card">
                <div className="h-full rounded-full bg-amber transition-all" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => onOpenChange(false)} disabled={saving}>
                Close / resume later
              </Button>
              <Button type="button" variant="danger" className="rounded-2xl" onClick={handleCancel} disabled={saving}>
                <X className="h-4 w-4" />
                Cancel workout
              </Button>
            </div>
          </div>
        </div>

        {currentItem ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-amber bg-amber-muted p-4 text-amber">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em]">Exercise {workout.current_exercise_index + 1} of {workout.template_items.length}</p>
                  <h3 className="mt-1 text-2xl font-semibold">{currentItem.exercise_name}</h3>
                  <p className="mt-1 text-sm opacity-90">{currentItem.primary_muscle_group_name} / {currentItem.equipment ? labelize(currentItem.equipment) : "No equipment"} / {currentItem.movement_pattern ? labelize(currentItem.movement_pattern) : "No pattern"}</p>
                </div>
                <div className="rounded-2xl border border-amber bg-bg-card px-4 py-3 text-right text-amber">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] opacity-80">Now</p>
                  <p className="metric-number text-lg font-bold">{setNumberLabel}</p>
                </div>
              </div>
              <p className="mt-3 text-sm opacity-90">{currentItem.last_session_summary_label}</p>
            </div>

            {restRemaining > 0 ? (
              <div className="rounded-3xl border border-green bg-green-muted p-4 text-green">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Timer className="h-5 w-5" />
                    <div>
                      <p className="text-sm font-semibold">Rest countdown</p>
                      <p className="metric-number text-2xl font-bold">{formatRest(restRemaining)}</p>
                    </div>
                  </div>
                  <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => setRestRemaining(0)}>Skip rest</Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
              <div className="space-y-4 rounded-3xl border border-border bg-bg-base/40 p-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <WorkoutCue label="Target" value={targetLabel(currentItem)} />
                  <WorkoutCue label="Weight" value={currentItem.suggested_weight != null ? `${currentItem.suggested_weight} kg` : "Open"} />
                  <WorkoutCue label="Rest" value={currentItem.rest_seconds ? `${currentItem.rest_seconds}s` : "As needed"} />
                  <WorkoutCue label="Logged" value={String(workout.logged_sets.filter((item) => item.template_item === currentItem.id).length)} />
                </div>
                {currentItem.notes ? <p className="rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">{currentItem.notes}</p> : null}
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Weight / Load"><Input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="0 bodyweight" className="h-14 text-lg focus:border-amber focus:ring-amber/20" /></Field>
                  <Field label="Actual reps"><Input inputMode="numeric" value={reps} onChange={(event) => setReps(event.target.value)} required className="metric-number h-14 text-xl font-bold focus:border-amber focus:ring-amber/20" /></Field>
                  <Field label="RPE"><Input inputMode="decimal" value={rpe} onChange={(event) => setRpe(event.target.value)} placeholder="1-10" className="h-14 text-lg focus:border-amber focus:ring-amber/20" /></Field>
                </div>
                <OptionalNotesField
                  label="Workout notes"
                  value={workoutNotes}
                  onChange={setWorkoutNotes}
                  collapsedLabel="+ Add workout notes"
                  placeholder="Overall notes"
                  helperText="Optional context for this guided workout."
                />
                <OptionalNotesField
                  label="Set notes"
                  value={setNotes}
                  onChange={setSetNotes}
                  collapsedLabel="+ Add set notes"
                  placeholder="How the set felt, pain, setup, or next target."
                  helperText="Set notes are saved with the next logged set."
                />
                {error ? <p className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">{error}</p> : null}
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  <Button type="button" variant="secondary" className="rounded-2xl" onClick={handlePreviousSet} disabled={saving || (workout.current_exercise_index === 0 && workout.current_set_index === 0)}>Previous</Button>
                  <Button type="button" variant="secondary" className="rounded-2xl" onClick={handleSkipSet} disabled={saving}>Skip set</Button>
                  <Button type="button" variant="secondary" className="rounded-2xl" onClick={handleAddExtraSet} disabled={saving}>Extra set</Button>
                  <Button type="button" className="col-span-2 h-12 rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20 md:col-span-2" onClick={handleLogSet} disabled={saving || !reps}>{saving ? "Saving..." : "Log set and next"}</Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-border bg-bg-base/40 p-4">
                  <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Form cues</p>
                  {currentItem.references.length === 0 ? (
                    <p className="mt-3 rounded-2xl border border-dashed border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">No form videos saved for this exercise yet.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {currentItem.references.slice(0, 3).map((reference) => (
                        <ReferencePreview key={reference.id} reference={reference} showControls={false} onPreview={() => setPreviewReference(reference)} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-3xl border border-border bg-bg-base/40 p-4">
                  <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Review summary</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <WorkoutCue label="Sets logged" value={String(workout.logged_sets.length)} />
                    <WorkoutCue label="Volume" value={loggedVolume > 0 ? `${loggedVolume.toFixed(0)} kg` : "--"} />
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                    <Button type="button" variant="danger" className="rounded-2xl" onClick={handleCancel} disabled={saving}><X className="h-4 w-4" />Cancel workout</Button>
                    <Button type="button" className="rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={handleComplete} disabled={saving || workout.logged_sets.length === 0}>Finish workout</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-border bg-bg-elevated p-5 text-sm leading-6 text-text-secondary">This active workout has no routine exercises.</div>
        )}

        <WorkoutYoutubePreviewSheet reference={previewReference} open={previewReference !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setPreviewReference(null); }} />
      </SheetContent>
    </Sheet>
  );
}

function WorkoutYoutubePreviewSheet({ reference, open, onOpenChange }: { reference: ExerciseReference | null; open: boolean; onOpenChange: (open: boolean) => void }) {
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
              <iframe className="h-full w-full" src={preview.embedUrl} title={reference.title || "YouTube preview"} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
            </div>
            <p className="rounded-2xl border border-border bg-bg-elevated p-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{referenceKindLabel(reference.url)}</p>
            <Button asChild variant="secondary" className="h-11 w-full rounded-2xl border-amber bg-amber-muted text-amber hover:bg-amber/20">
              <a href={reference.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Open in YouTube</a>
            </Button>
          </div>
        ) : <p className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm text-text-secondary">Open this cue in the source app or website.</p>}
      </SheetContent>
    </Sheet>
  );
}

function TemplateMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-bg-card p-3"><p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{label}</p><p className="metric-number mt-1 text-sm font-bold text-text-primary">{value}</p></div>;
}

function WorkoutCue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-bg-elevated p-3"><p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{label}</p><p className="metric-number mt-1 text-sm font-bold text-text-primary">{value}</p></div>;
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={cn("block space-y-2", className)}><span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">{label}</span>{children}</label>;
}

function templateItemToDraft(item: WorkoutTemplateExercise): TemplateItemDraft {
  return {
    key: String(item.id),
    exerciseId: String(item.exercise),
    targetSets: String(item.target_sets),
    targetRepsLow: item.target_reps_low != null ? String(item.target_reps_low) : "",
    targetRepsHigh: item.target_reps_high != null ? String(item.target_reps_high) : "",
    suggestedWeight: item.suggested_weight != null ? String(item.suggested_weight) : "",
    restSeconds: item.rest_seconds != null ? String(item.rest_seconds) : "",
    notes: item.notes,
  };
}

function newTemplateItemDraft(exerciseId: number): TemplateItemDraft {
  return {
    key: crypto.randomUUID(),
    exerciseId: String(exerciseId),
    targetSets: "3",
    targetRepsLow: "8",
    targetRepsHigh: "10",
    suggestedWeight: "",
    restSeconds: "90",
    notes: "",
  };
}

function mergeExercises(...exerciseGroups: Exercise[][]) {
  const seen = new Set<number>();
  return exerciseGroups.flat().filter((exercise) => {
    if (seen.has(exercise.id)) return false;
    seen.add(exercise.id);
    return true;
  });
}

function exerciseOptionsForItem(exercises: Exercise[], items: TemplateItemDraft[], item: TemplateItemDraft) {
  const usedByOtherItems = new Set(items.filter((current) => current.key !== item.key).map((current) => current.exerciseId));
  return exercises.filter((exercise) => String(exercise.id) === item.exerciseId || !usedByOtherItems.has(String(exercise.id)));
}

function itemValidationMessages(item: TemplateItemDraft, exerciseLookup: Map<number, Exercise>, allItems: TemplateItemDraft[]) {
  const messages: string[] = [];
  const duplicateCount = allItems.filter((current) => current.exerciseId && current.exerciseId === item.exerciseId).length;
  const targetSets = draftNumber(item.targetSets);
  const repsLow = draftNumber(item.targetRepsLow);
  const repsHigh = draftNumber(item.targetRepsHigh);
  const restSeconds = draftNumber(item.restSeconds);

  if (!item.exerciseId || !exerciseLookup.has(Number(item.exerciseId))) {
    messages.push("Each routine item needs an active exercise.");
  }

  if (duplicateCount > 1) {
    messages.push("This exercise is already in the routine.");
  }

  if (targetSets === null || targetSets < 1) {
    messages.push("Target sets must be at least 1.");
  }

  if (repsLow !== null && repsLow < 1) {
    messages.push("Reps low must be at least 1.");
  }

  if (repsHigh !== null && repsHigh < 1) {
    messages.push("Reps high must be at least 1.");
  }

  if (repsLow !== null && repsHigh !== null && repsLow > repsHigh) {
    messages.push("Rep low cannot be greater than rep high.");
  }

  if (restSeconds !== null && restSeconds < 0) {
    messages.push("Rest seconds must be zero or greater.");
  }

  return messages;
}

function templateValidationMessages(name: string, splitType: string, items: TemplateItemDraft[], hasInvalidExercises: boolean, hasDuplicateExercises: boolean) {
  const messages: string[] = [];

  if (!name.trim()) messages.push("Add a routine name before saving.");
  if (!splitType) messages.push("Choose a split before saving.");
  if (items.length === 0) messages.push("Add at least one exercise before saving.");
  if (hasInvalidExercises) messages.push("Each routine item needs an active exercise. Archived exercises cannot be added to new routines.");
  if (hasDuplicateExercises) messages.push("Each exercise can only appear once in a routine for now.");

  for (const item of items) {
    const targetSets = draftNumber(item.targetSets);
    const repsLow = draftNumber(item.targetRepsLow);
    const repsHigh = draftNumber(item.targetRepsHigh);
    const restSeconds = draftNumber(item.restSeconds);

    if (targetSets === null || targetSets < 1) messages.push("Target sets must be at least 1.");
    if (repsLow !== null && repsHigh !== null && repsLow > repsHigh) messages.push("Rep low cannot be greater than rep high.");
    if (repsLow !== null && repsLow < 1) messages.push("Reps low must be at least 1.");
    if (repsHigh !== null && repsHigh < 1) messages.push("Reps high must be at least 1.");
    if (restSeconds !== null && restSeconds < 0) messages.push("Rest seconds must be zero or greater.");
  }

  return Array.from(new Set(messages));
}

function draftNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toOptionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toRequiredNumber(value: string, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function labelize(value: string) {
  if (!value) return "None";
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function targetLabel(item: WorkoutTemplateExercise) {
  if (item.target_reps_low && item.target_reps_high) return `${item.target_sets} x ${item.target_reps_low}-${item.target_reps_high}`;
  if (item.target_reps_low) return `${item.target_sets} x ${item.target_reps_low}`;
  return `${item.target_sets} sets`;
}

function initialItem(workout: ActiveWorkout) {
  return workout.template_items[Math.min(workout.current_exercise_index, Math.max(0, workout.template_items.length - 1))] ?? null;
}

function initialWeight(workout: ActiveWorkout) {
  const item = initialItem(workout);
  return item?.suggested_weight != null ? String(item.suggested_weight) : "";
}

function initialReps(workout: ActiveWorkout) {
  const item = initialItem(workout);
  return item?.target_reps_low != null ? String(item.target_reps_low) : "";
}

function workoutProgress(workout: ActiveWorkout) {
  const totalExercises = workout.template_items.length;
  const currentIndex = Math.min(workout.current_exercise_index, Math.max(0, totalExercises - 1));
  const currentItem = workout.template_items[currentIndex] ?? null;
  const totalTargetSets = workout.template_items.reduce((sum, item) => sum + Math.max(1, item.target_sets), 0);
  const percent = Math.min(100, Math.round((workout.logged_sets.length / Math.max(1, totalTargetSets)) * 100));
  const targetSetCount = Math.max(1, currentItem?.target_sets ?? 1);
  const currentSet = currentItem ? Math.min(workout.current_set_index + 1, targetSetCount) : 0;

  return {
    currentExercise: currentItem?.exercise_name ?? null,
    exerciseLabel: currentItem ? `Exercise ${currentIndex + 1} of ${totalExercises} / Set ${currentSet} of ${targetSetCount}` : "No routine exercises",
    percent,
  };
}

function formatRest(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatWorkoutStartedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
