import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { agentsApi } from "@/api/agents";
import { activityApi } from "@/api/activity";
import { heartbeatsApi } from "@/api/heartbeats";
import { issuesApi } from "@/api/issues";
import { useDialogActions } from "@/context/DialogContext";
import { formatIssueActivityAction } from "@/lib/activity-format";
import { documentDisplayTitle, workProductHref } from "@/lib/issue-artifacts";
import { attachmentFilename, attachmentOpenPath } from "@/lib/issue-attachments";
import { queryKeys } from "@/lib/queryKeys";
import { Link } from "@/lib/router";
import { agentRouteRef, formatDateTime, issueUrl } from "@/lib/utils";
import { AgentStatusBadge, IssueStatusBadge, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  officeInspectorRunNowResultMessage,
  officeInspectorSafeHref,
  officeInspectorScopedIssues,
} from "./office-inspector";

type InspectorTab = "overview" | "discussion" | "activity" | "files";

type PendingAction = {
  label: string;
  scope: "agent" | "task";
  scopeKey: string;
};

export interface OfficeInspectorProps {
  companyId: string;
  agentId: string | null;
  issueId: string | null;
  projectId: string | null;
  onClose: () => void;
  onSelectIssue: (id: string) => void;
}

function messageForError(error: unknown): string {
  return error instanceof Error ? error.message : "Paperclip could not complete that action.";
}

function commentAuthorLabel(
  comment: { authorType: string; authorAgentId: string | null },
  agentNames: Map<string, string>,
): string {
  if (comment.authorType === "agent") {
    return comment.authorAgentId ? agentNames.get(comment.authorAgentId) ?? "Agent" : "Agent";
  }
  if (comment.authorType === "user") return "Board user";
  return "System";
}

