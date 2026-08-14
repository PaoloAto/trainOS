import { motion } from "framer-motion";
import { CheckCircle2, ClipboardCheck, Dumbbell, Mountain, Timer } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

import { OptionalNotesField } from "@/components/common/OptionalNotesField";
import { QuickActionButton } from "@/components/common/QuickActionButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClassName } from "@/components/ui/form-control";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api, type ClimbingProject, type Exercise, type ExerciseReferenceSource, type MuscleGroup } from "@/lib/api";
import { formatPace, todayISODate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { detectReferenceSource } from "@/lib/video";

export type QuickLogMode = "menu" | "check-in" | "run" | "gym" | "climb" | "project";

type QuickLogSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: QuickLogMode;
  initialGymExerciseId?: number | null;
  initialClimbingProjectId?: number | null;
  onSaved?: () => void;
};


const runTypeOptions = ["easy", "long_run", "tempo", "interval", "recovery", "race", "hill", "progression", "other"];
const splitOptions = ["push", "pull", "legs", "upper", "lower", "full_body", "custom"];
const movementOptions = ["push", "pull", "squat", "hinge", "lunge", "carry", "rotation", "isolation", "core", "other"];
const equipmentOptions = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "other"];
const referenceSourceOptions: ExerciseReferenceSource[] = ["youtube", "instagram", "tiktok", "website", "other"];
const sessionTypeOptions = ["bouldering", "top_rope", "sport", "trad", "training", "other"];
const gradeSystemOptions = ["v_scale", "yds", "font", "other"];
const climbResultOptionsBySessionType: Record<string, string[]> = {
  bouldering: ["flash", "send", "repeat", "project", "fail", "attempt"],
  top_rope: ["clean", "take", "fall", "complete", "attempt"],
  sport: ["clean", "take", "fall", "complete", "attempt"],
  trad: ["clean", "take", "fall", "complete", "attempt"],
  training: ["complete", "attempt", "fail"],
  other: ["complete", "attempt", "fail"],
};
const styleOptions = ["", "slab", "vertical", "overhang", "roof", "crimpy", "sloper", "pinch", "dyno", "technical", "powerful", "endurance", "other"];
const projectStatusOptions = ["active", "sent", "paused", "abandoned"];

function toOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toRequiredNumber(value: string, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionLabel(value: string) {
  if (!value) return "None";
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function climbResultOptionsFor(sessionType: string) {
  return climbResultOptionsBySessionType[sessionType] ?? climbResultOptionsBySessionType.other;
}

function defaultClimbResultFor(sessionType: string) {
  if (sessionType === "bouldering") return "project";
  if (sessionType === "top_rope" || sessionType === "sport" || sessionType === "trad") return "clean";
  return "complete";
}

function isClimbSendLike(sessionType: string, result: string) {
  if (sessionType === "bouldering") return ["flash", "send"].includes(result);
  if (["top_rope", "sport", "trad"].includes(sessionType)) return ["clean", "complete"].includes(result);
  return ["send", "flash", "clean", "complete"].includes(result);
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:gap-4">{children}</div>;
}

function FormPanel({ children }: { children: ReactNode }) {
  return <div className="space-y-4 rounded-3xl border border-border bg-bg-base/40 p-4 md:p-5">{children}</div>;
}

function FormEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-text-muted">{children}</p>;
}

function ErrorState({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-2xl border border-red bg-red-muted p-3 text-sm leading-6 text-red">{error}</div>;
}

function SubmitFooter({ label, saving, disabled }: { label: string; saving: boolean; disabled?: boolean }) {
  return (
    <div className="sticky bottom-0 -mx-1 bg-bg-card/95 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-sm md:static md:bg-transparent md:pb-0 md:pt-1">
      <Button type="submit" className="h-12 w-full rounded-2xl" disabled={saving || disabled}>
        {saving ? "Saving..." : label}
      </Button>
    </div>
  );
}

function SuccessBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 rounded-2xl border border-green bg-green-muted p-3 text-sm font-semibold text-green"
    >
      <CheckCircle2 className="h-4 w-4" />
      {message}
    </motion.div>
  );
}

