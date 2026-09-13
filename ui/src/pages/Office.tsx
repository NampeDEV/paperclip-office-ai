import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { Building2, LayoutPanelTop, Plus, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { agentsApi } from "@/api/agents";
import { heartbeatsApi } from "@/api/heartbeats";
import { issuesApi } from "@/api/issues";
import { officeApi, officeQueryKeys } from "@/api/office";
import { projectsApi } from "@/api/projects";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { IssueStatusBadge } from "@/components/StatusBadge";
import { AgentCard } from "@/components/office/AgentCard";
import { OfficeInspector } from "@/components/office/OfficeInspector";
import { OfficeScene } from "@/components/office/OfficeScene";
import { OfficeWorkload } from "@/components/office/OfficeWorkload";
import { SceneEditor } from "@/components/office/SceneEditor";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useDialogActions } from "@/context/DialogContext";
import { useCompanyLiveEvent, useLiveConnection } from "@/context/LiveUpdatesProvider";
import {
  BUNDLED_OFFICE_IMAGE,
  activeOfficeTasks,
  buildOfficeAgentCards,
  createDefaultOfficeSeats,
  filterOfficeTasks,
} from "@/lib/office";
import { issueUrl, relativeTime } from "@/lib/utils";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";

const OFFICE_EVENT_REFETCH_DELAY_MS = 400;
const OFFICE_MOBILE_QUERY = "(max-width: 47.99rem)";

