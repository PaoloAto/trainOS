import {
  Dumbbell,
  ExternalLink,
  type LucideIcon,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/common/Card";
import { PageHeader } from "@/components/common/PageHeader";
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
  type GymSession,
  type MuscleGroup,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";

const sourceLabels: Record<ExerciseReferenceSource, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  website: "Website",
  other: "Other",
};

const sourceBadgeClasses: Record<ExerciseReferenceSource, string> = {
  youtube: "border-red bg-red-muted text-red",
  instagram: "border-indigo bg-indigo-muted text-indigo",
  tiktok: "border-border bg-bg-elevated text-text-primary",
  website: "border-green bg-green-muted text-green",
  other: "border-amber bg-amber-muted text-amber",
};

const selectClass = "h-10 rounded-xl border border-border bg-bg-elevated px-3 text-sm text-text-primary outline-none transition focus:border-amber focus:ring-2 focus:ring-amber/20";
const textareaClass = "min-h-24 rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-amber focus:ring-2 focus:ring-amber/20";

export function GymPage() {
  const [sessions, setSessions] = useState<GymSession[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [analytics, setAnalytics] = useState<GymAnalytics | null>(null);
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [equipmentFilter, setEquipmentFilter] = useState("all");
  const [movementFilter, setMovementFilter] = useState("all");
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
  const equipmentOptions = useMemo(() => uniqueOptions(exercises.map((exercise) => exercise.equipment).filter(Boolean)), [exercises]);
  const movementOptions = useMemo(() => uniqueOptions(exercises.map((exercise) => exercise.movement_pattern).filter(Boolean)), [exercises]);
  const filteredExercises = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      const matchesSearch = !query || exercise.name.toLowerCase().includes(query);
      const matchesMuscle = muscleFilter === "all" || String(exercise.primary_muscle_group) === muscleFilter;
      const matchesEquipment = equipmentFilter === "all" || exercise.equipment === equipmentFilter;
      const matchesMovement = movementFilter === "all" || exercise.movement_pattern === movementFilter;
      return matchesSearch && matchesMuscle && matchesEquipment && matchesMovement;
    });
  }, [equipmentFilter, exercises, movementFilter, muscleFilter, search]);

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
            <ExerciseLibrary
              exercises={filteredExercises}
              allExercises={exercises}
              muscleGroups={muscleGroups}
              equipmentOptions={equipmentOptions}
              movementOptions={movementOptions}
              search={search}
              muscleFilter={muscleFilter}
              equipmentFilter={equipmentFilter}
              movementFilter={movementFilter}
              onSearch={setSearch}
              onMuscleFilter={setMuscleFilter}
              onEquipmentFilter={setEquipmentFilter}
              onMovementFilter={setMovementFilter}
              onOpenExercise={setSelectedExerciseId}
            />
            <RecentSessions sessions={sessions} />
          </>
        ) : null}
      </section>

      <ExerciseDetailSheet
        exercise={selectedExercise}
        open={selectedExercise !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedExerciseId(null);
        }}
        onChanged={() => loadData(selectedExercise?.id ?? null)}
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