export function OfficeInspector({
  companyId,
  agentId,
  issueId,
  projectId,
  onClose,
  onSelectIssue,
}: OfficeInspectorProps) {
  const queryClient = useQueryClient();
  const { openNewIssue } = useDialogActions();
  const [activeTab, setActiveTab] = useState<InspectorTab>("overview");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(issueId);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionLockRef = useRef(false);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: Boolean(companyId),
  });
  const selectedListAgent = useMemo(
    () => agentsQuery.data?.find((agent) => agent.id === agentId && agent.companyId === companyId) ?? null,
    [agentId, agentsQuery.data, companyId],
  );
  const agentDetailQuery = useQuery({
    queryKey: queryKeys.agents.detail(selectedListAgent?.id ?? "office-inspector-none"),
    queryFn: () => agentsApi.get(selectedListAgent!.id, companyId),
    enabled: Boolean(selectedListAgent),
    retry: false,
  });
  const agent = agentDetailQuery.data?.companyId === companyId
    ? agentDetailQuery.data
    : selectedListAgent;
  const runtimeStateQuery = useQuery({
    queryKey: queryKeys.agents.runtimeState(agent?.id ?? "office-inspector-none"),
    queryFn: () => agentsApi.runtimeState(agent!.id, companyId),
    enabled: Boolean(agent),
    retry: false,
  });

  const issuesQuery = useQuery({
    queryKey: projectId
      ? queryKeys.issues.listByProject(companyId, projectId)
      : queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId, projectId ? { projectId } : undefined),
    enabled: Boolean(companyId),
  });
  const listedExplicitIssue = useMemo(
    () => issueId
      ? (issuesQuery.data ?? []).find((issue) => issue.id === issueId && issue.companyId === companyId) ?? null
      : null,
    [companyId, issueId, issuesQuery.data],
  );
  const explicitIssueQuery = useQuery({
    queryKey: queryKeys.issues.detail(issueId ?? "office-inspector-none"),
    queryFn: () => issuesApi.get(issueId!),
    enabled: Boolean(companyId && issueId && !listedExplicitIssue),
    retry: false,
  });
  const explicitIssue = explicitIssueQuery.data ?? listedExplicitIssue;
  const scopedIssues = useMemo(
    () => officeInspectorScopedIssues(issuesQuery.data ?? [], { companyId, projectId, agentId }, explicitIssue),
    [agentId, companyId, explicitIssue, issuesQuery.data, projectId],
  );

  useEffect(() => {
    const requestedIssueIsVisible = issueId && scopedIssues.some((issue) => issue.id === issueId);
    const currentIssueIsVisible = selectedTaskId && scopedIssues.some((issue) => issue.id === selectedTaskId);
    const nextTaskId = requestedIssueIsVisible
      ? issueId
      : currentIssueIsVisible
        ? selectedTaskId
        : scopedIssues[0]?.id ?? null;
    if (nextTaskId !== selectedTaskId) setSelectedTaskId(nextTaskId);
  }, [issueId, scopedIssues, selectedTaskId]);

  const selectedIssue = useMemo(
    () =>
      scopedIssues.find((issue) => issue.id === selectedTaskId)
      ?? scopedIssues.find((issue) => issue.id === issueId)
      ?? scopedIssues[0]
      ?? null,
    [issueId, scopedIssues, selectedTaskId],
  );
  const selectedIssueId = selectedIssue?.id ?? null;
  const agentScopeKey = `${companyId}:${agentId ?? "none"}`;
  const taskScopeKey = `${agentScopeKey}:${projectId ?? "all"}:${selectedIssueId ?? "none"}`;
  const actionScopeRef = useRef({ agent: agentScopeKey, task: taskScopeKey });
  actionScopeRef.current = { agent: agentScopeKey, task: taskScopeKey };
  const hasPendingAction = pendingAction !== null;
  const isPendingAction = (label: string) =>
    pendingAction?.label === label
    && pendingAction.scopeKey === actionScopeRef.current[pendingAction.scope];

  useEffect(() => {
    setMessageBody("");
  }, [selectedIssueId]);

  const commentsQuery = useQuery({
    queryKey: queryKeys.issues.commentsList(selectedIssueId ?? "office-inspector-none"),
    queryFn: () => issuesApi.listComments(selectedIssueId!, { order: "asc", limit: 100 }),
    enabled: Boolean(selectedIssueId),
  });
  const activityQuery = useQuery({
    queryKey: queryKeys.issues.activity(selectedIssueId ?? "office-inspector-none"),
    queryFn: () => activityApi.forIssue(selectedIssueId!),
    enabled: Boolean(selectedIssueId),
  });
  const runsQuery = useQuery({
    queryKey: queryKeys.issues.runs(selectedIssueId ?? "office-inspector-none"),
    queryFn: () => activityApi.runsForIssue(selectedIssueId!),
    enabled: Boolean(selectedIssueId),
  });
  const approvalsQuery = useQuery({
    queryKey: queryKeys.issues.approvals(selectedIssueId ?? "office-inspector-none"),
    queryFn: () => issuesApi.listApprovals(selectedIssueId!),
    enabled: Boolean(selectedIssueId),
  });
  const attachmentsQuery = useQuery({
    queryKey: queryKeys.issues.attachments(selectedIssueId ?? "office-inspector-none"),
    queryFn: () => issuesApi.listAttachments(selectedIssueId!),
    enabled: Boolean(selectedIssueId),
  });
  const documentsQuery = useQuery({
    queryKey: queryKeys.issues.documents(selectedIssueId ?? "office-inspector-none"),
    queryFn: () => issuesApi.listDocuments(selectedIssueId!),
    enabled: Boolean(selectedIssueId),
  });
  const workProductsQuery = useQuery({
    queryKey: queryKeys.issues.workProducts(selectedIssueId ?? "office-inspector-none"),
    queryFn: () => issuesApi.listWorkProducts(selectedIssueId!),
    enabled: Boolean(selectedIssueId),
  });
  const queuedCommentsQuery = useQuery({
    queryKey: queryKeys.issues.queuedComments(selectedIssueId ?? "office-inspector-none"),
    queryFn: () => issuesApi.getQueuedComments(selectedIssueId!),
    enabled: Boolean(selectedIssueId),
    retry: false,
  });

  const agentNames = useMemo(
    () => new Map((agentsQuery.data ?? []).map((candidate) => [candidate.id, candidate.name])),
    [agentsQuery.data],
  );
  const comments = useMemo(
    () => (commentsQuery.data ?? []).filter((comment) => comment.companyId === companyId && comment.issueId === selectedIssueId),
    [commentsQuery.data, companyId, selectedIssueId],
  );
  const activity = useMemo(
    () => (activityQuery.data ?? []).filter((event) => event.companyId === companyId),
    [activityQuery.data, companyId],
  );
  const runs = runsQuery.data ?? [];
  const selectedRun = runs.find((run) => run.runId === selectedRunId) ?? runs[0] ?? null;
  const selectedRunAgent = selectedRun
    ? (agentsQuery.data ?? []).find((candidate) => candidate.id === selectedRun.agentId) ?? null
    : null;
  const attachments = useMemo(
    () => (attachmentsQuery.data ?? []).filter((attachment) => attachment.companyId === companyId && attachment.issueId === selectedIssueId),
    [attachmentsQuery.data, companyId, selectedIssueId],
  );
  const documents = useMemo(
    () => (documentsQuery.data ?? []).filter((document) => document.companyId === companyId && document.issueId === selectedIssueId),
    [companyId, documentsQuery.data, selectedIssueId],
  );
  const workProducts = useMemo(
    () => (workProductsQuery.data ?? []).filter((product) => product.companyId === companyId && product.issueId === selectedIssueId),
    [companyId, selectedIssueId, workProductsQuery.data],
  );
  const approvals = useMemo(
    () => (approvalsQuery.data ?? []).filter((approval) => approval.companyId === companyId),
    [approvalsQuery.data, companyId],
  );

  const invalidateAgent = useCallback(async () => {
    if (!agent) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.runtimeState(agent.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(companyId, agent.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId) }),
    ]);
  }, [agent, companyId, queryClient]);
  const invalidateSelectedIssue = useCallback(async () => {
    if (!selectedIssueId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) }),
      ...(projectId
        ? [queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) })]
        : []),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(selectedIssueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.commentsList(selectedIssueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(selectedIssueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(selectedIssueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.approvals(selectedIssueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.attachments(selectedIssueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.documents(selectedIssueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.workProducts(selectedIssueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.queuedComments(selectedIssueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId) }),
    ]);
  }, [companyId, projectId, queryClient, selectedIssueId]);
  const requestAction = useCallback(async (
    label: string,
    scope: PendingAction["scope"],
    request: () => Promise<unknown>,
    resultMessage: string | ((result: unknown) => string),
    afterSuccess?: (isCurrentScope: boolean) => Promise<void> | void,
  ) => {
    if (actionLockRef.current) return;
    const scopeKey = actionScopeRef.current[scope];
    actionLockRef.current = true;
    setPendingAction({ label, scope, scopeKey });
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await request();
      const isCurrentScope = actionScopeRef.current[scope] === scopeKey;
      const refresh = afterSuccess?.(isCurrentScope);
      if (refresh) await Promise.resolve(refresh).catch(() => undefined);
      if (actionScopeRef.current[scope] === scopeKey) {
        setActionNotice(
          typeof resultMessage === "function" ? resultMessage(result) : resultMessage,
        );
      }
    } catch (error) {
      if (actionScopeRef.current[scope] === scopeKey) {
        setActionError(messageForError(error));
      }
    } finally {
      actionLockRef.current = false;
      setPendingAction(null);
    }
  }, []);

  const agentActionBlocked = !agent || agent.status === "pending_approval" || agent.status === "terminated";
  const runNowDisabled = Boolean(agentActionBlocked || agent?.status === "paused" || hasPendingAction);
  const pauseResumeDisabled = Boolean(agentActionBlocked || hasPendingAction);
  const selectedRunActive = selectedRun?.status === "queued" || selectedRun?.status === "running";
  const queue = queuedCommentsQuery.data;
  const canInterruptQueuedMessages = queue?.protocol === "legacy" && Boolean(queue.queueId);
  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "discussion", label: "Discussion" },
    { id: "activity", label: "Activity" },
    { id: "files", label: "Files" },
  ];
  const activeTabId = `office-inspector-${activeTab}-tab`;
  const activePanelId = `office-inspector-${activeTab}-panel`;

  function selectTask(id: string) {
    if (!scopedIssues.some((issue) => issue.id === id)) return;
    setSelectedTaskId(id);
    setSelectedRunId(null);
    onSelectIssue(id);
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">Office inspector</p>
          <h2 className="truncate text-lg font-semibold">{agent?.name ?? "Task details"}</h2>
          {projectId ? <p className="text-xs text-muted-foreground">Filtered to the selected project</p> : null}
        </div>
        <Button type="button" variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={onClose} aria-label="Close inspector">
          <X aria-hidden />
        </Button>
      </div>

      {actionError ? <div role="alert" className="rounded-md border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive">{actionError}</div> : null}
      {actionNotice ? <div role="status" className="rounded-md border border-border bg-muted/50 p-3 text-sm">{actionNotice}</div> : null}

      <div className="flex flex-wrap gap-2" aria-label="Agent controls">
        <Button
          type="button"
          variant="default"
          className="min-h-11"
          disabled={runNowDisabled}
          onClick={() => {
            if (!agent) return;
            void requestAction(
              "run",
              "agent",
              () => agentsApi.invoke(agent.id, companyId),
              officeInspectorRunNowResultMessage,
              invalidateAgent,
            );
          }}
        >
          {isPendingAction("run") ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Run agent now
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pauseResumeDisabled}
          onClick={() => {
            if (!agent) return;
            const paused = agent.status === "paused";
            void requestAction(
              paused ? "resume" : "pause",
              "agent",
              () => paused ? agentsApi.resume(agent.id, companyId) : agentsApi.pause(agent.id, companyId),
              paused
                ? "Agent resumed."
                : "Agent paused. The pause endpoint also cancelled this agent's active runs.",
              invalidateAgent,
            );
          }}
        >
          {isPendingAction("pause") || isPendingAction("resume") ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {agent?.status === "paused" ? "Resume agent" : "Pause agent"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={!agent || hasPendingAction}
          onClick={() => {
            if (!agent) return;
            openNewIssue({
              assigneeAgentId: agent.id,
              ...(projectId ? { projectId } : {}),
            });
          }}
        >
          New task
        </Button>
      </div>
      {agent ? <p className="text-xs text-muted-foreground">Run agent now starts an agent-level on-demand run and does not change the selected task. Pausing also cancels this agent's active runs.</p> : null}

      {agent ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <AgentStatusBadge status={agent.status} />
          <Link className="text-primary underline-offset-4 hover:underline" to={`/agents/${agentRouteRef(agent)}`}>
            Open agent details
          </Link>
          <span className="text-muted-foreground">Provider: {agent.adapterType}</span>
          <span className="text-muted-foreground">Last heartbeat: {agent.lastHeartbeatAt ? formatDateTime(agent.lastHeartbeatAt) : "Not reported"}</span>
          {runtimeStateQuery.data?.lastError ? <span className="text-destructive">Latest runtime error: {runtimeStateQuery.data.lastError}</span> : null}
          {runtimeStateQuery.isError ? <span className="text-muted-foreground">Runtime state is unavailable; native controls will report any compatibility denial.</span> : null}
        </div>
      ) : null}
      {agentDetailQuery.isError ? <p className="text-sm text-destructive">Agent details could not be loaded for this company.</p> : null}

      <div className="rounded-lg border border-border">
        <div className="border-b border-border p-3">
          <p className="text-sm font-medium">Tasks in scope</p>
          {issuesQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading tasks…</p> : null}
          {issuesQuery.isError ? <p className="text-sm text-destructive">Tasks could not be loaded.</p> : null}
          {issueId && explicitIssueQuery.isError ? <p className="text-sm text-destructive">The selected task could not be loaded for this company.</p> : null}
          {!issuesQuery.isLoading && !issuesQuery.isError && scopedIssues.length === 0 ? <p className="text-sm text-muted-foreground">No tasks match this agent and project.</p> : null}
        </div>
        {scopedIssues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-pressed={selectedIssueId === issue.id}
            onClick={() => selectTask(issue.id)}
          >
            <span className="min-w-0 truncate text-sm font-medium">{issue.identifier ? `${issue.identifier} · ${issue.title}` : issue.title}</span>
            <IssueStatusBadge status={issue.status} />
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Inspector content">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            role="tab"
            id={`office-inspector-${tab.id}-tab`}
            aria-controls={`office-inspector-${tab.id}-panel`}
            aria-selected={activeTab === tab.id}
            variant={activeTab === tab.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {!selectedIssue ? <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">Select a task to inspect its native Paperclip record.</p> : null}

      {selectedIssue && activeTab === "overview" ? (
        <div id={activePanelId} aria-labelledby={activeTabId} role="tabpanel" className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Task workflow</p>
                <h3 className="break-words text-base font-semibold">{selectedIssue.title}</h3>
                <p className="text-sm text-muted-foreground">{selectedIssue.projectId ? "Project-linked task" : "No project assigned"}</p>
              </div>
              <IssueStatusBadge status={selectedIssue.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link className="text-primary underline-offset-4 hover:underline" to={issueUrl(selectedIssue)}>Open task details</Link>
              {selectedIssue.activeRecoveryAction ? <Link className="text-primary underline-offset-4 hover:underline" to={issueUrl(selectedIssue)}>Open recovery action</Link> : null}
              {selectedIssue.scheduledRetry ? <Link className="text-primary underline-offset-4 hover:underline" to={issueUrl(selectedIssue)}>Open scheduled retry</Link> : null}
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground">Run execution</p>
            {runsQuery.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading runs…</p> : null}
            {!runsQuery.isLoading && runs.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No runs are attached to this task.</p> : null}
            {runs.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                {runs.map((run) => (
                  <button
                    key={run.runId}
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-pressed={selectedRun?.runId === run.runId}
                    onClick={() => setSelectedRunId(run.runId)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">Run {run.runId}</span>
                      <span className="block text-xs text-muted-foreground">{formatDateTime(run.startedAt ?? run.createdAt)}</span>
                    </span>
                    <StatusBadge status={run.status} />
                  </button>
                ))}
              </div>
            ) : null}
            {selectedRun ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={selectedRun.status} label={`Run ${selectedRun.status}`} />
                {selectedRunAgent ? <Link className="text-primary underline-offset-4 hover:underline" to={`/agents/${agentRouteRef(selectedRunAgent)}/runs/${selectedRun.runId}`}>Open native run</Link> : <Link className="text-primary underline-offset-4 hover:underline" to={issueUrl(selectedIssue)}>Open task run history</Link>}
                {selectedRunActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    disabled={hasPendingAction}
                    onClick={() => {
                      void requestAction(
                        "cancel run",
                        "task",
                        () => heartbeatsApi.cancel(selectedRun.runId),
                        "Cancellation requested. The runtime may take time to acknowledge and stop this run.",
                        async () => {
                          await invalidateSelectedIssue();
                          await queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(companyId, selectedRun.agentId) });
                        },
                      );
                    }}
                  >
                    {isPendingAction("cancel run") ? <Loader2 className="animate-spin" aria-hidden /> : null}
                    Request cancellation
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          {canInterruptQueuedMessages ? (
            <section className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium">Queued messages are waiting</p>
              <p className="mt-1 text-sm text-muted-foreground">Interrupting asks Paperclip to stop the active turn, then deliver the queued messages. It does not mark the task complete.</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                disabled={hasPendingAction}
                onClick={() => {
                  void requestAction(
                    "interrupt queued messages",
                    "task",
                    () => issuesApi.interruptLatestQueuedComments(selectedIssue.id, queue?.targetRunId ?? null),
                    "Interrupt requested. Queued messages will be sent after the previous run stops.",
                    invalidateSelectedIssue,
                  );
                }}
              >
                {isPendingAction("interrupt queued messages") ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Interrupt and send queued messages
              </Button>
            </section>
          ) : queue?.entries.length ? (
            <section className="rounded-lg border border-border p-4 text-sm">
              <p className="font-medium">Queued messages are waiting</p>
              <p className="mt-1 text-muted-foreground">This runner exposes native steering instead of interrupt delivery.</p>
              <Link className="mt-2 inline-block text-primary underline-offset-4 hover:underline" to={issueUrl(selectedIssue)}>Open task to steer messages</Link>
            </section>
          ) : null}

          {approvals.length > 0 ? (
            <section className="rounded-lg border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">Approvals</p>
              <div className="mt-2 flex flex-col gap-2">
                {approvals.map((approval) => (
                  <Link key={approval.id} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 hover:bg-accent/50" to={`/approvals/${approval.id}`}>
                    <span className="min-w-0 truncate text-sm">{approval.type.replace(/_/g, " ")}</span>
                    <StatusBadge status={approval.status} />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {selectedIssue && activeTab === "discussion" ? (
        <div id={activePanelId} aria-labelledby={activeTabId} role="tabpanel" className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Discussion for selected task</p>
                <h3 className="text-base font-semibold">{selectedIssue.title}</h3>
              </div>
              <Link className="text-sm text-primary underline-offset-4 hover:underline" to={issueUrl(selectedIssue)}>Open task</Link>
            </div>
            <Textarea
              className="mt-3 min-h-24"
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              placeholder="Write a message for this task"
              disabled={hasPendingAction}
            />
            <p className="mt-2 text-xs text-muted-foreground">Sending a message may wake an eligible agent. An active run receives this as a queued continuation unless you use its native interrupt control.</p>
            <Button
              type="button"
              className="mt-3 min-h-11"
              disabled={!messageBody.trim() || hasPendingAction}
              onClick={() => {
                const body = messageBody.trim();
                if (!body) return;
                void requestAction(
                  "send message",
                  "task",
                  () => issuesApi.addComment(selectedIssue.id, body, undefined, false, undefined, crypto.randomUUID()),
                  "Message saved to this task.",
                  async (isCurrentScope) => {
                    if (isCurrentScope) setMessageBody("");
                    await invalidateSelectedIssue();
                  },
                );
              }}
            >
              {isPendingAction("send message") ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Send message
            </Button>
          </section>
          <section className="rounded-lg border border-border p-4">
            {commentsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading discussion…</p> : null}
            {commentsQuery.isError ? <p className="text-sm text-destructive">Discussion could not be loaded.</p> : null}
            {!commentsQuery.isLoading && !commentsQuery.isError && comments.length === 0 ? <p className="text-sm text-muted-foreground">No messages on this task yet.</p> : null}
            <div className="flex flex-col gap-3" role="log" aria-live="polite">
              {comments.map((comment) => (
                <article key={comment.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{commentAuthorLabel(comment, agentNames)}</span>
                    <time dateTime={new Date(comment.createdAt).toISOString()}>{formatDateTime(comment.createdAt)}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {selectedIssue && activeTab === "activity" ? (
        <section id={activePanelId} aria-labelledby={activeTabId} role="tabpanel" className="rounded-lg border border-border p-4">
          {activityQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading activity…</p> : null}
          {activityQuery.isError ? <p className="text-sm text-destructive">Activity could not be loaded.</p> : null}
          {!activityQuery.isLoading && !activityQuery.isError && activity.length === 0 ? <p className="text-sm text-muted-foreground">No activity has been recorded for this task.</p> : null}
          <ol className="flex flex-col gap-3">
            {activity.map((event) => (
              <li key={event.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                <p className="text-sm">{formatIssueActivityAction(event.action, event.details)}</p>
                <time className="text-xs text-muted-foreground" dateTime={new Date(event.createdAt).toISOString()}>{formatDateTime(event.createdAt)}</time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {selectedIssue && activeTab === "files" ? (
        <div id={activePanelId} aria-labelledby={activeTabId} role="tabpanel" className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground">Attachments</p>
            {attachmentsQuery.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading files…</p> : null}
            {!attachmentsQuery.isLoading && attachments.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No attachments on this task.</p> : null}
            <div className="mt-2 flex flex-col gap-2">
              {attachments.map((attachment) => {
                const href = officeInspectorSafeHref(attachmentOpenPath(attachment));
                return href ? (
                  <a key={attachment.id} className="flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-sm text-primary underline-offset-4 hover:bg-accent/50 hover:underline" href={href} target="_blank" rel="noreferrer">
                    {attachmentFilename(attachment)}
                  </a>
                ) : (
                  <span key={attachment.id} className="flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-sm">{attachmentFilename(attachment)}</span>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground">Work products</p>
            {workProductsQuery.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading work products…</p> : null}
            {!workProductsQuery.isLoading && workProducts.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No work products on this task.</p> : null}
            <div className="mt-2 flex flex-col gap-2">
              {workProducts.map((product) => {
                const href = officeInspectorSafeHref(workProductHref(product));
                const content = <><span className="min-w-0 truncate">{product.title}</span><StatusBadge status={product.status} /></>;
                return href ? (
                  <a key={product.id} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm text-primary hover:bg-accent/50" href={href} target="_blank" rel="noreferrer">{content}</a>
                ) : (
                  <Link key={product.id} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/50" to={issueUrl(selectedIssue)}>{content}</Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground">Documents</p>
            {documentsQuery.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading documents…</p> : null}
            {!documentsQuery.isLoading && documents.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No documents on this task.</p> : null}
            <div className="mt-2 flex flex-col gap-2">
              {documents.map((document) => (
                <Link key={document.id} className="flex min-h-11 items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-accent/50" to={issueUrl(selectedIssue)}>{documentDisplayTitle(document)}</Link>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
