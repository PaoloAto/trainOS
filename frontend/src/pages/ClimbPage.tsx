import { CheckCircle2, Edit3, Filter, FolderPlus, Mountain, Pause, Plus, Target, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { QuickLogSheet, type QuickLogMode } from "@/components/app/QuickLogSheet";
import { Card } from "@/components/common/Card";
import { OptionalNotesField } from "@/components/common/OptionalNotesField";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorStateCard, LoadingStateCard, LowDataCard } from "@/components/common/StateCards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClassName } from "@/components/ui/form-control";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, type ClimbingAnalytics, type ClimbingProject, type ClimbingProjectInput, type ClimbingSession } from "@/lib/api";
import { formatShortDate, todayISODate } from "@/lib/format";
import { cn } from "@/lib/utils";

type ClimbView = "sessions" | "projects";
type SessionFilter = "all" | "bouldering" | "top_rope" | "training_other";
type ProjectFilter = "active" | "stale" | "sent" | "paused" | "abandoned" | "all";
type ProjectAttemptHistoryItem = ClimbingProject["attempt_history"][number];

const sessionTypeOptions = ["bouldering", "top_rope", "sport", "trad", "training", "other"];
const gradeSystemOptions = ["v_scale", "yds", "font", "other"];
const projectStatusOptions = ["active", "sent", "paused", "abandoned"];
const CLIMB_VIEW_STORAGE_KEY = "trainos:climbing:view";
const SESSION_FILTER_STORAGE_KEY = "trainos:climbing:sessionFilter";
const PROJECT_FILTER_STORAGE_KEY = "trainos:climbing:projectFilter";

export function ClimbPage() {
  const [sessions, setSessions] = useState<ClimbingSession[]>([]);
  const [projects, setProjects] = useState<ClimbingProject[]>([]);
  const [analytics, setAnalytics] = useState<ClimbingAnalytics | null>(null);
  const [activeView, setActiveView] = useState<ClimbView>(() => storedClimbView());
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>(() => storedSessionFilter());
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>(() => storedProjectFilter());
  const [quickLogMode, setQuickLogMode] = useState<QuickLogMode | null>(null);
  const [quickLogProjectId, setQuickLogProjectId] = useState<number | null>(null);
  const [editingProject, setEditingProject] = useState<ClimbingProject | null>(null);
  const [selectedProject, setSelectedProject] = useState<ClimbingProject | null>(null);
  const [updatingProjectId, setUpdatingProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [sessionData, projectData, analyticsData] = await Promise.all([
        api.climbingSessions.list(),
        api.climbingProjects.list(),
        api.climbingAnalytics.get(),
      ]);
      setSessions(sessionData);
      setProjects(projectData);
      setSelectedProject((current) => (current ? projectData.find((project) => project.id === current.id) ?? current : null));
      setEditingProject((current) => (current ? projectData.find((project) => project.id === current.id) ?? current : null));
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load climbing data.");
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
        const [sessionData, projectData, analyticsData] = await Promise.all([
          api.climbingSessions.list(),
          api.climbingProjects.list(),
          api.climbingAnalytics.get(),
        ]);
        if (!active) return;
        setSessions(sessionData);
        setProjects(projectData);
        setAnalytics(analyticsData);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load climbing data.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      active = false;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    if (projectFilter === "all") return projects;
    if (projectFilter === "stale") {
      return projects.filter((project) => project.status === "active" && isProjectStale(project));
    }
    return projects.filter((project) => project.status === projectFilter);
  }, [projectFilter, projects]);

  const filteredSessions = useMemo(() => filterSessions(sessions, sessionFilter), [sessionFilter, sessions]);

  useEffect(() => {
    window.localStorage.setItem(CLIMB_VIEW_STORAGE_KEY, activeView);
  }, [activeView]);

  useEffect(() => {
    window.localStorage.setItem(SESSION_FILTER_STORAGE_KEY, sessionFilter);
  }, [sessionFilter]);

  useEffect(() => {
    window.localStorage.setItem(PROJECT_FILTER_STORAGE_KEY, projectFilter);
  }, [projectFilter]);

  async function updateProjectStatus(project: ClimbingProject, status: ProjectFilter) {
    if (status === "all") return;
    setUpdatingProjectId(project.id);
    try {
      await api.climbingProjects.update(project.id, {
        status,
        sent_at: status === "sent" ? project.sent_at ?? todayISODate() : project.sent_at,
      });
      await loadData();
    } finally {
      setUpdatingProjectId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Climbing"
        title="Climbing"
        description="Track bouldering sessions, top-rope routes, tries, sends, clean climbs, and active projects."
        accent="indigo"
        icon={Mountain}
      />

      <section className="mt-7 space-y-4 md:mt-8 md:space-y-5">
        {loading ? <LoadingStateCard message="Loading climbing dashboard..." accent="indigo" /> : null}
        {error ? <ErrorStateCard title="Climbing unavailable" message={error} /> : null}
        {!loading && !error && analytics ? (
          <>
            <ClimbTabs activeView={activeView} onChange={setActiveView} />
            {activeView === "sessions" ? (
              <SessionsView
                analytics={analytics}
                sessions={filteredSessions}
                totalSessions={sessions}
                sessionFilter={sessionFilter}
                onSessionFilterChange={setSessionFilter}
                onLogSession={() => setQuickLogMode("climb")}
              />
            ) : (
              <ProjectsView
                analytics={analytics}
                projects={filteredProjects}
                allProjects={projects}
                filter={projectFilter}
                updatingProjectId={updatingProjectId}
                onFilterChange={setProjectFilter}
                onCreateProject={() => setQuickLogMode("project")}
                onOpenProject={setSelectedProject}
                onEditProject={setEditingProject}
                onLogAttempt={(project) => {
                  setQuickLogProjectId(project.id);
                  setQuickLogMode("climb");
                }}
                onStatusChange={updateProjectStatus}
              />
            )}
          </>
        ) : null}
      </section>

      <QuickLogSheet
        open={quickLogMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQuickLogMode(null);
            setQuickLogProjectId(null);
          }
        }}
        initialMode={quickLogMode ?? "climb"}
        initialClimbingProjectId={quickLogProjectId}
        onSaved={() => void loadData()}
      />
      <ProjectDetailSheet
        project={selectedProject}
        open={selectedProject !== null}
        updatingProjectId={updatingProjectId}
        onOpenChange={(open) => {
          if (!open) setSelectedProject(null);
        }}
        onEdit={(project) => {
          setSelectedProject(null);
          setEditingProject(project);
        }}
        onLogAttempt={(project) => {
          setSelectedProject(null);
          setQuickLogProjectId(project.id);
          setQuickLogMode("climb");
        }}
        onStatusChange={updateProjectStatus}
      />
      <ProjectEditSheet
        project={editingProject}
        open={editingProject !== null}
        onOpenChange={(open) => {
          if (!open) setEditingProject(null);
        }}
        onSaved={async () => {
          setEditingProject(null);
          await loadData();
        }}
      />
    </>
  );
}