function ExerciseLibrary({
  exercises,
  allExercises,
  muscleGroups,
  equipmentOptions,
  movementOptions,
  search,
  muscleFilter,
  equipmentFilter,
  movementFilter,
  onSearch,
  onMuscleFilter,
  onEquipmentFilter,
  onMovementFilter,
  onOpenExercise,
}: {
  exercises: Exercise[];
  allExercises: Exercise[];
  muscleGroups: MuscleGroup[];
  equipmentOptions: string[];
  movementOptions: string[];
  search: string;
  muscleFilter: string;
  equipmentFilter: string;
  movementFilter: string;
  onSearch: (value: string) => void;
  onMuscleFilter: (value: string) => void;
  onEquipmentFilter: (value: string) => void;
  onMovementFilter: (value: string) => void;
  onOpenExercise: (id: number) => void;
}) {
  return (
    <Card className="overflow-hidden p-0" delay={0.03}>
      <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Exercise library</p>
            <h2 className="mt-1 text-lg font-semibold text-text-primary">Reference links and performance cues</h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">{allExercises.length} exercises / {allExercises.reduce((sum, exercise) => sum + exercise.reference_count, 0)} saved references</p>
          </div>
          <div className="rounded-2xl border border-amber bg-amber-muted p-3 text-amber">
            <Video className="h-5 w-5" />
          </div>
        </div>
      </div>
      <div className="space-y-4 p-5 md:p-6">
        <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input className="pl-9 focus:border-amber focus:ring-amber/20" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search exercises" />
          </div>
          <select className={selectClass} value={muscleFilter} onChange={(event) => onMuscleFilter(event.target.value)}>
            <option value="all">All muscles</option>
            {muscleGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <select className={selectClass} value={equipmentFilter} onChange={(event) => onEquipmentFilter(event.target.value)}>
            <option value="all">All equipment</option>
            {equipmentOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
          </select>
          <select className={selectClass} value={movementFilter} onChange={(event) => onMovementFilter(event.target.value)}>
            <option value="all">All patterns</option>
            {movementOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
          </select>
        </div>

        {exercises.length === 0 ? (
          <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">
            No exercises match the current filters. Create exercises from Quick Log, then add form references here.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {exercises.map((exercise) => (
              <ExerciseCard key={exercise.id} exercise={exercise} onOpen={() => onOpenExercise(exercise.id)} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ExerciseCard({ exercise, onOpen }: { exercise: Exercise; onOpen: () => void }) {
  return (
    <div className="rounded-3xl border border-border bg-bg-elevated p-4 transition hover:border-amber/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-text-primary">{exercise.name}</p>
          <p className="mt-1 text-sm text-text-secondary">{exercise.primary_muscle_group_name}</p>
        </div>
        <span className="rounded-full border border-amber bg-amber-muted px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber">
          {exercise.reference_count} refs
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {exercise.equipment ? <Chip>{labelize(exercise.equipment)}</Chip> : null}
        {exercise.movement_pattern ? <Chip>{labelize(exercise.movement_pattern)}</Chip> : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="Recent sets" value={String(exercise.recent_set_count)} />
        <MiniMetric label={exercise.best_weight ? "Best weight" : "Best reps"} value={exercise.best_weight ? String(exercise.best_weight) : String(exercise.best_reps ?? "--")} unit={exercise.best_weight ? "kg" : undefined} />
        {exercise.best_estimated_1rm ? <MiniMetric label="Est. 1RM" value={exercise.best_estimated_1rm.toFixed(1)} unit="kg" /> : null}
        {exercise.last_performed_date ? <MiniMetric label="Last done" value={formatShortDate(exercise.last_performed_date)} /> : null}
      </div>
      <Button className="mt-4 h-10 w-full rounded-2xl" variant="secondary" onClick={onOpen}>
        Open details
      </Button>
    </div>
  );
}

function ExerciseDetailSheet({ exercise, open, onOpenChange, onChanged }: { exercise: Exercise | null; open: boolean; onOpenChange: (open: boolean) => void; onChanged: () => void }) {
  const [editingReference, setEditingReference] = useState<ExerciseReference | null>(null);

  if (!exercise) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setEditingReference(null);
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniMetric label="References" value={String(exercise.reference_count)} />
            <MiniMetric label="Recent sets" value={String(exercise.recent_set_count)} />
            <MiniMetric label={exercise.best_weight ? "Best weight" : "Best reps"} value={exercise.best_weight ? String(exercise.best_weight) : String(exercise.best_reps ?? "--")} unit={exercise.best_weight ? "kg" : undefined} />
            <MiniMetric label="Est. 1RM" value={exercise.best_estimated_1rm ? exercise.best_estimated_1rm.toFixed(1) : "--"} unit={exercise.best_estimated_1rm ? "kg" : undefined} />
          </div>

          <DetailSection eyebrow="Overview" title="Form notes">
            {exercise.form_notes ? (
              <p className="text-sm leading-6 text-text-secondary">{exercise.form_notes}</p>
            ) : (
              <p className="text-sm leading-6 text-text-muted">No form notes yet. Add cues when this exercise needs specific setup reminders.</p>
            )}
          </DetailSection>

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

function ReferenceCard({ reference, onEdit, onDelete }: { reference: ExerciseReference; onEdit: () => void; onDelete: () => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);

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
          <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em]", sourceBadgeClasses[reference.source])}>{sourceLabels[reference.source]}</span>
          <p className="mt-2 truncate text-sm font-semibold text-text-primary">{reference.title || reference.url}</p>
          {reference.notes ? <p className="mt-1 text-xs leading-5 text-text-secondary">{reference.notes}</p> : null}
        </div>
        <div className="flex gap-2">
          <a className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-amber bg-amber-muted px-3 text-xs font-semibold text-amber transition hover:bg-amber/20" href={reference.url} target="_blank" rel="noreferrer">
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

function RecentSessions({ sessions }: { sessions: GymSession[] }) {
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
        </Card>
      ))}
    </div>
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

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border bg-bg-card px-2.5 py-1 text-xs font-semibold text-text-secondary">{children}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function StateCard({ message, tone = "default" }: { message: string; tone?: "default" | "error" }) {
  return <Card className={tone === "error" ? "border-red bg-red-muted text-red" : "text-text-secondary"}>{message}</Card>;
}

function topMuscleCoverage(analytics: GymAnalytics) {
  const trained = analytics.muscle_coverage_this_week.filter((item) => item.total_set_count > 0);
  if (!trained.length) return null;
  return trained.sort((a, b) => b.total_set_count - a.total_set_count)[0];
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function barWidth(value: number, maxValue: number) {
  if (value <= 0) return 0;
  return Math.max(8, (value / Math.max(1, maxValue)) * 100);
}

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

function detectReferenceSource(value: string): ExerciseReferenceSource {
  const lower = value.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.startsWith("http")) return "website";
  return "other";
}
