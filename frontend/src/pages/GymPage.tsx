import {
  Archive,
  Dumbbell,
  ExternalLink,
  type LucideIcon,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { QuickLogSheet } from "@/components/app/QuickLogSheet";
import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { ExerciseReferenceViewer } from "@/components/gym/ExerciseReferenceViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  type GymAnalytics,
  type GymSetInput,
  type GymSession,
  type MuscleGroup,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";
import { detectReferenceSource, externalReferenceLabel, getYouTubePreview, sourceBadgeClasses, sourceLabels } from "@/lib/video";

const movementOptions = ["", "push", "pull", "squat", "hinge", "lunge", "carry", "rotation", "isolation", "core", "other"];
const equipmentOptions = ["", "barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "other"];
const splitOptions = ["push", "pull", "legs", "upper", "lower", "full_body", "custom"];

const selectClass = "h-10 rounded-xl border border-border bg-bg-elevated px-3 text-sm text-text-primary outline-none transition focus:border-amber focus:ring-2 focus:ring-amber/20";
const textareaClass = "min-h-24 rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-amber focus:ring-2 focus:ring-amber/20";

export function GymPage() {
  const [sessions, setSessions] = useState<GymSession[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [analytics, setAnalytics] = useState<GymAnalytics | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [previewReference, setPreviewReference] = useState<ExerciseReference | null>(null);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogExerciseId, setQuickLogExerciseId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData(selectedId = selectedExerciseId) {
    setLoading(true);
    setError(null);
    try {
      const [sessionData, exerciseData, muscleData, analyticsData] = await Promise.all([
        api.gymSessions.list(),
        api.exercises.list(),
        api.muscleGroups.list(),
        api.gymAnalytics.get(),
      ]);
      setSessions(sessionData);
      setExercises(exerciseData);
      setMuscleGroups(muscleData);
      setAnalytics(analyticsData);
      if (selectedId && !exerciseData.some((exercise) => exercise.id === selectedId)) {
        setSelectedExerciseId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load gym dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function loadInitial() {
      setLoading(true);
      setError(null);
      try {
        const [sessionData, exerciseData, muscleData, analyticsData] = await Promise.all([
          api.gymSessions.list(),
          api.exercises.list(),
          api.muscleGroups.list(),
          api.gymAnalytics.get(),
        ]);
        if (!active) return;
        setSessions(sessionData);
        setExercises(exerciseData);
        setMuscleGroups(muscleData);
        setAnalytics(analyticsData);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load gym dashboard.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      active = false;
    };
  }, []);

  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null;
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Gym"
        title="Strength Dashboard"
        description="Track split rhythm, muscle coverage, exercise performance, and form references."
      />
      <section className="mt-7 space-y-4 md:mt-8 md:space-y-5">
        {loading ? <StateCard message="Loading gym dashboard..." /> : null}
        {error ? <StateCard message={error} tone="error" /> : null}
        {!loading && !error && analytics ? (
          <>
            <GymHero analytics={analytics} />
            <MetricGrid analytics={analytics} />
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <MuscleCoverageCard analytics={analytics} />
              <SplitDistributionCard analytics={analytics} />
            </div>
            <ExerciseReferenceViewer
              exercises={exercises}
              onChanged={() => loadData(selectedExerciseId)}
              onLogSet={(exerciseId) => {
                setQuickLogExerciseId(exerciseId ?? null);
                setQuickLogOpen(true);
              }}
              onOpenExercise={setSelectedExerciseId}
            />
            <RecentSessions sessions={sessions} onEditSession={setSelectedSessionId} />
          </>
        ) : null}
      </section>

      <ExerciseDetailSheet
        exercise={selectedExercise}
        muscleGroups={muscleGroups}
        open={selectedExercise !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedExerciseId(null);
        }}
        onChanged={() => loadData(selectedExercise?.id ?? null)}
        onPreviewReference={setPreviewReference}
      />
      <SessionEditSheet
        session={selectedSession}
        exercises={exercises}
        open={selectedSession !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSessionId(null);
        }}
        onChanged={() => loadData(selectedExerciseId)}
      />
      <YoutubePreviewSheet
        reference={previewReference}
        open={previewReference !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewReference(null);
        }}
      />
      <QuickLogSheet
        open={quickLogOpen}
        onOpenChange={setQuickLogOpen}
        initialMode="gym"
        initialGymExerciseId={quickLogExerciseId}
        onSaved={() => loadData(selectedExerciseId)}
      />
    </>
  );
}

function GymHero({ analytics }: { analytics: GymAnalytics }) {
  const topCoverage = topMuscleCoverage(analytics);
  const needsAttention = analytics.muscle_coverage_this_week
    .filter((item) => item.total_set_count === 0 && ["Back", "Chest", "Quads", "Hamstrings", "Glutes", "Core"].includes(item.muscle_group_name))
    .slice(0, 3)
    .map((item) => item.muscle_group_name);

  if (analytics.summary.total_sessions === 0) {
    return (
      <Card className="overflow-hidden p-0 shadow-amber" delay={0.01}>
        <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Strength dashboard</p>
          <h2 className="mt-1 text-xl font-semibold text-text-primary">No gym sessions yet</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Log your first session from Quick Log, then TrainOS will start mapping muscle coverage and exercise performance.</p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3 md:p-6">
          <DashboardMetric label="Sessions this week" value="0" />
          <DashboardMetric label="Sets this week" value="0" />
          <DashboardMetric label="Exercises used" value="0" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0 shadow-amber" delay={0.01}>
      <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Strength dashboard</p>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">
              This week: {analytics.summary.sessions_this_week} sessions / {analytics.summary.sets_this_week} sets
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Most trained: {topCoverage ? topCoverage.muscle_group_name : "No coverage yet"}
              {needsAttention.length ? ` / Needs attention: ${needsAttention.join(", ")}` : ""}
            </p>
          </div>
          <div className="rounded-2xl border border-amber bg-amber-muted p-3 text-amber shadow-amber">
            <Dumbbell className="h-5 w-5" />
          </div>
        </div>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-3 md:p-6">
        {analytics.deterministic_insights.slice(0, 3).map((insight) => (
          <p key={insight} className="rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">{insight}</p>
        ))}
      </div>
    </Card>
  );
}

function MetricGrid({ analytics }: { analytics: GymAnalytics }) {
  const topCoverage = topMuscleCoverage(analytics);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 md:gap-4">
      <DashboardMetric label="Sessions week" value={String(analytics.summary.sessions_this_week)} subvalue={`${analytics.summary.sessions_this_month} month`} />
      <DashboardMetric label="Sets week" value={String(analytics.summary.sets_this_week)} subvalue={`${analytics.summary.sets_this_month} month`} />
      <DashboardMetric label="Total sessions" value={String(analytics.summary.total_sessions)} />
      <DashboardMetric label="Total sets" value={String(analytics.summary.total_sets)} />
      <DashboardMetric label="Exercises used" value={String(analytics.summary.total_exercises_used)} />
      <DashboardMetric label="Top muscle" value={topCoverage?.muscle_group_name ?? "--"} subvalue={topCoverage ? `${topCoverage.total_set_count} sets` : "No sets"} />
    </div>
  );
}

function MuscleCoverageCard({ analytics }: { analytics: GymAnalytics }) {
  const sorted = [...analytics.muscle_coverage_this_week].sort((a, b) => b.total_set_count - a.total_set_count);
  const maxSets = Math.max(1, ...sorted.map((item) => item.total_set_count));

  return (
    <Card>
      <SectionTitle icon={ShieldCheck} eyebrow="Muscle coverage" title="This week's training map" />
      <div className="mt-4 space-y-2">
        {sorted.map((item) => (
          <div key={item.muscle_group_id} className="rounded-2xl border border-border bg-bg-elevated p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">{item.muscle_group_name}</p>
                <p className="mt-1 text-xs text-text-muted">Primary {item.primary_set_count} / secondary {item.secondary_set_count}</p>
              </div>
              <span className={cn("metric-number text-sm font-bold", item.total_set_count > 0 ? "text-amber" : "text-text-muted")}>{item.total_set_count}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-card">
              <div className="h-full rounded-full bg-amber transition-all" style={{ width: `${barWidth(item.total_set_count, maxSets)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SplitDistributionCard({ analytics }: { analytics: GymAnalytics }) {
  const maxCount = Math.max(1, ...analytics.split_distribution_this_month.map((item) => item.session_count));

  return (
    <Card>
      <SectionTitle icon={Sparkles} eyebrow="Split distribution" title="This month's structure" />
      <div className="mt-4 space-y-2">
        {analytics.split_distribution_this_month.map((item) => (
          <div key={item.split_type} className="rounded-2xl border border-border bg-bg-elevated p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold capitalize text-text-primary">{labelize(item.split_type)}</p>
              <p className={cn("metric-number text-sm font-bold", item.session_count > 0 ? "text-amber" : "text-text-muted")}>{item.session_count}</p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-card">
              <div className="h-full rounded-full bg-amber transition-all" style={{ width: `${barWidth(item.session_count, maxCount)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-border bg-bg-elevated p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Top by sets</p>
        <div className="mt-3 space-y-2">
          {analytics.top_exercises_by_sets.length ? analytics.top_exercises_by_sets.map((item) => (
            <div key={item.exercise_id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-text-secondary">{item.exercise_name}</span>
              <span className="metric-number font-bold text-text-primary">{item.set_count}</span>
            </div>
          )) : <p className="text-sm text-text-secondary">No exercise set data yet.</p>}
        </div>
      </div>
    </Card>
  );
}

function ExerciseDetailSheet({
  exercise,
  muscleGroups,
  open,
  onOpenChange,
  onChanged,
  onPreviewReference,
}: {
  exercise: Exercise | null;
  muscleGroups: MuscleGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  onPreviewReference: (reference: ExerciseReference) => void;
}) {
  const [editingReference, setEditingReference] = useState<ExerciseReference | null>(null);
  const [editingExercise, setEditingExercise] = useState(false);
  const [archiving, setArchiving] = useState(false);

  if (!exercise) return null;
  const exerciseId = exercise.id;

  async function handleArchive() {
    const confirmed = window.confirm("Archive this exercise? It will disappear from active lists and quick log, but old sessions stay intact.");
    if (!confirmed) return;
    setArchiving(true);
    try {
      await api.exercises.archive(exerciseId);
      onChanged();
      onOpenChange(false);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setEditingReference(null);
          setEditingExercise(false);
        }
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent className="overflow-y-auto md:w-[min(92vw,52rem)]">
        <SheetHeader>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Exercise detail</p>
          <SheetTitle>{exercise.name}</SheetTitle>
          <SheetDescription>{exercise.primary_muscle_group_name} / {exercise.equipment ? labelize(exercise.equipment) : "No equipment set"} / {exercise.movement_pattern ? labelize(exercise.movement_pattern) : "No pattern set"}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => setEditingExercise((value) => !value)}>
              <Pencil className="h-4 w-4" />
              {editingExercise ? "Close editor" : "Edit exercise"}
            </Button>
            <Button type="button" variant="danger" className="rounded-2xl" onClick={handleArchive} disabled={archiving}>
              <Archive className="h-4 w-4" />
              {archiving ? "Archiving..." : "Archive"}
            </Button>
          </div>

          {editingExercise ? (
            <ExerciseEditForm
              exercise={exercise}
              muscleGroups={muscleGroups}
              onCancel={() => setEditingExercise(false)}
              onSaved={() => {
                setEditingExercise(false);
                onChanged();
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MiniMetric label="References" value={String(exercise.reference_count)} />
                <MiniMetric label="Recent sets" value={String(exercise.recent_set_count)} />
                <MiniMetric label={exercise.best_weight ? "Best weight" : "Best reps"} value={exercise.best_weight ? String(exercise.best_weight) : String(exercise.best_reps ?? "--")} unit={exercise.best_weight ? "kg" : undefined} />
                <MiniMetric label="Est. 1RM" value={exercise.best_estimated_1rm ? exercise.best_estimated_1rm.toFixed(1) : "--"} unit={exercise.best_estimated_1rm ? "kg" : undefined} />
              </div>

              <DetailSection eyebrow="Last performed" title="Training context">
                <p className="rounded-2xl border border-amber bg-amber-muted p-3 text-sm leading-6 text-amber">{exercise.last_session_summary_label}</p>
              </DetailSection>

              <DetailSection eyebrow="Overview" title="Form notes">
                {exercise.form_notes ? (
                  <p className="text-sm leading-6 text-text-secondary">{exercise.form_notes}</p>
                ) : (
                  <p className="text-sm leading-6 text-text-muted">No form notes yet. Add cues when this exercise needs specific setup reminders.</p>
                )}
              </DetailSection>
            </>
          )}

          <DetailSection eyebrow="Reference links" title="Video and form library">
            {exercise.references.length === 0 ? (
              <p className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">
                No exercise references yet. Add a YouTube, Reel, TikTok, or website link for form cues.
              </p>
            ) : (
              <div className="space-y-2">
                {exercise.references.map((reference) => (
                  <ReferenceCard
                    key={reference.id}
                    reference={reference}
                    onPreview={() => onPreviewReference(reference)}
                    onEdit={() => setEditingReference(reference)}
                    onDelete={async () => {
                      await api.exerciseReferences.delete(reference.id);
                      onChanged();
                    }}
                  />
                ))}
              </div>
            )}
          </DetailSection>

          <ReferenceForm
            key={editingReference?.id ?? "new-reference"}
            exercise={exercise}
            reference={editingReference}
            onCancel={() => setEditingReference(null)}
            onSaved={() => {
              setEditingReference(null);
              onChanged();
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ExerciseEditForm({ exercise, muscleGroups, onCancel, onSaved }: { exercise: Exercise; muscleGroups: MuscleGroup[]; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(exercise.name);
  const [primaryGroup, setPrimaryGroup] = useState(String(exercise.primary_muscle_group));
  const [secondaryGroups, setSecondaryGroups] = useState<number[]>(exercise.secondary_muscle_groups);
  const [equipment, setEquipment] = useState(exercise.equipment);
  const [movement, setMovement] = useState(exercise.movement_pattern);
  const [formNotes, setFormNotes] = useState(exercise.form_notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSecondary(groupId: number) {
    setSecondaryGroups((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.exercises.update(exercise.id, {
        name,
        primary_muscle_group: Number(primaryGroup),
        secondary_muscle_groups: secondaryGroups,
        equipment,
        movement_pattern: movement,
        form_notes: formNotes,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update exercise.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4 rounded-3xl border border-amber bg-amber-muted p-4" onSubmit={handleSubmit}>
      <div className="border-b border-border pb-3">
        <p className="text-[0.68rem] uppercase tracking-[0.2em] text-amber">Edit exercise</p>
        <p className="mt-1 text-sm text-text-secondary">Keep setup, muscle mapping, and form cues accurate.</p>
      </div>
      <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required className="focus:border-amber focus:ring-amber/20" /></Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Primary muscle">
          <select className={selectClass} value={primaryGroup} onChange={(event) => setPrimaryGroup(event.target.value)}>
            {muscleGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </Field>
        <Field label="Equipment">
          <select className={selectClass} value={equipment} onChange={(event) => setEquipment(event.target.value)}>
            {equipmentOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
          </select>
        </Field>
        <Field label="Pattern">
          <select className={selectClass} value={movement} onChange={(event) => setMovement(event.target.value)}>
            {movementOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
          </select>
        </Field>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Secondary muscles</p>
        <div className="flex flex-wrap gap-2">
          {muscleGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                secondaryGroups.includes(group.id) ? "border-amber bg-amber-muted text-amber" : "border-border bg-bg-elevated text-text-secondary",
              )}
              onClick={() => toggleSecondary(group.id)}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>
      <Field label="Form notes"><textarea className={textareaClass} value={formNotes} onChange={(event) => setFormNotes(event.target.value)} placeholder="Setup cues, range of motion, tempo, or common mistakes." /></Field>
      {error ? <p className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" className="rounded-2xl" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="rounded-2xl" disabled={saving || !name}>{saving ? "Saving..." : "Save exercise"}</Button>
      </div>
    </form>
  );
}

function ReferenceCard({ reference, onPreview, onEdit, onDelete }: { reference: ExerciseReference; onPreview: () => void; onEdit: () => void; onDelete: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);
  const youtubePreview = getYouTubePreview(reference.url);
  const canPreview = reference.source === "youtube" && youtubePreview !== null;
  const sourceLabel = canPreview ? sourceLabels[reference.source] : externalReferenceLabel(reference.source);

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em]", sourceBadgeClasses[reference.source])}>{sourceLabel}</span>
          <p className="mt-2 truncate text-sm font-semibold text-text-primary">{reference.title || reference.url}</p>
          {reference.notes ? <p className="mt-1 text-xs leading-5 text-text-secondary">{reference.notes}</p> : null}
          {!canPreview ? <p className="mt-2 text-xs text-text-muted">Open externally to view this cue.</p> : null}
        </div>
        <div className="flex gap-2">
          {canPreview ? (
            <Button type="button" variant="secondary" size="sm" className="h-9 rounded-xl border-amber bg-amber-muted text-amber hover:bg-amber/20" onClick={onPreview}>
              <Play className="h-3.5 w-3.5" />
              Preview
            </Button>
          ) : null}
          <a
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition",
              canPreview ? "border-border bg-bg-elevated text-text-primary hover:border-text-muted" : "border-amber bg-amber-muted text-amber hover:bg-amber/20",
            )}
            href={reference.url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
          <Button type="button" variant="secondary" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" variant="danger" size="icon" onClick={handleDelete} disabled={deleting}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReferenceForm({ exercise, reference, onCancel, onSaved }: { exercise: Exercise; reference: ExerciseReference | null; onCancel: () => void; onSaved: () => void }) {
  const [url, setUrl] = useState(reference?.url ?? "");
  const [source, setSource] = useState<ExerciseReferenceSource>(reference?.source ?? "youtube");
  const [sourceTouched, setSourceTouched] = useState(Boolean(reference));
  const [title, setTitle] = useState(reference?.title ?? "");
  const [notes, setNotes] = useState(reference?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleUrlChange(value: string) {
    setUrl(value);
    if (!sourceTouched) {
      setSource(detectReferenceSource(value));
    }
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
      if (!reference) {
        setUrl("");
        setTitle("");
        setNotes("");
        setSource("youtube");
        setSourceTouched(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save reference.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4 rounded-3xl border border-amber bg-amber-muted p-4" onSubmit={handleSubmit}>
      <div className="border-b border-border pb-3">
        <p className="text-[0.68rem] uppercase tracking-[0.2em] text-amber">{reference ? "Edit reference" : "Add reference"}</p>
        <p className="mt-1 text-sm text-text-secondary">Store the URL and your cues only. TrainOS does not download or scrape videos.</p>
      </div>
      <Field label="URL">
        <Input value={url} onChange={(event) => handleUrlChange(event.target.value)} required placeholder="https://youtube.com/shorts/..." className="focus:border-amber focus:ring-amber/20" />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Source">
          <select
            className={selectClass}
            value={source}
            onChange={(event) => {
              setSource(event.target.value as ExerciseReferenceSource);
              setSourceTouched(true);
            }}
          >
            {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Strict pull-up cue" className="focus:border-amber focus:ring-amber/20" />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What should you remember before this lift?" />
      </Field>
      {error ? <p className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">{error}</p> : null}
      <div className={cn("grid gap-3", reference ? "grid-cols-2" : "grid-cols-1")}>
        {reference ? <Button type="button" variant="secondary" className="rounded-2xl" onClick={onCancel}>Cancel</Button> : null}
        <Button type="submit" className="rounded-2xl" disabled={saving || !url}>{saving ? "Saving..." : reference ? "Save changes" : "Save reference"}</Button>
      </div>
    </form>
  );
}

function RecentSessions({ sessions, onEditSession }: { sessions: GymSession[]; onEditSession: (id: number) => void }) {
  return (
    <div className="space-y-3">
      <SectionHeader label="Recent sessions" description="Split sessions remain visible below the dashboard." />
      {sessions.length === 0 ? <StateCard message="No gym sessions yet. Log your first session from Quick Log." /> : null}
      {sessions.map((session, index) => (
        <Card key={session.id} delay={index * 0.04}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{formatShortDate(session.date)}</p>
              <h2 className="mt-1 text-lg font-semibold capitalize text-text-primary">{labelize(session.split_type)}</h2>
              <p className="mt-1 text-sm text-text-secondary">{session.exercise_names.join(", ") || "No exercises"}</p>
            </div>
            <div className="rounded-2xl border border-amber bg-amber-muted p-3 text-amber">
              <Dumbbell className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Sets logged" value={String(session.set_count)} />
            <Metric label="Duration" value={session.duration_minutes ? String(session.duration_minutes) : "--"} unit={session.duration_minutes ? "min" : undefined} />
          </div>
          <Button type="button" variant="secondary" className="mt-4 h-10 w-full rounded-2xl" onClick={() => onEditSession(session.id)}>
            <Pencil className="h-4 w-4" />
            Edit session
          </Button>
        </Card>
      ))}
    </div>
  );
}

type EditableGymSet = {
  exercise: string;
  reps: string;
  weight: string;
  rpe: string;
  notes: string;
};

function SessionEditSheet({ session, exercises, open, onOpenChange, onChanged }: { session: GymSession | null; exercises: Exercise[]; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  if (!session) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto md:w-[min(92vw,52rem)]">
        <SheetHeader>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Edit session</p>
          <SheetTitle>{labelize(session.split_type)} session</SheetTitle>
          <SheetDescription>Edit sets, remove rows, or delete the session. Exercise objects are never deleted from here.</SheetDescription>
        </SheetHeader>
        <SessionEditForm
          key={session.id}
          session={session}
          exercises={exercises}
          onSaved={() => {
            onChanged();
            onOpenChange(false);
          }}
          onDeleted={() => {
            onChanged();
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function SessionEditForm({ session, exercises, onSaved, onDeleted }: { session: GymSession; exercises: Exercise[]; onSaved: () => void; onDeleted: () => void }) {
  const [date, setDate] = useState(session.date);
  const [splitType, setSplitType] = useState(session.split_type);
  const [duration, setDuration] = useState(session.duration_minutes ? String(session.duration_minutes) : "");
  const [notes, setNotes] = useState(session.notes);
  const [sets, setSets] = useState<EditableGymSet[]>(
    session.sets.map((gymSet) => ({
      exercise: String(gymSet.exercise),
      reps: String(gymSet.reps),
      weight: gymSet.weight === null ? "" : String(gymSet.weight),
      rpe: gymSet.rpe === null ? "" : String(gymSet.rpe),
      notes: gymSet.notes,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exerciseOptions = sessionExerciseOptions(exercises, session);

  function updateSet(index: number, patch: Partial<EditableGymSet>) {
    setSets((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function removeSet(index: number) {
    setSets((current) => current.filter((_item, itemIndex) => itemIndex !== index));
  }

  function addSet() {
    setSets((current) => [
      ...current,
      {
        exercise: String(exerciseOptions[0]?.id ?? ""),
        reps: "8",
        weight: "",
        rpe: "",
        notes: "",
      },
    ]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payloadSets: GymSetInput[] = sets
      .filter((item) => item.exercise && Number(item.reps) > 0)
      .map((item, index) => ({
        exercise: Number(item.exercise),
        set_number: index + 1,
        reps: Math.max(1, Math.round(Number(item.reps))),
        weight: optionalNumber(item.weight),
        rpe: optionalNumber(item.rpe),
        notes: item.notes,
      }));

    try {
      await api.gymSessions.update(session.id, {
        date,
        split_type: splitType,
        duration_minutes: optionalNumber(duration) ?? null,
        notes,
        sets: payloadSets,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update gym session.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm("Delete this gym session? This removes the session and its sets, not the exercise definitions.");
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await api.gymSessions.delete(session.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete gym session.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Date"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="focus:border-amber focus:ring-amber/20" /></Field>
        <Field label="Split">
          <select className={selectClass} value={splitType} onChange={(event) => setSplitType(event.target.value)}>
            {splitOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
          </select>
        </Field>
        <Field label="Duration"><Input inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="60 min" className="focus:border-amber focus:ring-amber/20" /></Field>
      </div>
      <Field label="Notes"><textarea className={textareaClass} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Session notes" /></Field>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Sets</p>
          <Button type="button" variant="secondary" size="sm" onClick={addSet}>
            <Plus className="h-4 w-4" />
            Add set
          </Button>
        </div>
        {sets.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm text-text-secondary">No sets remain. Add one set before saving if this session should stay useful.</div>
        ) : null}
        {sets.map((gymSet, index) => (
          <div key={`${index}-${gymSet.exercise}`} className="rounded-3xl border border-border bg-bg-elevated p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="metric-number text-sm font-bold text-amber">Set {index + 1}</p>
              <Button type="button" variant="danger" size="sm" onClick={() => removeSet(index)}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-5">
              <Field label="Exercise" className="md:col-span-2">
                <select className={selectClass} value={gymSet.exercise} onChange={(event) => updateSet(index, { exercise: event.target.value })}>
                  {exerciseOptions.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
                </select>
              </Field>
              <Field label="Reps"><Input inputMode="numeric" value={gymSet.reps} onChange={(event) => updateSet(index, { reps: event.target.value })} className="focus:border-amber focus:ring-amber/20" /></Field>
              <Field label="Weight"><Input inputMode="decimal" value={gymSet.weight} onChange={(event) => updateSet(index, { weight: event.target.value })} className="focus:border-amber focus:ring-amber/20" /></Field>
              <Field label="RPE"><Input inputMode="decimal" value={gymSet.rpe} onChange={(event) => updateSet(index, { rpe: event.target.value })} className="focus:border-amber focus:ring-amber/20" /></Field>
            </div>
            <Field label="Set notes"><Input value={gymSet.notes} onChange={(event) => updateSet(index, { notes: event.target.value })} placeholder="Optional" className="focus:border-amber focus:ring-amber/20" /></Field>
          </div>
        ))}
      </div>
      {error ? <p className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <Button type="submit" className="h-11 rounded-2xl" disabled={saving || sets.length === 0}>{saving ? "Saving..." : "Save session"}</Button>
        <Button type="button" variant="danger" className="h-11 rounded-2xl" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete session"}
        </Button>
      </div>
    </form>
  );
}

function DetailSection({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-bg-base/40 p-4">
      <p className="text-[0.65rem] uppercase tracking-[0.18em] text-text-muted">{eyebrow}</p>
      <h3 className="mt-1 text-base font-semibold text-text-primary">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, eyebrow, title }: { icon: LucideIcon; eyebrow: string; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl border border-amber bg-amber-muted p-3 text-amber">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-text-primary">{title}</h2>
      </div>
    </div>
  );
}

function SectionHeader({ label, description }: { label: string; description: string }) {
  return (
    <div>
      <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{label}</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
    </div>
  );
}

function DashboardMetric({ label, value, subvalue }: { label: string; value: string; subvalue?: string }) {
  return (
    <Card className="p-4" delay={0.03}>
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="metric-number mt-2 text-2xl font-bold text-amber">{value}</p>
      {subvalue ? <p className="mt-1 text-xs text-text-muted">{subvalue}</p> : null}
    </Card>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-3">
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="metric-number mt-1 text-sm font-bold text-text-primary">{value}{unit ? <span className="ml-1 font-sans text-xs font-normal text-text-secondary">{unit}</span> : null}</p>
    </div>
  );
}

function MiniMetric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-amber/30 bg-bg-card/70 p-2">
      <p className="text-[0.58rem] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="metric-number mt-1 text-xs font-bold text-text-primary">{value}{unit ? <span className="ml-1 font-sans text-[0.65rem] font-normal text-text-secondary">{unit}</span> : null}</p>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-2", className)}>
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function StateCard({ message, tone = "default" }: { message: string; tone?: "default" | "error" }) {
  return <Card className={tone === "error" ? "border-red bg-red-muted text-red" : "text-text-secondary"}>{message}</Card>;
}

function YoutubePreviewSheet({ reference, open, onOpenChange }: { reference: ExerciseReference | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const preview = reference?.source === "youtube" ? getYouTubePreview(reference.url) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto md:w-[min(92vw,42rem)]">
        <SheetHeader>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Video preview</p>
          <SheetTitle>{reference?.title || "YouTube reference"}</SheetTitle>
          <SheetDescription>Preview uses youtube-nocookie.com. TrainOS only stores the URL and your notes.</SheetDescription>
        </SheetHeader>
        {reference && preview ? (
          <div className="space-y-4">
            <div className={cn("overflow-hidden rounded-3xl border border-border bg-bg-elevated", preview.isShort ? "mx-auto aspect-[9/16] max-h-[70vh] w-full max-w-sm" : "aspect-video")}>
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
            {reference.notes ? <p className="rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">{reference.notes}</p> : null}
            <a className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-amber bg-amber-muted px-4 text-sm font-semibold text-amber transition hover:bg-amber/20" href={reference.url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Open in YouTube
            </a>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">
            Preview unavailable for this reference. Open it in the source app or site.
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function topMuscleCoverage(analytics: GymAnalytics) {
  const trained = analytics.muscle_coverage_this_week.filter((item) => item.total_set_count > 0);
  if (!trained.length) return null;
  return trained.sort((a, b) => b.total_set_count - a.total_set_count)[0];
}

function barWidth(value: number, maxValue: number) {
  if (value <= 0) return 0;
  return Math.max(8, (value / Math.max(1, maxValue)) * 100);
}

function optionalNumber(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sessionExerciseOptions(exercises: Exercise[], session: GymSession) {
  const options = exercises.map((exercise) => ({ id: exercise.id, name: exercise.name }));
  for (const gymSet of session.sets) {
    if (!options.some((exercise) => exercise.id === gymSet.exercise)) {
      options.push({ id: gymSet.exercise, name: `${gymSet.exercise_name} (archived)` });
    }
  }
  return options;
}

function labelize(value: string) {
  if (!value) return "None";
  return value.replaceAll("_", " ");
}