function ClimbTabs({ activeView, onChange }: { activeView: ClimbView; onChange: (view: ClimbView) => void }) {
  const tabs: Array<{ id: ClimbView; title: string; description: string }> = [
    { id: "sessions", title: "Sessions", description: "Bouldering and top rope" },
    { id: "projects", title: "Projects", description: "Active, sent, paused" },
  ];
  return (
    <div className="grid gap-2 rounded-3xl border border-border bg-bg-card p-2 min-[420px]:grid-cols-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={cn(
            "rounded-2xl border px-4 py-3 text-left transition",
            activeView === tab.id ? "border-indigo bg-indigo-muted text-indigo shadow-indigo" : "border-transparent text-text-secondary hover:border-border hover:bg-bg-elevated",
          )}
          onClick={() => onChange(tab.id)}
        >
          <span className="block text-sm font-semibold text-text-primary">{tab.title}</span>
          <span className="mt-1 block text-xs leading-5 text-text-muted">{tab.description}</span>
        </button>
      ))}
    </div>
  );
}

function SessionsView({
  analytics,
  sessions,
  totalSessions,
  sessionFilter,
  onSessionFilterChange,
  onLogSession,
}: {
  analytics: ClimbingAnalytics;
  sessions: ClimbingSession[];
  totalSessions: ClimbingSession[];
  sessionFilter: SessionFilter;
  onSessionFilterChange: (filter: SessionFilter) => void;
  onLogSession: () => void;
}) {
  return (
    <div className="space-y-4 md:space-y-5">
      <Card className="overflow-hidden p-0 shadow-indigo" delay={0.02}>
        <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Sessions</p>
              <h2 className="mt-1 text-xl font-semibold text-text-primary">Bouldering and top-rope baseline</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">Log tries, sends, clean routes, and styles without mixing the two disciplines.</p>
            </div>
            <Button type="button" className="w-full rounded-2xl border-indigo bg-indigo-muted text-indigo hover:bg-indigo/20 sm:w-auto" onClick={onLogSession}>
              <Plus className="h-4 w-4" />
              Log climbing session
            </Button>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 md:p-6">
          <SessionMonthHero analytics={analytics} />
          <ActiveProjectsHero analytics={analytics} />
        </div>
      </Card>

      {totalSessions.length === 0 ? (
        <EmptyActionCard icon={Mountain} title="No climbing sessions yet." message="Log bouldering or top rope to build your climbing baseline." actionLabel="Log climbing session" onAction={onLogSession} />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <BoulderingProgressionCard analytics={analytics} />
        <TopRopeProgressionCard analytics={analytics} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <SessionTypeBalance analytics={analytics} />
        <WeeklyClimbingTrend analytics={analytics} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <GradeDistributionCard title="Bouldering grades" items={analytics.bouldering_progression.send_rate_by_grade} successLabel="send rate" />
        <GradeDistributionCard title="Top-rope grades" items={analytics.top_rope_progression.clean_rate_by_grade} successLabel="clean rate" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <StyleStrengths analytics={analytics} />
        <StyleDistribution analytics={analytics} />
      </div>
      <InsightsCard insights={analytics.deterministic_insights} />
      <SessionFilterBar value={sessionFilter} onChange={onSessionFilterChange} />
      <RecentSessions sessions={sessions} totalCount={totalSessions.length} />
    </div>
  );
}

function ProjectsView({
  analytics,
  projects,
  allProjects,
  filter,
  updatingProjectId,
  onFilterChange,
  onCreateProject,
  onOpenProject,
  onEditProject,
  onLogAttempt,
  onStatusChange,
}: {
  analytics: ClimbingAnalytics;
  projects: ClimbingProject[];
  allProjects: ClimbingProject[];
  filter: ProjectFilter;
  updatingProjectId: number | null;
  onFilterChange: (filter: ProjectFilter) => void;
  onCreateProject: () => void;
  onOpenProject: (project: ClimbingProject) => void;
  onEditProject: (project: ClimbingProject) => void;
  onLogAttempt: (project: ClimbingProject) => void;
  onStatusChange: (project: ClimbingProject, status: ProjectFilter) => void | Promise<void>;
}) {
  const activeProjects = allProjects.filter((project) => project.status === "active");
  return (
    <div className="space-y-4 md:space-y-5">
      <Card className="overflow-hidden p-0 shadow-indigo" delay={0.02}>
        <div className="border-b border-border bg-bg-elevated/60 px-5 py-4 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Projects</p>
              <h2 className="mt-1 text-xl font-semibold text-text-primary">Track climbs you are working</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">Create bouldering or top-rope projects, then move them through active, sent, paused, or abandoned.</p>
            </div>
            <Button type="button" className="w-full rounded-2xl border-indigo bg-indigo-muted text-indigo hover:bg-indigo/20 sm:w-auto" onClick={onCreateProject}>
              <FolderPlus className="h-4 w-4" />
              Create project
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4 md:p-6">
          <Metric label="Active" value={String(analytics.projects.active_count)} />
          <Metric label="Sent" value={String(analytics.projects.sent_count)} />
          <Metric label="Paused" value={String(analytics.projects.paused_count)} />
          <Metric label="Abandoned" value={String(analytics.projects.abandoned_count)} />
        </div>
      </Card>

      {allProjects.length === 0 ? (
        <EmptyActionCard icon={FolderPlus} title="No projects yet." message="Create a bouldering or top-rope project to track tries." actionLabel="Create project" onAction={onCreateProject} />
      ) : activeProjects.length === 0 ? (
        <EmptyActionCard icon={Target} title="No active projects." message="Create a project or mark a sent route from your log." actionLabel="Create project" onAction={onCreateProject} />
      ) : null}

      <ProjectHighlights analytics={analytics} />
      <ProjectProgressOverview analytics={analytics} />
      <ProjectFilterBar value={filter} onChange={onFilterChange} />
      {projects.length === 0 ? (
        <LowDataCard accent="indigo" title="No projects found" message={projectFilterEmptyMessage(filter)} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {projects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              linkedAttempts={project.attempt_history}
              delay={index * 0.04}
              updating={updatingProjectId === project.id}
              onOpen={() => onOpenProject(project)}
              onEdit={() => onEditProject(project)}
              onLogAttempt={() => onLogAttempt(project)}
              onStatusChange={(status) => onStatusChange(project, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionMonthHero({ analytics }: { analytics: ClimbingAnalytics }) {
  const maxSessions = Math.max(1, ...analytics.weekly_climbing_trend.map((week) => week.session_count));
  return (
    <div className="rounded-3xl border border-indigo/50 bg-indigo-muted p-4">
      <p className="text-[0.68rem] uppercase tracking-[0.2em] text-indigo">Sessions this month</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className="metric-number text-4xl font-bold text-text-primary">{analytics.summary.sessions_this_month}</p>
          <p className="mt-1 text-sm text-text-secondary">+{analytics.summary.sessions_this_week} this week</p>
        </div>
        <div className="flex h-16 flex-1 items-end gap-1">
          {analytics.weekly_climbing_trend.map((week) => (
            <div key={week.week_start} className="flex flex-1 items-end rounded-full bg-bg-card/70">
              <div className="w-full rounded-full bg-indigo" style={{ height: `${barWidth(week.session_count, maxSessions)}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActiveProjectsHero({ analytics }: { analytics: ClimbingAnalytics }) {
  const activeProjects = analytics.project_progress.slice(0, 5);
  return (
    <div className="rounded-3xl border border-border bg-bg-elevated p-4">
      <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Active projects</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <p className="metric-number text-4xl font-bold text-text-primary">{analytics.summary.active_project_count}</p>
          <p className="mt-1 text-sm text-text-secondary">{analytics.summary.sent_project_count} sent total</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {activeProjects.length ? activeProjects.map((project) => (
            <span key={project.id} className="rounded-full border border-indigo bg-indigo-muted px-3 py-1 text-xs font-semibold text-indigo">{project.grade}</span>
          )) : <span className="rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-semibold text-text-muted">No active grades</span>}
        </div>
      </div>
    </div>
  );
}

function BoulderingProgressionCard({ analytics }: { analytics: ClimbingAnalytics }) {
  const bestRate = bestRateMetric(analytics.bouldering_progression.send_rate_by_grade);
  const hasData = analytics.bouldering_progression.grade_distribution.length > 0;
  return (
    <Card className="border-indigo/50">
      <SectionTitle icon={Mountain} eyebrow="Bouldering progression" title="V-grade baseline" />
      <div className="mt-5 rounded-3xl border border-indigo bg-indigo-muted p-5 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-indigo">Highest sent</p>
        <p className="metric-number mt-2 text-5xl font-bold text-text-primary">{analytics.bouldering_progression.highest_sent_grade ?? "--"}</p>
        {!hasData ? <p className="mt-3 text-sm leading-6 text-text-secondary">No bouldering data yet. Log V-scale tries to build your grade baseline.</p> : null}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        <Metric label="Highest tried" value={analytics.bouldering_progression.highest_attempted_grade ?? "--"} />
        <Metric label="Recent sent" value={analytics.bouldering_progression.recent_highest_sent_grade ?? "--"} />
        <Metric label={`Best rate${bestRate.grade ? ` at ${bestRate.grade}` : ""}`} value={bestRate.value} />
      </div>
      <p className="mt-4 rounded-2xl border border-indigo bg-indigo-muted p-3 text-sm leading-6 text-indigo">{analytics.bouldering_progression.v4_gap_label}</p>
    </Card>
  );
}

function TopRopeProgressionCard({ analytics }: { analytics: ClimbingAnalytics }) {
  const bestRate = bestRateMetric(analytics.top_rope_progression.clean_rate_by_grade);
  const hasData = analytics.top_rope_progression.grade_distribution.length > 0;
  return (
    <Card className="border-green/50">
      <SectionTitle icon={CheckCircle2} eyebrow="Top-rope progression" title="Clean route baseline" />
      <div className="mt-5 rounded-3xl border border-green bg-green-muted p-5 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-green">Highest clean</p>
        <p className="metric-number mt-2 text-5xl font-bold text-text-primary">{analytics.top_rope_progression.highest_clean_grade ?? "--"}</p>
        {!hasData ? <p className="mt-3 text-sm leading-6 text-text-secondary">No top-rope data yet. Log YDS routes to build your clean-route baseline.</p> : null}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        <Metric label="Highest tried" value={analytics.top_rope_progression.highest_attempted_grade ?? "--"} />
        <Metric label="Recent clean" value={analytics.top_rope_progression.recent_highest_clean_grade ?? "--"} />
        <Metric label={`Best rate${bestRate.grade ? ` at ${bestRate.grade}` : ""}`} value={bestRate.value} />
      </div>
      <details className="mt-4 rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">How route success is counted</summary>
        <p className="mt-2">Clean and complete results count as route success. Takes and falls stay visible so top-rope confidence remains honest.</p>
      </details>
    </Card>
  );
}

function WeeklyClimbingTrend({ analytics }: { analytics: ClimbingAnalytics }) {
  const maxAttempts = Math.max(1, ...analytics.weekly_climbing_trend.map((item) => item.attempt_count));
  return (
    <Card>
      <SectionTitle icon={Filter} eyebrow="Weekly trend" title="Last 8 weeks" />
      <div className="mt-5 flex h-44 items-end gap-2 rounded-2xl border border-border bg-bg-elevated p-4">
        {analytics.weekly_climbing_trend.map((week) => (
          <div key={week.week_start} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-28 w-full items-end rounded-full bg-bg-card">
              <div className="w-full rounded-full bg-indigo transition-all" style={{ height: `${barWidth(week.attempt_count, maxAttempts)}%` }} />
            </div>
            <span className="metric-number text-[0.62rem] text-text-muted">{formatShortDate(week.week_start)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        <Metric label="This week" value={String(analytics.weekly_climbing_trend.at(-1)?.session_count ?? 0)} unit="sessions" />
        <Metric label="Tries" value={String(analytics.weekly_climbing_trend.at(-1)?.attempt_count ?? 0)} />
        <Metric label="Sent/clean" value={String(analytics.weekly_climbing_trend.at(-1)?.send_or_clean_count ?? 0)} />
      </div>
    </Card>
  );
}

function GradeDistributionCard({ title, items, successLabel }: { title: string; items: ClimbingAnalytics["bouldering_progression"]["send_rate_by_grade"]; successLabel: string }) {
  return (
    <Card>
      <SectionTitle icon={Target} eyebrow="Grade distribution" title={title} />
      <div className="mt-4 space-y-2">
        {items.length ? items.map((item) => (
          <div key={`${item.grade_system}-${item.grade}`} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-2 last:border-0">
            <span className="metric-number text-sm font-semibold text-text-primary">{item.grade}</span>
            <div className="flex flex-wrap gap-1" aria-label={`${item.attempt_count} attempts`}>
              {Array.from({ length: Math.min(item.attempt_count, 10) }, (_, index) => <span key={index} className="h-2 w-2 rounded-full bg-indigo" />)}
              {item.attempt_count > 10 ? <span className="text-xs text-text-muted">+{item.attempt_count - 10}</span> : null}
            </div>
            <span className="text-xs text-text-secondary">{rateDisplay(item)} {successLabel}</span>
          </div>
        )) : <p className="border-l-2 border-indigo pl-3 text-sm leading-6 text-text-secondary">No grade data yet. Log tries to build this ladder.</p>}
      </div>
    </Card>
  );
}

function StyleStrengths({ analytics }: { analytics: ClimbingAnalytics }) {
  return (
    <Card>
      <SectionTitle icon={CheckCircle2} eyebrow="Style strengths" title="Success by climbing style" />
      <div className="mt-4 space-y-2">
        {analytics.style_strengths.length ? analytics.style_strengths.slice(0, 6).map((item) => (
          <div key={item.style} className="rounded-2xl border border-border bg-bg-elevated p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">{labelize(item.style)}</p>
                <p className="mt-1 text-xs text-text-muted">{item.success_count} success / {item.attempt_count} tries</p>
              </div>
              <span className="rounded-full border border-indigo bg-indigo-muted px-3 py-1 text-xs font-semibold text-indigo">{item.insight_label}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-card"><div className="h-full rounded-full bg-indigo" style={{ width: `${Math.round(item.success_rate * 100)}%` }} /></div>
          </div>
        )) : <p className="rounded-2xl border border-dashed border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">No style strengths yet. Add styles when logging climbs to reveal strengths and gaps.</p>}
      </div>
    </Card>
  );
}

function SessionTypeBalance({ analytics }: { analytics: ClimbingAnalytics }) {
  const visible = analytics.session_type_distribution.filter((item) => item.session_count > 0 || ["bouldering", "top_rope"].includes(item.session_type));
  const maxCount = Math.max(1, ...visible.map((item) => item.session_count));
  return (
    <Card>
      <SectionTitle icon={Filter} eyebrow="Session balance" title="Bouldering / top rope / other" />
      <div className="mt-4 space-y-2">
        {visible.map((item) => <DistributionRow key={item.session_type} label={labelize(item.session_type)} count={item.session_count} max={maxCount} detail={`${item.attempt_count} tries`} />)}
      </div>
    </Card>
  );
}

function StyleDistribution({ analytics }: { analytics: ClimbingAnalytics }) {
  const maxCount = Math.max(1, ...analytics.style_distribution.map((item) => item.attempt_count));
  return (
    <Card>
      <SectionTitle icon={Target} eyebrow="Style distribution" title="What you are climbing" />
      <div className="mt-4 space-y-2">
        {analytics.style_distribution.length ? analytics.style_distribution.slice(0, 8).map((item) => (
          <DistributionRow key={item.style} label={labelize(item.style)} count={item.attempt_count} max={maxCount} detail={`${item.send_or_clean_count} sent/clean`} />
        )) : <p className="rounded-2xl border border-dashed border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">No style data yet. Add style when logging climbs to see patterns.</p>}
      </div>
    </Card>
  );
}

function RecentSessions({ sessions, totalCount }: { sessions: ClimbingSession[]; totalCount: number }) {
  const visibleRecent = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 6);
  return (
    <div className="space-y-3">
      <SectionHeader label="Recent sessions" description="Bouldering and top-rope sessions stay together, with grade/result summaries." />
      {totalCount > 0 && visibleRecent.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">No sessions match this filter. Switch filters or log another climbing session.</p>
      ) : null}
      {visibleRecent.map((session, index) => (
        <Card key={session.id} delay={index * 0.04}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{formatShortDate(session.date)}</p>
              <h2 className="mt-1 text-lg font-semibold capitalize text-text-primary">{labelize(session.session_type)}</h2>
              <p className="mt-1 text-sm text-text-secondary">{session.location || "No location"}</p>
            </div>
            <div className="rounded-2xl border border-indigo bg-indigo-muted p-3 text-indigo"><Mountain className="h-5 w-5" /></div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Metric label="Tries" value={String(session.total_try_count)} />
            <Metric label="Logged climbs" value={String(session.logged_climb_count)} />
            <Metric label="Duration" value={session.duration_minutes ? String(session.duration_minutes) : "--"} unit={session.duration_minutes ? "min" : undefined} />
          </div>
          <div className="mt-4 rounded-2xl border border-border bg-bg-elevated p-3 text-sm text-text-secondary">
            {session.summary.length > 0 ? session.summary.join(" / ") : `${session.total_try_count} tries logged`}
          </div>
        </Card>
      ))}
    </div>
  );
}

function ProjectHighlights({ analytics }: { analytics: ClimbingAnalytics }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <SectionTitle icon={Target} eyebrow="Stale projects" title="Needs a decision" />
        <div className="mt-4 space-y-2">
          {analytics.projects.stale_projects.length ? analytics.projects.stale_projects.map((project) => (
            <ProjectMiniRow key={project.id} name={project.name} meta={`${project.grade} / ${project.location || "No location"}`} />
          )) : <p className="rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">No stale projects. Active climbs are still fresh.</p>}
        </div>
      </Card>
      <Card>
        <SectionTitle icon={CheckCircle2} eyebrow="Recently sent" title="Finished climbs" />
        <div className="mt-4 space-y-2">
          {analytics.projects.recently_sent_projects.length ? analytics.projects.recently_sent_projects.map((project) => (
            <ProjectMiniRow key={project.id} name={project.name} meta={`${project.grade} / sent ${project.sent_at ? formatShortDate(project.sent_at) : "recently"}`} />
          )) : <p className="rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">No sent projects yet. Mark a project sent when it is done.</p>}
        </div>
      </Card>
    </div>
  );
}

function ProjectProgressOverview({ analytics }: { analytics: ClimbingAnalytics }) {
  return (
    <Card>
      <SectionTitle icon={Target} eyebrow="Project progress" title="Active linked tries" />
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {analytics.project_progress.length ? analytics.project_progress.slice(0, 4).map((project) => (
          <div key={project.id} className="rounded-2xl border border-border bg-bg-elevated p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">{project.name}</p>
                <p className="mt-1 text-xs text-text-muted">{project.grade} / {project.sessions_worked} sessions worked</p>
              </div>
              <span className="metric-number text-sm font-bold text-indigo">{project.total_attempts}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-text-secondary">{project.total_attempts} tr{project.total_attempts === 1 ? "y" : "ies"} / {project.progress_label}</p>
          </div>
        )) : <p className="rounded-2xl border border-dashed border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">No active project tries yet. Link climbs from quick log to make project progress visible.</p>}
      </div>
    </Card>
  );
}

function ProjectFilterBar({ value, onChange }: { value: ProjectFilter; onChange: (filter: ProjectFilter) => void }) {
  const options: ProjectFilter[] = ["active", "stale", "sent", "paused", "abandoned", "all"];
  return (
    <div className="flex gap-2 overflow-x-auto rounded-3xl border border-border bg-bg-card p-2 pb-3">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={cn("whitespace-nowrap rounded-2xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition", value === option ? "border-indigo bg-indigo-muted text-indigo" : "border-transparent text-text-secondary hover:border-border hover:bg-bg-elevated")}
          onClick={() => onChange(option)}
        >
          {labelize(option)}
        </button>
      ))}
    </div>
  );
}

function SessionFilterBar({ value, onChange }: { value: SessionFilter; onChange: (filter: SessionFilter) => void }) {
  const options: Array<{ value: SessionFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "bouldering", label: "Bouldering" },
    { value: "top_rope", label: "Top rope" },
    { value: "training_other", label: "Training / Other" },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto rounded-3xl border border-border bg-bg-card p-2 pb-3">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn("whitespace-nowrap rounded-2xl border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition", value === option.value ? "border-indigo bg-indigo-muted text-indigo" : "border-transparent text-text-secondary hover:border-border hover:bg-bg-elevated")}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  linkedAttempts,
  delay,
  updating,
  onOpen,
  onEdit,
  onLogAttempt,
  onStatusChange,
}: {
  project: ClimbingProject;
  linkedAttempts: ProjectAttemptHistoryItem[];
  delay: number;
  updating: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onLogAttempt: () => void;
  onStatusChange: (status: ProjectFilter) => void;
}) {
  const stale = project.status === "active" && ((project.days_since_last_attempt ?? project.days_active) >= 30);
  return (
    <Card delay={delay} className="border-indigo/50">
      <button type="button" className="block w-full text-left" onClick={onOpen}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{labelize(project.session_type || "project")}</p>
            <h2 className="mt-1 text-lg font-semibold text-text-primary">{project.name}</h2>
            <p className="mt-1 text-sm text-text-secondary">{project.grade} / {project.location || "No location"}</p>
          </div>
          <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]", project.status === "sent" ? "border-green bg-green-muted text-green" : stale ? "border-amber bg-amber-muted text-amber" : "border-indigo bg-indigo-muted text-indigo")}>{stale ? "Stale" : labelize(project.status)}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Tries" value={String(project.total_try_count)} />
          <Metric label="Sessions" value={String(project.linked_session_count)} />
          <Metric label="Last attempt" value={project.latest_attempt_date ? formatShortDate(project.latest_attempt_date) : "--"} />
          <Metric label="Latest result" value={project.latest_result ? labelize(project.latest_result) : "--"} />
        </div>
        <p className="mt-4 rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">{project.attempt_summary_label}</p>
        <p className="mt-3 rounded-2xl border border-indigo/50 bg-indigo-muted p-3 text-sm leading-6 text-indigo">{project.progress_label}</p>
        {linkedAttempts.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {linkedAttempts.slice(0, 3).map((attempt) => (
              <span key={attempt.id} className="rounded-full border border-indigo/50 bg-indigo-muted px-3 py-1 text-xs font-semibold text-indigo">
                {attempt.grade} / {labelize(attempt.result)}
              </span>
            ))}
          </div>
        ) : null}
      </button>
      {project.notes ? <p className="mt-4 rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">{project.notes}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="rounded-2xl" onClick={onLogAttempt} disabled={updating}><Plus className="h-4 w-4" />Log attempt</Button>
        <Button type="button" variant="secondary" className="rounded-2xl" onClick={onEdit} disabled={updating}><Edit3 className="h-4 w-4" />Edit</Button>
        {project.status !== "sent" ? <Button type="button" className="rounded-2xl border-green bg-green-muted text-green hover:bg-green/20" onClick={() => onStatusChange("sent")} disabled={updating}><CheckCircle2 className="h-4 w-4" />Mark sent</Button> : null}
        {project.status !== "paused" ? <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => onStatusChange("paused")} disabled={updating}><Pause className="h-4 w-4" />Pause</Button> : null}
        {project.status !== "abandoned" ? <Button type="button" variant="danger" className="rounded-2xl" onClick={() => onStatusChange("abandoned")} disabled={updating}><Trash2 className="h-4 w-4" />Abandon</Button> : null}
      </div>
    </Card>
  );
}

function ProjectDetailSheet({
  project,
  open,
  updatingProjectId,
  onOpenChange,
  onEdit,
  onLogAttempt,
  onStatusChange,
}: {
  project: ClimbingProject | null;
  open: boolean;
  updatingProjectId: number | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (project: ClimbingProject) => void;
  onLogAttempt: (project: ClimbingProject) => void;
  onStatusChange: (project: ClimbingProject, status: ProjectFilter) => void | Promise<void>;
}) {
  if (!project) return null;
  const linkedAttempts = project.attempt_history;
  const updating = updatingProjectId === project.id;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto md:w-[min(92vw,44rem)]">
        <SheetHeader>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Project detail</p>
          <SheetTitle>{project.name}</SheetTitle>
          <SheetDescription>{project.grade} / {labelize(project.session_type || "project")} / {project.location || "No location"}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <Card className="border-indigo/50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Status</p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">{labelize(project.status)}</h2>
              </div>
              <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]", project.status === "sent" ? "border-green bg-green-muted text-green" : "border-indigo bg-indigo-muted text-indigo")}>
                {project.status === "sent" ? "Sent" : "Tracking"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Tries" value={String(project.total_try_count)} />
              <Metric label="Sessions" value={String(project.linked_session_count)} />
              <Metric label="Days active" value={String(project.days_active)} />
              <Metric label="Latest result" value={project.latest_result ? labelize(project.latest_result) : "--"} />
            </div>
            <p className="mt-4 rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">{project.attempt_summary_label}</p>
            <p className="mt-3 rounded-2xl border border-indigo/50 bg-indigo-muted p-3 text-sm leading-6 text-indigo">{project.progress_label}</p>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" className="rounded-2xl border-indigo bg-indigo-muted text-indigo hover:bg-indigo/20" onClick={() => onLogAttempt(project)} disabled={updating}>
              <Plus className="h-4 w-4" />
              Log attempt
            </Button>
            <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => onEdit(project)} disabled={updating}>
              <Edit3 className="h-4 w-4" />
              Edit project
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.status !== "sent" ? <Button type="button" className="rounded-2xl border-green bg-green-muted text-green hover:bg-green/20" onClick={() => onStatusChange(project, "sent")} disabled={updating}><CheckCircle2 className="h-4 w-4" />Mark sent</Button> : null}
            {project.status !== "paused" ? <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => onStatusChange(project, "paused")} disabled={updating}><Pause className="h-4 w-4" />Pause</Button> : null}
            {project.status !== "abandoned" ? <Button type="button" variant="danger" className="rounded-2xl" onClick={() => onStatusChange(project, "abandoned")} disabled={updating}><Trash2 className="h-4 w-4" />Abandon</Button> : null}
          </div>

          <div className="space-y-3">
            <SectionHeader label="Project timeline" description="Linked tries ordered oldest to newest so the progress story is visible." />
            {linkedAttempts.length ? linkedAttempts.map((attempt) => (
              <div key={attempt.id} className="rounded-2xl border border-border bg-bg-elevated p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{formatShortDate(attempt.date)} / {attempt.grade} / {labelize(attempt.result)}</p>
                    <p className="mt-1 text-xs text-text-muted">{attempt.location || "No location"} / {attempt.tries_count} tr{attempt.tries_count === 1 ? "y" : "ies"}</p>
                  </div>
                  <span className="rounded-full border border-indigo bg-indigo-muted px-3 py-1 text-xs font-semibold text-indigo">{labelize(attempt.session_type)}</span>
                </div>
                {attempt.notes ? <p className="mt-3 text-sm leading-6 text-text-secondary">{attempt.notes}</p> : null}
              </div>
            )) : (
              <p className="rounded-2xl border border-dashed border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">No linked tries yet. Log from this project to build the timeline.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProjectEditSheet({ project, open, onOpenChange, onSaved }: { project: ClimbingProject | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void | Promise<void> }) {
  if (!project) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto md:w-[min(92vw,42rem)]">
        <SheetHeader>
          <p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">Project</p>
          <SheetTitle>Edit project</SheetTitle>
          <SheetDescription>Update status, grade, location, and notes without changing old sessions.</SheetDescription>
        </SheetHeader>
        <ProjectEditForm project={project} onSaved={onSaved} onCancel={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function ProjectEditForm({ project, onSaved, onCancel }: { project: ClimbingProject; onSaved: () => void | Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(project.name);
  const [sessionType, setSessionType] = useState(project.session_type || "bouldering");
  const [gradeSystem, setGradeSystem] = useState(project.grade_system || "v_scale");
  const [grade, setGrade] = useState(project.grade);
  const [location, setLocation] = useState(project.location);
  const [status, setStatus] = useState(project.status);
  const [startedAt, setStartedAt] = useState(project.started_at ?? "");
  const [sentAt, setSentAt] = useState(project.sent_at ?? "");
  const [notes, setNotes] = useState(project.notes);
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
    const input: Partial<ClimbingProjectInput> = {
      name,
      session_type: sessionType,
      grade_system: gradeSystem,
      grade,
      location,
      status,
      started_at: startedAt || null,
      sent_at: status === "sent" ? sentAt || todayISODate() : sentAt || null,
      notes,
    };
    try {
      await api.climbingProjects.update(project.id, input);
      await Promise.resolve(onSaved());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update climbing project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="rounded-3xl border border-border bg-bg-base/40 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required className="focus:border-indigo focus:ring-indigo/20" /></Field>
          <Field label="Status"><select className={selectClassName("indigo")} value={status} onChange={(event) => setStatus(event.target.value)}>{projectStatusOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="Type"><select className={selectClassName("indigo")} value={sessionType} onChange={(event) => handleSessionTypeChange(event.target.value)}>{sessionTypeOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
          <Field label="Grade system"><select className={selectClassName("indigo")} value={gradeSystem} onChange={(event) => setGradeSystem(event.target.value)}>{gradeSystemOptions.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select></Field>
          <Field label="Grade"><Input value={grade} onChange={(event) => setGrade(event.target.value)} required className="focus:border-indigo focus:ring-indigo/20" /></Field>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="Location"><Input value={location} onChange={(event) => setLocation(event.target.value)} className="focus:border-indigo focus:ring-indigo/20" /></Field>
          <Field label="Started"><Input type="date" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} className="focus:border-indigo focus:ring-indigo/20" /></Field>
          <Field label="Sent"><Input type="date" value={sentAt} onChange={(event) => setSentAt(event.target.value)} className="focus:border-indigo focus:ring-indigo/20" /></Field>
        </div>
        <OptionalNotesField label="Project notes" value={notes} onChange={setNotes} collapsedLabel="+ Add project notes" placeholder="Beta, crux, tries, or next focus." helperText="These notes stay with this project." accent="indigo" className="mt-3" />
      </div>
      {error ? <p className="rounded-2xl border border-red bg-red-muted p-3 text-sm text-red">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" className="rounded-2xl" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="rounded-2xl border-indigo bg-indigo-muted text-indigo hover:bg-indigo/20" disabled={saving || !name || !grade}>{saving ? "Saving..." : "Save project"}</Button>
      </div>
    </form>
  );
}

function InsightsCard({ insights }: { insights: string[] }) {
  return (
    <Card>
      <SectionTitle icon={CheckCircle2} eyebrow="Training notes" title="Deterministic insights" />
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {insights.map((insight) => <p key={insight} className="rounded-2xl border border-border bg-bg-elevated p-3 text-sm leading-6 text-text-secondary">{insight}</p>)}
      </div>
    </Card>
  );
}

function EmptyActionCard({ icon: Icon, title, message, actionLabel, onAction }: { icon: typeof Mountain; title: string; message: string; actionLabel: string; onAction: () => void }) {
  return (
    <Card className="border-dashed">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo bg-indigo-muted text-indigo"><Icon className="h-5 w-5" /></div>
      <h2 className="mt-4 text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{message}</p>
      <Button type="button" className="mt-4 rounded-2xl border-indigo bg-indigo-muted text-indigo hover:bg-indigo/20" onClick={onAction}>{actionLabel}</Button>
    </Card>
  );
}

function ProjectMiniRow({ name, meta }: { name: string; meta: string }) {
  return <div className="rounded-2xl border border-border bg-bg-elevated p-3"><p className="text-sm font-semibold text-text-primary">{name}</p><p className="mt-1 text-xs text-text-muted">{meta}</p></div>;
}

function DistributionRow({ label, count, max, detail }: { label: string; count: number; max: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-3">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-text-primary">{label}</p><p className="mt-1 text-xs text-text-muted">{detail}</p></div>
        <span className={cn("metric-number text-sm font-bold", count > 0 ? "text-indigo" : "text-text-muted")}>{count}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-card"><div className="h-full rounded-full bg-indigo transition-all" style={{ width: `${barWidth(count, max)}%` }} /></div>
    </div>
  );
}

function SectionTitle({ icon: Icon, eyebrow, title }: { icon: typeof Mountain; eyebrow: string; title: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl border border-indigo bg-indigo-muted p-3 text-indigo"><Icon className="h-5 w-5" /></div>
      <div><p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{eyebrow}</p><h2 className="mt-1 text-lg font-semibold text-text-primary">{title}</h2></div>
    </div>
  );
}

function SectionHeader({ label, description }: { label: string; description: string }) {
  return <div><p className="text-[0.68rem] uppercase tracking-[0.2em] text-text-muted">{label}</p><p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p></div>;
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-3">
      <p className="text-[0.62rem] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="metric-number mt-1 text-base font-bold text-text-primary">{value}{unit ? <span className="ml-1 font-sans text-xs font-normal text-text-secondary">{unit}</span> : null}</p>
    </div>
  );
}

function barWidth(value: number, maxValue: number) {
  if (value <= 0) return 0;
  return Math.max(8, (value / Math.max(1, maxValue)) * 100);
}

function filterSessions(sessions: ClimbingSession[], filter: SessionFilter) {
  if (filter === "all") return sessions;
  if (filter === "training_other") {
    return sessions.filter((session) => !["bouldering", "top_rope"].includes(session.session_type));
  }
  return sessions.filter((session) => session.session_type === filter);
}

function isProjectStale(project: ClimbingProject) {
  return (project.days_since_last_attempt ?? project.days_active) >= 30;
}

function projectFilterEmptyMessage(filter: ProjectFilter) {
  if (filter === "stale") return "No stale projects. Active projects have recent tries or are still new.";
  if (filter === "sent") return "No sent projects yet. Linked sends and clean routes will appear here.";
  if (filter === "active") return "No active projects. Create a project to track tries.";
  return "No projects match this status filter.";
}

function rateDisplay(item: { attempt_count: number; success_rate: number }) {
  if (item.attempt_count < 3) return "--";
  return `${Math.round(item.success_rate * 100)}%`;
}

function bestRateMetric(items: ClimbingAnalytics["bouldering_progression"]["send_rate_by_grade"]) {
  const eligible = items.filter((item) => item.attempt_count >= 3);
  if (!eligible.length) return { value: "--", grade: "" };
  const best = [...eligible].sort((a, b) => b.success_rate - a.success_rate || b.attempt_count - a.attempt_count)[0];
  return { value: `${Math.round(best.success_rate * 100)}%`, grade: best.grade };
}

function storedClimbView(): ClimbView {
  const value = window.localStorage.getItem(CLIMB_VIEW_STORAGE_KEY);
  return value === "projects" ? "projects" : "sessions";
}

function storedSessionFilter(): SessionFilter {
  const value = window.localStorage.getItem(SESSION_FILTER_STORAGE_KEY);
  if (value === "bouldering" || value === "top_rope" || value === "training_other") return value;
  return "all";
}

function storedProjectFilter(): ProjectFilter {
  const value = window.localStorage.getItem(PROJECT_FILTER_STORAGE_KEY);
  if (value === "active" || value === "stale" || value === "sent" || value === "paused" || value === "abandoned" || value === "all") return value;
  return "active";
}

function labelize(value: string) {
  if (!value) return "None";
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-2"><span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">{label}</span>{children}</label>;
}
