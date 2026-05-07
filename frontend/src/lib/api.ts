export type HealthResponse = {
  status: "ok";
};

export type User = {
  id: number;
  username: string;
  email: string;
};

export type MeResponse = {
  authenticated: boolean;
  user: User | null;
};

export type LoginInput = {
  username: string;
  password: string;
};

export type LoginResponse = {
  user: User;
};

export type DailyCheckIn = {
  id: number;
  date: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  mood: number | null;
  energy: number | null;
  soreness: number | null;
  stress: number | null;
  body_weight: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type DailyCheckInInput = Partial<
  Pick<
    DailyCheckIn,
    | "date"
    | "sleep_hours"
    | "sleep_quality"
    | "mood"
    | "energy"
    | "soreness"
    | "stress"
    | "body_weight"
    | "notes"
  >
>;

export type RunActivity = {
  id: number;
  title: string;
  started_at: string;
  distance_km: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  run_type: string;
  perceived_effort: number | null;
  notes: string;
  source: string;
  import_batch: number | null;
  source_activity_id: string;
  raw_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RunActivityInput = {
  title?: string;
  started_at: string;
  distance_km: number;
  duration_seconds: number;
  avg_hr?: number | null;
  max_hr?: number | null;
  elevation_gain_m?: number | null;
  run_type: string;
  perceived_effort?: number | null;
  notes?: string;
};

export type RunningImportSource = "garmin_export" | "strava_export" | "manual_upload" | "other";

export type RunImportSummary = Pick<
  RunActivity,
  | "id"
  | "title"
  | "started_at"
  | "distance_km"
  | "duration_seconds"
  | "avg_pace_seconds_per_km"
  | "avg_hr"
  | "max_hr"
  | "elevation_gain_m"
  | "source"
  | "raw_metadata"
  | "created_at"
>;

export type RunningImportBatch = {
  id: number;
  source: RunningImportSource;
  file_type: string;
  original_filename: string;
  status: string;
  imported_count: number;
  skipped_count: number;
  error_count: number;
  errors: string[];
  created_at: string;
  updated_at: string;
  runs: RunImportSummary[];
};

export type RunningImportResult = {
  message: string;
  batch: RunningImportBatch;
  created_run: RunImportSummary | null;
};

export type RunningAnalyticsRunSummary = {
  id: number;
  title: string;
  started_at: string;
  distance_km: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number | null;
  source: string;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  raw_metadata: Record<string, unknown>;
};

export type RunningLongRunSummary = {
  id: number;
  started_at: string;
  date: string;
  distance_km: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number | null;
  source: string;
};

export type RunningWeeklyTrendPoint = {
  week_start: string;
  distance_km: number;
  run_count: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number | null;
};

export type RunningMonthlyTrendPoint = {
  month_start: string;
  distance_km: number;
  run_count: number;
  duration_seconds: number;
};

export type RunningPaceTrendPoint = {
  id: number;
  date: string;
  distance_km: number;
  avg_pace_seconds_per_km: number | null;
  source: string;
};

export type RunningAnalytics = {
  summary: {
    total_runs: number;
    total_distance_km: number;
    total_duration_seconds: number;
    avg_pace_seconds_per_km: number | null;
    imported_run_count: number;
    manual_run_count: number;
    average_distance_km: number;
    longest_run_distance_km: number;
    latest_run_date: string | null;
  };
  current_week: {
    week_start: string;
    week_distance_km: number;
    week_run_count: number;
    week_duration_seconds: number;
    week_avg_pace_seconds_per_km: number | null;
  };
  current_month: {
    month_distance_km: number;
    month_run_count: number;
    month_duration_seconds: number;
    month_avg_pace_seconds_per_km: number | null;
  };
  longest_run: RunningAnalyticsRunSummary | null;
  recent_long_runs: RunningLongRunSummary[];
  weekly_distance_trend: RunningWeeklyTrendPoint[];
  monthly_distance_trend: RunningMonthlyTrendPoint[];
  recent_pace_trend: RunningPaceTrendPoint[];
  long_run_progression: RunningLongRunSummary[];
  marathon_baseline: {
    longest_distance_km: number;
    distance_gap_to_marathon_km: number;
    marathon_time_at_longest_run_pace_seconds: number | null;
    half_marathon_benchmark: boolean;
    baseline_label: string;
    baseline_note: string;
  };
  consistency: {
    runs_last_7_days: number;
    runs_last_30_days: number;
    active_weeks_last_8: number;
    consistency_label: "No data" | "Starting baseline" | "Building consistency" | "Consistent";
    consistency_note: string;
  };
  data_quality: {
    confidence: "low" | "medium" | "high";
    reason: string;
    suggested_next_action: string;
  };
  insights: string[];
};

export type MuscleGroup = {
  id: number;
  name: string;
};

export type ExerciseReferenceSource = "youtube" | "instagram" | "tiktok" | "website" | "other";

export type ExerciseReference = {
  id: number;
  url: string;
  source: ExerciseReferenceSource;
  title: string;
  notes: string;
  created_at: string;
};

export type ExerciseReferenceInput = {
  url: string;
  source: ExerciseReferenceSource;
  title?: string;
  notes?: string;
};

export type Exercise = {
  id: number;
  name: string;
  primary_muscle_group: number;
  primary_muscle_group_name: string;
  secondary_muscle_groups: number[];
  secondary_muscle_group_names: string[];
  movement_pattern: string;
  equipment: string;
  form_notes: string;
  is_custom: boolean;
  references: ExerciseReference[];
  reference_count: number;
  recent_set_count: number;
  best_weight: number | null;
  best_reps: number | null;
  best_estimated_1rm: number | null;
  last_performed_date: string | null;
  created_at: string;
  updated_at: string;
};

export type ExerciseInput = {
  name: string;
  primary_muscle_group: number;
  secondary_muscle_groups?: number[];
  movement_pattern?: string;
  equipment?: string;
  form_notes?: string;
};

export type GymSet = {
  id: number;
  exercise: number;
  exercise_name: string;
  set_number: number;
  weight: number | null;
  reps: number;
  rpe: number | null;
  notes: string;
  created_at: string;
};

export type GymSetInput = {
  exercise: number;
  set_number: number;
  weight?: number | null;
  reps: number;
  rpe?: number | null;
  notes?: string;
};

export type GymSession = {
  id: number;
  date: string;
  split_type: string;
  duration_minutes: number | null;
  notes: string;
  sets: GymSet[];
  set_count: number;
  exercise_names: string[];
  created_at: string;
  updated_at: string;
};

export type GymSessionInput = {
  date: string;
  split_type: string;
  duration_minutes?: number | null;
  notes?: string;
  sets?: GymSetInput[];
};

export type GymAnalytics = {
  summary: {
    total_sessions: number;
    total_sets: number;
    total_exercises_used: number;
    sessions_this_week: number;
    sessions_this_month: number;
    sets_this_week: number;
    sets_this_month: number;
  };
  muscle_coverage_this_week: Array<{
    muscle_group_id: number;
    muscle_group_name: string;
    primary_set_count: number;
    secondary_set_count: number;
    total_set_count: number;
  }>;
  split_distribution_this_month: Array<{
    split_type: string;
    session_count: number;
  }>;
  weekly_session_trend: Array<{
    week_start: string;
    session_count: number;
    set_count: number;
  }>;
  top_exercises_by_sets: Array<{
    exercise_id: number;
    exercise_name: string;
    primary_muscle_group_name: string;
    set_count: number;
  }>;
  top_exercises_by_volume: Array<{
    exercise_id: number;
    exercise_name: string;
    volume: number;
    set_count: number;
  }>;
  recent_sessions: Array<{
    id: number;
    date: string;
    split_type: string;
    duration_minutes: number | null;
    set_count: number;
    exercise_names: string[];
  }>;
  deterministic_insights: string[];
};

export type ClimbAttempt = {
  id: number;
  climb_name: string;
  grade_system: string;
  grade: string;
  style: string;
  result: string;
  attempts: number;
  notes: string;
  created_at: string;
};

export type ClimbAttemptInput = {
  climb_name?: string;
  grade_system: string;
  grade: string;
  style?: string;
  result: string;
  attempts: number;
  notes?: string;
};

export type ClimbingSession = {
  id: number;
  date: string;
  location: string;
  session_type: string;
  duration_minutes: number | null;
  notes: string;
  attempts: ClimbAttempt[];
  attempt_count: number;
  summary: string[];
  created_at: string;
  updated_at: string;
};

export type ClimbingSessionInput = {
  date: string;
  location?: string;
  session_type: string;
  duration_minutes?: number | null;
  notes?: string;
  attempts?: ClimbAttemptInput[];
};

export type ClimbingProject = {
  id: number;
  name: string;
  grade: string;
  grade_system: string;
  location: string;
  status: string;
  session_type: string;
  started_at: string | null;
  sent_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type ClimbingProjectInput = {
  name: string;
  grade: string;
  grade_system: string;
  location?: string;
  status: string;
  session_type?: string;
  started_at?: string | null;
  sent_at?: string | null;
  notes?: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  await throwIfNotOk(response);

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function throwIfNotOk(response: Response): Promise<void> {
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as { detail?: string } | Record<string, unknown>;

      if ("detail" in payload && typeof payload.detail === "string") {
        detail = payload.detail;
      } else {
        detail = JSON.stringify(payload);
      }
    } catch {
      // Keep the generic status message when the response is not JSON.
    }

    throw new Error(detail);
  }
}

function getCookie(name: string): string | null {
  const parts = document.cookie.split("; ");
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

async function ensureCsrfToken(): Promise<string> {
  const response = await request<{ csrfToken: string }>("/api/auth/csrf/");
  return getCookie("csrftoken") ?? response.csrfToken;
}

async function mutate<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const csrfToken = await ensureCsrfToken();

  return request<T>(path, {
    method,
    headers: {
      "X-CSRFToken": csrfToken,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function uploadRunningImport(file: File, source: RunningImportSource): Promise<RunningImportResult> {
  const csrfToken = await ensureCsrfToken();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source", source);

  const response = await fetch(`${API_BASE_URL}/api/running/imports/`, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-CSRFToken": csrfToken,
    },
    body: formData,
  });

  await throwIfNotOk(response);
  return response.json() as Promise<RunningImportResult>;
}

export function getRunningImports(): Promise<RunningImportBatch[]> {
  return request<RunningImportBatch[]>("/api/running/imports/");
}

export function getRunningImport(id: number): Promise<RunningImportBatch> {
  return request<RunningImportBatch>(`/api/running/imports/${id}/`);
}

export function getRunningAnalytics(): Promise<RunningAnalytics> {
  return request<RunningAnalytics>("/api/running/analytics/");
}

export const api = {
  health: () => request<HealthResponse>("/api/health/"),

  me: () => request<MeResponse>("/api/auth/me/"),

  csrf: () => request<{ csrfToken: string }>("/api/auth/csrf/"),

  async login(input: LoginInput) {
    return mutate<LoginResponse>("/api/auth/login/", "POST", input);
  },

  async logout() {
    return mutate<{ status: "ok" }>("/api/auth/logout/", "POST");
  },

  checkIns: {
    list: () => request<DailyCheckIn[]>("/api/journal/check-ins/"),

    create: (input: DailyCheckInInput) =>
      mutate<DailyCheckIn>("/api/journal/check-ins/", "POST", input),

    today: () => request<DailyCheckIn>("/api/journal/check-ins/today/"),

    saveToday: (input: DailyCheckInInput) =>
      mutate<DailyCheckIn>("/api/journal/check-ins/today/", "PATCH", input),
  },

  runs: {
    list: () => request<RunActivity[]>("/api/running/runs/"),

    create: (input: RunActivityInput) =>
      mutate<RunActivity>("/api/running/runs/", "POST", input),

    retrieve: (id: number) => request<RunActivity>(`/api/running/runs/${id}/`),

    update: (id: number, input: Partial<RunActivityInput>) =>
      mutate<RunActivity>(`/api/running/runs/${id}/`, "PATCH", input),

    delete: (id: number) => mutate<void>(`/api/running/runs/${id}/`, "DELETE"),
  },

  runningImports: {
    list: getRunningImports,
    retrieve: getRunningImport,
    upload: uploadRunningImport,
  },

  runningAnalytics: {
    get: getRunningAnalytics,
  },

  muscleGroups: {
    list: () => request<MuscleGroup[]>("/api/gym/muscle-groups/"),
  },

  gymAnalytics: {
    get: () => request<GymAnalytics>("/api/gym/analytics/"),
  },

  exercises: {
    list: () => request<Exercise[]>("/api/gym/exercises/"),

    create: (input: ExerciseInput) =>
      mutate<Exercise>("/api/gym/exercises/", "POST", input),

    retrieve: (id: number) => request<Exercise>(`/api/gym/exercises/${id}/`),

    update: (id: number, input: Partial<ExerciseInput>) =>
      mutate<Exercise>(`/api/gym/exercises/${id}/`, "PATCH", input),
  },

  exerciseReferences: {
    create: (exerciseId: number, input: ExerciseReferenceInput) =>
      mutate<ExerciseReference>(`/api/gym/exercises/${exerciseId}/references/`, "POST", input),

    update: (referenceId: number, input: Partial<ExerciseReferenceInput>) =>
      mutate<ExerciseReference>(`/api/gym/references/${referenceId}/`, "PATCH", input),

    delete: (referenceId: number) =>
      mutate<void>(`/api/gym/references/${referenceId}/`, "DELETE"),
  },

  gymSessions: {
    list: () => request<GymSession[]>("/api/gym/sessions/"),

    create: (input: GymSessionInput) =>
      mutate<GymSession>("/api/gym/sessions/", "POST", input),

    retrieve: (id: number) => request<GymSession>(`/api/gym/sessions/${id}/`),

    update: (id: number, input: Partial<GymSessionInput>) =>
      mutate<GymSession>(`/api/gym/sessions/${id}/`, "PATCH", input),

    delete: (id: number) => mutate<void>(`/api/gym/sessions/${id}/`, "DELETE"),
  },

  climbingSessions: {
    list: () => request<ClimbingSession[]>("/api/climbing/sessions/"),

    create: (input: ClimbingSessionInput) =>
      mutate<ClimbingSession>("/api/climbing/sessions/", "POST", input),

    retrieve: (id: number) => request<ClimbingSession>(`/api/climbing/sessions/${id}/`),

    update: (id: number, input: Partial<ClimbingSessionInput>) =>
      mutate<ClimbingSession>(`/api/climbing/sessions/${id}/`, "PATCH", input),

    delete: (id: number) => mutate<void>(`/api/climbing/sessions/${id}/`, "DELETE"),
  },

  climbingProjects: {
    list: () => request<ClimbingProject[]>("/api/climbing/projects/"),

    create: (input: ClimbingProjectInput) =>
      mutate<ClimbingProject>("/api/climbing/projects/", "POST", input),

    retrieve: (id: number) => request<ClimbingProject>(`/api/climbing/projects/${id}/`),

    update: (id: number, input: Partial<ClimbingProjectInput>) =>
      mutate<ClimbingProject>(`/api/climbing/projects/${id}/`, "PATCH", input),

    delete: (id: number) => mutate<void>(`/api/climbing/projects/${id}/`, "DELETE"),
  },
};
