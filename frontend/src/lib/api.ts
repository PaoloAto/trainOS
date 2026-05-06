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
  | "source"
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

export type MuscleGroup = {
  id: number;
  name: string;
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

  muscleGroups: {
    list: () => request<MuscleGroup[]>("/api/gym/muscle-groups/"),
  },

  exercises: {
    list: () => request<Exercise[]>("/api/gym/exercises/"),

    create: (input: ExerciseInput) =>
      mutate<Exercise>("/api/gym/exercises/", "POST", input),

    retrieve: (id: number) => request<Exercise>(`/api/gym/exercises/${id}/`),

    update: (id: number, input: Partial<ExerciseInput>) =>
      mutate<Exercise>(`/api/gym/exercises/${id}/`, "PATCH", input),
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