export function QuickLogSheet({ open, onOpenChange, initialMode = "menu", initialGymExerciseId = null, initialClimbingProjectId = null, onSaved }: QuickLogSheetProps) {
  const [mode, setMode] = useState<QuickLogMode | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const activeMode = mode ?? initialMode;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setMode(null);
      setSuccessMessage(null);
    }
    onOpenChange(nextOpen);
  }

  function handleSuccess(message: string) {
    setSuccessMessage(message);
    onSaved?.();
    window.setTimeout(() => handleOpenChange(false), 650);
  }

  const title = activeMode === "menu" ? "Quick Log" : activeMode === "project" ? "Create Project" : `Log ${optionLabel(activeMode)}`;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="overflow-y-auto overscroll-contain pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:max-h-[86vh] md:pb-6">
        <SheetHeader className="border-b border-border pb-4">
          <FormEyebrow>{activeMode === "menu" ? "Fast Capture" : "Under 60 seconds"}</FormEyebrow>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            Capture the minimum useful data now. You can refine details later from each training page.
          </SheetDescription>
        </SheetHeader>

        <SuccessBanner message={successMessage} />

        {activeMode !== "menu" ? (
          <Button type="button" variant="ghost" size="sm" className="-mt-1 w-fit rounded-2xl text-text-secondary" onClick={() => setMode("menu")}>
            Back to quick log
          </Button>
        ) : null}

        <motion.div
          key={activeMode}
          initial={{ opacity: 0, y: 12, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          {activeMode === "menu" ? <QuickLogMenu onSelect={setMode} /> : null}
          {activeMode === "check-in" ? <CheckInForm onSuccess={handleSuccess} /> : null}
          {activeMode === "run" ? <RunForm onSuccess={handleSuccess} /> : null}
          {activeMode === "gym" ? <GymForm initialExerciseId={initialGymExerciseId} onSuccess={handleSuccess} /> : null}
          {activeMode === "climb" ? <ClimbForm initialProjectId={initialClimbingProjectId} onSuccess={handleSuccess} /> : null}
          {activeMode === "project" ? <ProjectForm onSuccess={handleSuccess} /> : null}
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}

function QuickLogMenu({ onSelect }: { onSelect: (mode: QuickLogMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4">
      <QuickActionButton icon={ClipboardCheck} label="Check-in" hint="mood / sleep / energy" accent="green" onClick={() => onSelect("check-in")} />
      <QuickActionButton icon={Timer} label="Run" hint="distance / pace / effort" accent="green" onClick={() => onSelect("run")} />
      <QuickActionButton icon={Dumbbell} label="Gym" hint="split / sets / weight" accent="amber" onClick={() => onSelect("gym")} />
      <QuickActionButton icon={Mountain} label="Climb" hint="grade / result / style" accent="indigo" onClick={() => onSelect("climb")} />
    </div>
  );
}

function CheckInForm({ onSuccess }: { onSuccess: (message: string) => void }) {
  const [sleepHours, setSleepHours] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState("");
  const [soreness, setSoreness] = useState("");
  const [stress, setStress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.checkIns.saveToday({
        sleep_hours: toOptionalNumber(sleepHours),
        mood: toOptionalNumber(mood),
        energy: toOptionalNumber(energy),
        soreness: toOptionalNumber(soreness),
        stress: toOptionalNumber(stress),
        notes,
      });
      onSuccess("Check-in saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save check-in.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <FormPanel>
        <FormEyebrow>Daily State</FormEyebrow>
        <FieldGrid>
          <Field label="Sleep" htmlFor="quicklog-checkin-sleep"><Input id="quicklog-checkin-sleep" inputMode="decimal" value={sleepHours} onChange={(event) => setSleepHours(event.target.value)} placeholder="7.5 h" /></Field>
          <Field label="Mood" htmlFor="quicklog-checkin-mood"><Input id="quicklog-checkin-mood" inputMode="numeric" value={mood} onChange={(event) => setMood(event.target.value)} placeholder="1-10" /></Field>
          <Field label="Energy" htmlFor="quicklog-checkin-energy"><Input id="quicklog-checkin-energy" inputMode="numeric" value={energy} onChange={(event) => setEnergy(event.target.value)} placeholder="1-10" /></Field>
          <Field label="Soreness" htmlFor="quicklog-checkin-soreness"><Input id="quicklog-checkin-soreness" inputMode="numeric" value={soreness} onChange={(event) => setSoreness(event.target.value)} placeholder="1-10" /></Field>
        </FieldGrid>
        <Field label="Stress" htmlFor="quicklog-checkin-stress"><Input id="quicklog-checkin-stress" inputMode="numeric" value={stress} onChange={(event) => setStress(event.target.value)} placeholder="1-10" /></Field>
        <OptionalNotesField
          label="Check-in notes"
          value={notes}
          onChange={setNotes}
          collapsedLabel="+ Add check-in notes"
          placeholder="Anything worth remembering about sleep, stress, or readiness?"
          helperText="Optional context for today's baseline."
          accent="green"
        />
      </FormPanel>
      <ErrorState error={error} />
      <SubmitFooter label="Save check-in" saving={saving} />
    </form>
  );
}

function RunForm({ onSuccess }: { onSuccess: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [runType, setRunType] = useState("easy");
  const [distanceKm, setDistanceKm] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [effort, setEffort] = useState("");
  const [avgHr, setAvgHr] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const run = await api.runs.create({
        title,
        started_at: new Date().toISOString(),
        distance_km: toRequiredNumber(distanceKm),
        duration_seconds: Math.round(toRequiredNumber(durationMinutes) * 60),
        run_type: runType,
        perceived_effort: toOptionalNumber(effort),
        avg_hr: toOptionalNumber(avgHr),
        notes,
      });
      onSuccess(`Run saved. Pace ${formatPace(run.avg_pace_seconds_per_km)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save run.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <FormPanel>
        <FormEyebrow>Manual Run</FormEyebrow>
        <Field label="Title" htmlFor="quicklog-run-title"><Input id="quicklog-run-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Easy Run" /></Field>
        <FieldGrid>
          <Field label="Type" htmlFor="quicklog-run-type"><select id="quicklog-run-type" className={selectClassName()} value={runType} onChange={(event) => setRunType(event.target.value)}>{runTypeOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
          <Field label="Distance km" htmlFor="quicklog-run-distance"><Input id="quicklog-run-distance" inputMode="decimal" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} placeholder="5.0" required /></Field>
          <Field label="Duration min" htmlFor="quicklog-run-duration"><Input id="quicklog-run-duration" inputMode="decimal" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} placeholder="32" required /></Field>
          <Field label="RPE" htmlFor="quicklog-run-rpe"><Input id="quicklog-run-rpe" inputMode="numeric" value={effort} onChange={(event) => setEffort(event.target.value)} placeholder="1-10" /></Field>
        </FieldGrid>
        <Field label="Avg HR bpm" htmlFor="quicklog-run-avg-hr"><Input id="quicklog-run-avg-hr" inputMode="numeric" value={avgHr} onChange={(event) => setAvgHr(event.target.value)} placeholder="145" /></Field>
        <OptionalNotesField
          label="Run notes"
          value={notes}
          onChange={setNotes}
          collapsedLabel="+ Add run notes"
          placeholder="Route, weather, legs, or workout intent."
          helperText="Optional context for this run."
          accent="green"
        />
      </FormPanel>
      <ErrorState error={error} />
      <SubmitFooter label="Save run" saving={saving} disabled={!distanceKm || !durationMinutes} />
    </form>
  );
}

function GymForm({ initialExerciseId, onSuccess }: { initialExerciseId?: number | null; onSuccess: (message: string) => void }) {
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [createExercise, setCreateExercise] = useState(false);
  const [exerciseId, setExerciseId] = useState("");
  const [splitType, setSplitType] = useState("pull");
  const [sets, setSets] = useState("1");
  const [reps, setReps] = useState("8");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [groups, exerciseList] = await Promise.all([api.muscleGroups.list(), api.exercises.list()]);
        if (!active) return;
        setMuscleGroups(groups);
        setExercises(exerciseList);
        const preferredExercise = exerciseList.find((exercise) => exercise.id === initialExerciseId);
        setExerciseId(String(preferredExercise?.id ?? exerciseList[0]?.id ?? ""));
        setCreateExercise(exerciseList.length === 0);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load gym setup.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [initialExerciseId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exerciseId) {
      setError("Create or select an exercise first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const setCount = Math.max(1, Math.round(toRequiredNumber(sets, 1)));
      await api.gymSessions.create({
        date: todayISODate(),
        split_type: splitType,
        notes,
        sets: Array.from({ length: setCount }, (_, index) => ({
          exercise: Number(exerciseId),
          set_number: index + 1,
          weight: toOptionalNumber(weight),
          reps: Math.max(1, Math.round(toRequiredNumber(reps, 1))),
          rpe: toOptionalNumber(rpe),
        })),
      });
      onSuccess("Gym session saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save gym session.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExerciseCreated(exercise: Exercise) {
    setExercises((current) => [exercise, ...current]);
    setExerciseId(String(exercise.id));
    setCreateExercise(false);
  }

  const selectedExercise = exercises.find((exercise) => String(exercise.id) === exerciseId);

  if (loading) return <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm text-text-secondary">Loading exercises...</div>;

  return (
    <div className="space-y-4">
      {createExercise ? (
        <CreateExerciseForm
          muscleGroups={muscleGroups}
          onCreated={handleExerciseCreated}
          onCancel={exercises.length > 0 ? () => setCreateExercise(false) : undefined}
        />
      ) : (
        <Button type="button" variant="secondary" className="h-11 w-full rounded-2xl" onClick={() => setCreateExercise(true)}>
          Create exercise
        </Button>
      )}

      {exercises.length === 0 ? (
        <div className="rounded-2xl border border-amber bg-amber-muted p-4 text-sm leading-6 text-amber">
          Create your first exercise above. The gym session form will unlock immediately after it is saved.
        </div>
      ) : null}

      {exercises.length > 0 && !createExercise ? (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormPanel>
            <FormEyebrow>Gym Session</FormEyebrow>
            <FieldGrid>
              <Field label="Split" htmlFor="quicklog-gym-split"><select id="quicklog-gym-split" className={selectClassName("amber")} value={splitType} onChange={(event) => setSplitType(event.target.value)}>{splitOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
              <Field label="Exercise" htmlFor="quicklog-gym-exercise"><select id="quicklog-gym-exercise" className={selectClassName("amber")} value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></Field>
              <Field label="Sets" htmlFor="quicklog-gym-sets"><Input id="quicklog-gym-sets" accent="amber" inputMode="numeric" value={sets} onChange={(event) => setSets(event.target.value)} /></Field>
              <Field label="Reps" htmlFor="quicklog-gym-reps"><Input id="quicklog-gym-reps" accent="amber" inputMode="numeric" value={reps} onChange={(event) => setReps(event.target.value)} /></Field>
              <Field label="Weight" htmlFor="quicklog-gym-weight"><Input id="quicklog-gym-weight" accent="amber" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="0 for bodyweight" /></Field>
              <Field label="RPE" htmlFor="quicklog-gym-rpe"><Input id="quicklog-gym-rpe" accent="amber" inputMode="decimal" value={rpe} onChange={(event) => setRpe(event.target.value)} placeholder="1-10" /></Field>
            </FieldGrid>
            {selectedExercise ? (
              <div className="rounded-2xl border border-amber bg-amber-muted p-3 text-sm leading-6 text-amber">
                {selectedExercise.last_session_summary_label}
              </div>
            ) : null}
            <OptionalNotesField
              label="Notes"
              value={notes}
              onChange={setNotes}
              collapsedLabel="+ Add set/session notes"
              placeholder="How the set moved, setup notes, or next target."
              accent="amber"
            />
          </FormPanel>
          <ErrorState error={error} />
          <SubmitFooter label="Save gym session" saving={saving} disabled={!exerciseId} />
        </form>
      ) : null}
    </div>
  );
}

function CreateExerciseForm({ muscleGroups, onCreated, onCancel }: { muscleGroups: MuscleGroup[]; onCreated: (exercise: Exercise) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [primaryGroup, setPrimaryGroup] = useState(() => String(muscleGroups[0]?.id ?? ""));
  const [equipment, setEquipment] = useState("dumbbell");
  const [movement, setMovement] = useState("pull");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceSource, setReferenceSource] = useState<ExerciseReferenceSource>("youtube");
  const [referenceTitle, setReferenceTitle] = useState("");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [referenceSourceTouched, setReferenceSourceTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleReferenceUrlChange(value: string) {
    setReferenceUrl(value);
    if (!referenceSourceTouched) {
      setReferenceSource(detectReferenceSource(value));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const exercise = await api.exercises.create({
        name,
        primary_muscle_group: Number(primaryGroup),
        equipment,
        movement_pattern: movement,
      });
      if (referenceUrl.trim()) {
        await api.exerciseReferences.create(exercise.id, {
          url: referenceUrl.trim(),
          source: referenceSource,
          title: referenceTitle,
          notes: referenceNotes,
        });
      }
      onCreated(exercise);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create exercise.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4 rounded-3xl border border-amber bg-amber-muted p-4" onSubmit={handleSubmit}>
      <div className="border-b border-border pb-3">
        <FormEyebrow>New Exercise</FormEyebrow>
        <p className="mt-1 text-sm text-text-secondary">Create once, reuse for fast gym logs.</p>
      </div>
      <Field label="Exercise name" htmlFor="quicklog-exercise-name"><Input id="quicklog-exercise-name" accent="amber" value={name} onChange={(event) => setName(event.target.value)} required placeholder="Pull-up" /></Field>
      <FieldGrid>
        <Field label="Muscle" htmlFor="quicklog-exercise-muscle"><select id="quicklog-exercise-muscle" className={selectClassName("amber")} value={primaryGroup} onChange={(event) => setPrimaryGroup(event.target.value)}>{muscleGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
        <Field label="Equipment" htmlFor="quicklog-exercise-equipment"><select id="quicklog-exercise-equipment" className={selectClassName("amber")} value={equipment} onChange={(event) => setEquipment(event.target.value)}>{equipmentOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
        <Field label="Pattern" htmlFor="quicklog-exercise-pattern"><select id="quicklog-exercise-pattern" className={selectClassName("amber")} value={movement} onChange={(event) => setMovement(event.target.value)}>{movementOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
      </FieldGrid>
      <div className="space-y-3 rounded-2xl border border-border bg-bg-base/40 p-3">
        <FormEyebrow>Optional Form Video/Cue</FormEyebrow>
        <Field label="Video or cue URL" htmlFor="quicklog-exercise-reference-url"><Input id="quicklog-exercise-reference-url" accent="amber" value={referenceUrl} onChange={(event) => handleReferenceUrlChange(event.target.value)} placeholder="YouTube, Reel, TikTok, or website" /></Field>
        {referenceUrl ? (
          <>
            <FieldGrid>
              <Field label="Source" htmlFor="quicklog-exercise-reference-source"><select id="quicklog-exercise-reference-source" className={selectClassName("amber")} value={referenceSource} onChange={(event) => { setReferenceSource(event.target.value as ExerciseReferenceSource); setReferenceSourceTouched(true); }}>{referenceSourceOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
              <Field label="Title" htmlFor="quicklog-exercise-reference-title"><Input id="quicklog-exercise-reference-title" accent="amber" value={referenceTitle} onChange={(event) => setReferenceTitle(event.target.value)} placeholder="Pull-up form cue" /></Field>
            </FieldGrid>
            <OptionalNotesField
              label="Cue notes"
              value={referenceNotes}
              onChange={setReferenceNotes}
              collapsedLabel="+ Add cue notes"
              placeholder="What should you remember before training this?"
              helperText="Optional cues for this first saved form video."
              accent="amber"
            />
          </>
        ) : null}
      </div>
      <ErrorState error={error} />
      <div className={cn("grid gap-3", onCancel ? "grid-cols-2" : "grid-cols-1")}>
        {onCancel ? <Button type="button" variant="secondary" className="h-11 rounded-2xl" onClick={onCancel}>Cancel</Button> : null}
        <Button type="submit" className="h-11 rounded-2xl" disabled={saving || !primaryGroup || !name}>{saving ? "Creating..." : "Create exercise"}</Button>
      </div>
    </form>
  );
}

function ClimbForm({ initialProjectId = null, onSuccess }: { initialProjectId?: number | null; onSuccess: (message: string) => void }) {
  const [sessionType, setSessionType] = useState("bouldering");
  const [location, setLocation] = useState("");
  const [climbName, setClimbName] = useState("");
  const [gradeSystem, setGradeSystem] = useState("v_scale");
  const [grade, setGrade] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ? String(initialProjectId) : "");
  const [projects, setProjects] = useState<ClimbingProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [result, setResult] = useState("project");
  const [markProjectSent, setMarkProjectSent] = useState(true);
  const [attempts, setAttempts] = useState("1");
  const [style, setStyle] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSessionTypeChange(value: string) {
    setSessionType(value);
    if (value === "bouldering") setGradeSystem("v_scale");
    if (value === "top_rope") setGradeSystem("yds");
    const validResults = climbResultOptionsFor(value);
    setResult((current) => (validResults.includes(current) ? current : defaultClimbResultFor(value)));
  }

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      setProjectsLoading(true);
      try {
        const data = await api.climbingProjects.list();
        if (active) setProjects(data);
      } finally {
        if (active) setProjectsLoading(false);
      }
    }
    void loadProjects();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!initialProjectId || projects.length === 0) return;
    const project = projects.find((item) => item.id === initialProjectId);
    if (project) applyProject(project);
    // Apply only after the initial project becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProjectId, projects]);

  const selectedProject = projects.find((item) => String(item.id) === selectedProjectId) ?? null;
  const sortedProjects = [...projects].sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    const aMatch = a.session_type === sessionType ? 0 : 1;
    const bMatch = b.session_type === sessionType ? 0 : 1;
    return aActive - bActive || aMatch - bMatch || a.name.localeCompare(b.name);
  });
  const resultOptions = climbResultOptionsFor(sessionType);
  const shouldOfferMarkSent = Boolean(selectedProject && selectedProject.status === "active" && isClimbSendLike(sessionType, result));

  function applyProject(project: ClimbingProject) {
    setSelectedProjectId(String(project.id));
    if (project.session_type) handleSessionTypeChange(project.session_type);
    if (!climbName) setClimbName(project.name);
    if (!grade) setGrade(project.grade);
    setGradeSystem(project.grade_system);
    if (!location && project.location) setLocation(project.location);
  }

  function handleProjectChange(value: string) {
    setSelectedProjectId(value);
    if (!value) return;
    const project = projects.find((item) => String(item.id) === value);
    if (project) applyProject(project);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const markProjectSentValue = selectedProject ? (shouldOfferMarkSent ? markProjectSent : false) : true;
    try {
      await api.climbingSessions.create({
        date: todayISODate(),
        location,
        session_type: sessionType,
        attempts: [{
          project: selectedProjectId ? Number(selectedProjectId) : null,
          climb_name: climbName,
          grade_system: gradeSystem,
          grade,
          result,
          attempts: Math.max(1, Math.round(toRequiredNumber(attempts, 1))),
          style,
          notes,
          mark_project_sent: markProjectSentValue,
        }],
      });
      if (selectedProject) {
        onSuccess(
          shouldOfferMarkSent && markProjectSent
            ? `Climbing log linked to ${selectedProject.name}. Project marked sent.`
            : `Climbing log linked to ${selectedProject.name}.`,
        );
      } else {
        onSuccess("Climbing session saved.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save climbing session.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <FormPanel>
        <FormEyebrow>Climbing Session</FormEyebrow>
        <FieldGrid>
          <Field label="Type" htmlFor="quicklog-climb-type"><select id="quicklog-climb-type" className={selectClassName("indigo")} value={sessionType} onChange={(event) => handleSessionTypeChange(event.target.value)}>{sessionTypeOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
          <Field label="Location" htmlFor="quicklog-climb-location"><Input id="quicklog-climb-location" accent="indigo" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Local gym" /></Field>
          <Field label="Project" htmlFor="quicklog-climb-project">
            <select id="quicklog-climb-project" className={selectClassName("indigo")} value={selectedProjectId} onChange={(event) => handleProjectChange(event.target.value)} disabled={projectsLoading}>
              <option value="">No project</option>
              {sortedProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} - {project.grade}{project.session_type === sessionType ? "" : ` (${optionLabel(project.session_type)})`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Climb name" htmlFor="quicklog-climb-name"><Input id="quicklog-climb-name" accent="indigo" value={climbName} onChange={(event) => setClimbName(event.target.value)} placeholder="Optional route or boulder name" /></Field>
          <Field label="Grade system" htmlFor="quicklog-climb-grade-system"><select id="quicklog-climb-grade-system" className={selectClassName("indigo")} value={gradeSystem} onChange={(event) => setGradeSystem(event.target.value)}>{gradeSystemOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
          <Field label="Grade" htmlFor="quicklog-climb-grade"><Input id="quicklog-climb-grade" accent="indigo" value={grade} onChange={(event) => setGrade(event.target.value)} placeholder={sessionType === "top_rope" ? "5.10a" : "V4"} required /></Field>
          <Field label="Result" htmlFor="quicklog-climb-result"><select id="quicklog-climb-result" className={selectClassName("indigo")} value={result} onChange={(event) => setResult(event.target.value)}>{resultOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
          <Field label="Tries" htmlFor="quicklog-climb-tries"><Input id="quicklog-climb-tries" accent="indigo" inputMode="numeric" value={attempts} onChange={(event) => setAttempts(event.target.value)} /></Field>
          <Field label="Style" htmlFor="quicklog-climb-style"><select id="quicklog-climb-style" className={selectClassName("indigo")} value={style} onChange={(event) => setStyle(event.target.value)}>{styleOptions.map((option) => <option key={option || "none"} value={option}>{optionLabel(option)}</option>)}</select></Field>
        </FieldGrid>
        {selectedProject ? (
          <div className="rounded-2xl border border-indigo bg-indigo-muted p-3 text-sm leading-6 text-indigo">
            <p className="font-semibold text-text-primary">Linked project</p>
            <p className="mt-1">{selectedProject.name} - {selectedProject.grade} - {optionLabel(selectedProject.session_type || sessionType)}</p>
            <p className="mt-1">This log will count toward project progress.</p>
            {selectedProject.status !== "active" ? <p className="mt-2 text-text-secondary">This project is not active. You can still log history, but active projects are recommended.</p> : null}
            {shouldOfferMarkSent ? (
              <label className="mt-3 flex items-start gap-3 rounded-xl border border-indigo/50 bg-bg-card/60 p-3 text-text-secondary">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-border bg-bg-elevated accent-indigo"
                  checked={markProjectSent}
                  onChange={(event) => setMarkProjectSent(event.target.checked)}
                />
                <span>
                  <span className="block font-semibold text-text-primary">Mark project as sent when saved</span>
                  <span className="text-xs leading-5">Turn this off if this was a clean/send-like drill but the project should stay active.</span>
                </span>
              </label>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl border border-indigo bg-indigo-muted p-3 text-sm leading-6 text-indigo">Link this climb to a project when you want it counted in project history.</p>
        )}
        <OptionalNotesField
          label="Climbing notes"
          value={notes}
          onChange={setNotes}
          collapsedLabel="+ Add climbing notes"
          placeholder="Beta, movement style, or what to try next."
          helperText="Optional context for this climb."
          accent="indigo"
        />
      </FormPanel>
      <ErrorState error={error} />
      <SubmitFooter label="Save climb" saving={saving} disabled={!grade} />
    </form>
  );
}

function ProjectForm({ onSuccess }: { onSuccess: (message: string) => void }) {
  const [name, setName] = useState("");
  const [sessionType, setSessionType] = useState("bouldering");
  const [gradeSystem, setGradeSystem] = useState("v_scale");
  const [grade, setGrade] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSessionTypeChange(value: string) {
    setSessionType(value);
    if (value === "bouldering") setGradeSystem("v_scale");
    if (value === "top_rope") setGradeSystem("yds");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.climbingProjects.create({
        name,
        session_type: sessionType,
        grade_system: gradeSystem,
        grade,
        location,
        status,
        notes,
      });
      onSuccess("Project created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <FormPanel>
        <div className="border-b border-border pb-4">
          <FormEyebrow>New Project</FormEyebrow>
          <h3 className="mt-2 text-lg font-bold text-text-primary">Route or boulder target</h3>
          <p className="mt-1 text-sm leading-6 text-text-secondary">Track bouldering projects and top-rope route projects without mixing analytics yet.</p>
        </div>
        <Field label="Project name" htmlFor="quicklog-project-name">
          <Input
            id="quicklog-project-name"
            accent="indigo"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder={sessionType === "top_rope" ? "Green route" : "Blue overhang problem"}
          />
        </Field>
        <FieldGrid>
          <Field label="Type" htmlFor="quicklog-project-type"><select id="quicklog-project-type" className={selectClassName("indigo")} value={sessionType} onChange={(event) => handleSessionTypeChange(event.target.value)}>{sessionTypeOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
          <Field label="Grade system" htmlFor="quicklog-project-grade-system"><select id="quicklog-project-grade-system" className={selectClassName("indigo")} value={gradeSystem} onChange={(event) => setGradeSystem(event.target.value)}>{gradeSystemOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
          <Field label="Grade" htmlFor="quicklog-project-grade"><Input id="quicklog-project-grade" accent="indigo" value={grade} onChange={(event) => setGrade(event.target.value)} required placeholder={sessionType === "top_rope" ? "5.10a" : "V5"} /></Field>
          <Field label="Status" htmlFor="quicklog-project-status"><select id="quicklog-project-status" className={selectClassName("indigo")} value={status} onChange={(event) => setStatus(event.target.value)}>{projectStatusOptions.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></Field>
        </FieldGrid>
        <Field label="Location" htmlFor="quicklog-project-location"><Input id="quicklog-project-location" accent="indigo" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Gym wall, crag, or route area" /></Field>
        <OptionalNotesField
          label="Project notes"
          value={notes}
          onChange={setNotes}
          collapsedLabel="+ Add project notes"
          placeholder="Current beta, crux, or what to try next."
          helperText="Optional beta and reminders for this project."
          accent="indigo"
        />
      </FormPanel>
      <ErrorState error={error} />
      <SubmitFooter label="Create project" saving={saving} disabled={!name || !grade} />
    </form>
  );
}