function useMobileOfficeLayout(): boolean {
  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(OFFICE_MOBILE_QUERY).matches
  ));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(OFFICE_MOBILE_QUERY);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function taskUpdatedAt(issue: Issue): number {
  const value = new Date(issue.updatedAt ?? issue.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function connectionCopy(status: "connecting" | "connected" | "disconnected", lastEventAt: string | null): string {
  if (status === "connected") {
    return lastEventAt ? `Live updates · last event ${relativeTime(lastEventAt)}` : "Live updates connected";
  }
  if (status === "connecting") return "Connecting to live updates";
  return lastEventAt
    ? `Connection disconnected · last event ${relativeTime(lastEventAt)}`
    : "Connection disconnected · no live event received";
}

export function Office() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { openNewIssue } = useDialogActions();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const liveConnection = useLiveConnection();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [mobileSceneOverviewOpen, setMobileSceneOverviewOpen] = useState(false);
  const isMobileOfficeLayout = useMobileOfficeLayout();
  const eventRefreshTimer = useRef<number | null>(null);
  const sawDisconnectedConnection = useRef(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Office" }]);
  }, [setBreadcrumbs]);

  const invalidateOfficeSnapshots = useCallback(() => {
    if (!selectedCompanyId) return;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: officeQueryKeys.scenes(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) }),
      ...(selectedAgentId
        ? [
            queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(selectedAgentId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.agents.runtimeState(selectedAgentId) }),
          ]
        : []),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.attention(selectedCompanyId) }),
    ]);
  }, [queryClient, selectedAgentId, selectedCompanyId]);

  const scheduleOfficeRefetch = useCallback(() => {
    if (eventRefreshTimer.current !== null) return;
    eventRefreshTimer.current = window.setTimeout(() => {
      eventRefreshTimer.current = null;
      invalidateOfficeSnapshots();
    }, OFFICE_EVENT_REFETCH_DELAY_MS);
  }, [invalidateOfficeSnapshots]);

  useCompanyLiveEvent(scheduleOfficeRefetch);

  useEffect(() => () => {
    if (eventRefreshTimer.current !== null) window.clearTimeout(eventRefreshTimer.current);
  }, []);

  useEffect(() => {
    if (liveConnection.status === "disconnected") {
      sawDisconnectedConnection.current = true;
      return;
    }
    if (liveConnection.status === "connected" && sawDisconnectedConnection.current) {
      sawDisconnectedConnection.current = false;
      scheduleOfficeRefetch();
    }
  }, [liveConnection.status, scheduleOfficeRefetch]);

  useEffect(() => {
    setSelectedProjectId(null);
    setSelectedAgentId(null);
    setSelectedIssueId(null);
    setEditorOpen(false);
    setMobileSceneOverviewOpen(false);
  }, [selectedCompanyId]);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!, { includeArchived: true }),
    queryFn: () => projectsApi.list(selectedCompanyId!, { includeArchived: true }),
    enabled: !!selectedCompanyId,
  });
  const issuesQuery = useQuery({
    queryKey: [...queryKeys.issues.list(selectedCompanyId!), "office-all"] as const,
    queryFn: () => issuesApi.listAll(selectedCompanyId!, {}),
    enabled: !!selectedCompanyId,
  });
  const liveRunsQuery = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const recentRunsQuery = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!, undefined, 200, { summary: true }),
    enabled: !!selectedCompanyId,
  });
  const sceneQuery = useQuery({
    queryKey: officeQueryKeys.scene(selectedCompanyId!, selectedProjectId),
    queryFn: () => officeApi.getScene(selectedCompanyId!, selectedProjectId),
    enabled: !!selectedCompanyId,
  });

  const retryAll = useCallback(() => {
    void Promise.all([
      agentsQuery.refetch(),
      projectsQuery.refetch(),
      issuesQuery.refetch(),
      liveRunsQuery.refetch(),
      recentRunsQuery.refetch(),
      sceneQuery.refetch(),
    ]);
  }, [agentsQuery, issuesQuery, liveRunsQuery, projectsQuery, recentRunsQuery, sceneQuery]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Building2} message="Select an organization to open its Office." />;
  }

  const coreQueries = [agentsQuery, projectsQuery, issuesQuery, liveRunsQuery, recentRunsQuery];
  const coreError = coreQueries.find((query) => query.error && query.data === undefined)?.error;
  if (coreError || (sceneQuery.error && sceneQuery.data === undefined)) {
    const error = coreError ?? sceneQuery.error;
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-5">
        <h1 className="text-lg font-semibold">Office data could not load</h1>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Try loading the Office again."}
        </p>
        <Button type="button" variant="outline" onClick={retryAll}>
          <RotateCcw /> Retry
        </Button>
      </div>
    );
  }

  const isInitialLoading = coreQueries.some((query) => query.isLoading) || sceneQuery.isLoading;
  if (isInitialLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading Office">
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
        <div className="office-loading-stage animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const agents = agentsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const issues = issuesQuery.data ?? [];
  const selectedProject = selectedProjectId ? projects.find((project) => project.id === selectedProjectId) ?? null : null;
  const selectedProjectStillExists = selectedProjectId === null || selectedProject !== null;
  const activeProjectId = selectedProjectStillExists ? selectedProjectId : null;
  const cards = buildOfficeAgentCards({
    agents,
    issues,
    projects,
    liveRuns: liveRunsQuery.data ?? [],
    recentRuns: recentRunsQuery.data ?? [],
    selectedProjectId: activeProjectId,
  });
  const filteredTasks = filterOfficeTasks(issues, activeProjectId);
  const activeTasks = activeOfficeTasks(filteredTasks).sort((left, right) => taskUpdatedAt(right) - taskUpdatedAt(left));
  const scene = sceneQuery.data ?? null;
  const sceneUsesCompanyFallback = activeProjectId !== null && scene?.projectId === null;
  const seats = scene?.seats ?? createDefaultOfficeSeats();
  const seatedAgentIds = new Set(seats.flatMap((seat) => seat.agentId ? [seat.agentId] : []));
  const unseatedCards = cards.filter((card) => !seatedAgentIds.has(card.agent.id));
  const selectedIssue = selectedIssueId ? issues.find((issue) => issue.id === selectedIssueId) ?? null : null;
  const staleErrors = [agentsQuery, projectsQuery, issuesQuery, liveRunsQuery, recentRunsQuery, sceneQuery]
    .filter((query) => query.error && query.data !== undefined)
    .map((query) => query.error instanceof Error ? query.error.message : "A refresh failed.");

  const selectAgent = (card: (typeof cards)[number]) => {
    const issueInScope = card.issue && (activeProjectId === null || card.issue.projectId === activeProjectId);
    setSelectedAgentId(card.agent.id);
    setSelectedIssueId(issueInScope ? card.issue!.id : null);
  };

  const selectIssue = (issueId: string) => {
    const issue = issues.find((candidate) => candidate.id === issueId) ?? null;
    if (activeProjectId !== null && issue?.projectId !== activeProjectId) return;
    setSelectedIssueId(issueId);
    setSelectedAgentId(issue?.assigneeAgentId ?? null);
  };

  const closeInspector = () => {
    setSelectedAgentId(null);
    setSelectedIssueId(null);
  };
  const hasInspectorSelection = selectedAgentId !== null || selectedIssueId !== null;
  const inspector = hasInspectorSelection ? (
    <OfficeInspector
      key={`${selectedCompanyId}:${selectedAgentId ?? "none"}:${selectedIssueId ?? "none"}:${activeProjectId ?? "all"}`}
      companyId={selectedCompanyId}
      agentId={selectedAgentId}
      issueId={selectedIssueId}
      projectId={activeProjectId}
      onClose={closeInspector}
      onSelectIssue={selectIssue}
    />
  ) : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <LayoutPanelTop className="size-5 shrink-0 text-muted-foreground" />
            <h1 className="truncate text-xl font-semibold">{scene?.name ?? "AI Office"}</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedCompany?.name ?? "Organization"} · {activeProjectId ? `${filteredTasks.length} tasks in ${selectedProject?.name ?? "selected project"}` : `${filteredTasks.length} company tasks`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="office-project-filter">Project scope</label>
          <select
            id="office-project-filter"
            value={activeProjectId ?? ""}
            className="min-h-(--sz-44px) rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            onChange={(event) => {
              const nextProjectId = event.target.value || null;
              setSelectedProjectId(nextProjectId);
              if (nextProjectId && selectedIssue?.projectId !== nextProjectId) setSelectedIssueId(null);
            }}
          >
            <option value="">All projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <span className="office-connection-status" data-status={liveConnection.status}>
            {liveConnection.status === "connected" ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
            {connectionCopy(liveConnection.status, liveConnection.lastEventAt)}
          </span>
          <Button type="button" className="min-h-(--sz-44px)" onClick={() => openNewIssue(activeProjectId ? { projectId: activeProjectId } : undefined)}>
            <Plus /> New task
          </Button>
        </div>
      </header>

      {liveConnection.status === "disconnected" ? (
        <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground" role="status">
          Live connection is unavailable. Values shown are the last server snapshots.
        </p>
      ) : null}
      {staleErrors.length > 0 ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="status">
          Some Office data could not refresh: {staleErrors[0]}
        </p>
      ) : null}

      <div className="office-content-grid" data-has-selection={hasInspectorSelection || undefined}>
        <div className="min-w-0 space-y-4">
          <OfficeScene
            backgroundAssetId={scene?.backgroundAssetId ?? null}
            imageWidth={scene?.imageWidth ?? BUNDLED_OFFICE_IMAGE.width}
            imageHeight={scene?.imageHeight ?? BUNDLED_OFFICE_IMAGE.height}
            seats={seats}
            characters={scene?.characters ?? []}
            cards={cards}
            selectedAgentId={selectedAgentId}
            mobileVisible={mobileSceneOverviewOpen}
            onSelectAgent={selectAgent}
          />
          {isMobileOfficeLayout && mobileSceneOverviewOpen ? (
            <p className="text-sm text-muted-foreground">Scene overview. Use the agent list below to select a readable card.</p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {sceneUsesCompanyFallback
                ? "Using the company layout. Editing creates a project layout."
                : scene ? `Saved ${scene.projectId ? "project" : "company"} layout · revision ${scene.revision}` : "Default layout is not saved yet."}
            </p>
            <div className="flex flex-wrap gap-2">
              {isMobileOfficeLayout ? (
                <Button type="button" variant="outline" className="min-h-(--sz-44px)" onClick={() => setMobileSceneOverviewOpen((open) => !open)}>
                  {mobileSceneOverviewOpen ? "Hide scene overview" : "Show scene overview"}
                </Button>
              ) : null}
              <Button type="button" variant="outline" className="min-h-(--sz-44px)" onClick={() => setEditorOpen(true)}>
                Edit layout
              </Button>
            </div>
          </div>

          <OfficeWorkload
            companyId={selectedCompanyId}
            projectId={activeProjectId}
            agents={agents}
            tasks={issues}
            runs={liveRunsQuery.data ?? []}
          />

          <section className="office-mobile-agent-list" aria-labelledby="office-mobile-agents-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="office-mobile-agents-heading" className="text-base font-semibold">Agents</h2>
              <span className="text-sm text-muted-foreground">{cards.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {cards.map((card) => (
                <AgentCard
                  key={card.agent.id}
                  card={card}
                  variant="list"
                  selected={selectedAgentId === card.agent.id}
                  onSelect={selectAgent}
                />
              ))}
            </div>
          </section>
        </div>

        {!isMobileOfficeLayout && hasInspectorSelection ? (
          <aside className="office-inspector-panel min-w-0" aria-label="Office inspector">
            {inspector}
          </aside>
        ) : null}
      </div>

      {isMobileOfficeLayout && hasInspectorSelection ? (
        <Sheet open onOpenChange={(next) => (!next ? closeInspector() : null)}>
          <SheetContent side="right" showCloseButton={false} className="office-mobile-inspector-sheet overflow-y-auto p-4">
            <SheetHeader className="sr-only">
              <SheetTitle>Office inspector</SheetTitle>
              <SheetDescription>Selected agent and task details.</SheetDescription>
            </SheetHeader>
            {inspector}
          </SheetContent>
        </Sheet>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="office-active-tasks-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="office-active-tasks-heading" className="text-base font-semibold">Active tasks</h2>
            <p className="text-sm text-muted-foreground">
              {activeProjectId ? `In ${selectedProject?.name ?? "the selected project"}` : "Across all projects"} · {activeTasks.length} active
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="min-h-(--sz-44px)">
            <Link to="/issues">Open tasks</Link>
          </Button>
        </div>
        {activeTasks.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No active tasks in this scope.</p>
        ) : (
          <div className="mt-4 divide-y divide-border">
            {activeTasks.map((issue) => {
              const agent = issue.assigneeAgentId ? agents.find((candidate) => candidate.id === issue.assigneeAgentId) ?? null : null;
              const project = issue.projectId ? projects.find((candidate) => candidate.id === issue.projectId) ?? null : null;
              return (
                <article key={issue.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    className="min-h-(--sz-44px) min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => selectIssue(issue.id)}
                  >
                    <span className="block truncate text-sm font-medium">{issue.title}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {agent?.name ?? "Unassigned"} · {project?.name ?? (issue.projectId ? "Project unavailable" : "No project")} · Updated {relativeTime(issue.updatedAt)}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <IssueStatusBadge status={issue.status} />
                    <Link className="min-h-(--sz-44px) inline-flex items-center text-sm text-primary underline-offset-4 hover:underline" to={issueUrl(issue)}>
                      Open
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="office-unseated-heading">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="office-unseated-heading" className="text-base font-semibold">Unseated agents</h2>
            <p className="text-sm text-muted-foreground">Agents remain available even when the scene has no seat for them.</p>
          </div>
          <span className="text-sm text-muted-foreground">{unseatedCards.length}</span>
        </div>
        {unseatedCards.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Every listed agent has a seat.</p>
        ) : (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {unseatedCards.map((card) => (
              <AgentCard
                key={card.agent.id}
                card={card}
                variant="list"
                selected={selectedAgentId === card.agent.id}
                onSelect={selectAgent}
              />
            ))}
          </div>
        )}
      </section>

      <SceneEditor
        companyId={selectedCompanyId}
        projectId={activeProjectId}
        scene={scene}
        agents={agents}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={(saved) => queryClient.setQueryData(officeQueryKeys.scene(selectedCompanyId, saved.projectId), saved)}
        onReload={async () => {
          const result = await sceneQuery.refetch();
          return result.data ?? null;
        }}
      />
    </div>
  );
}
