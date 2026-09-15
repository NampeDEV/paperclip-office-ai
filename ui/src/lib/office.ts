import type { CSSProperties } from "react";
import type { Agent, HeartbeatRun, Issue, Project } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../api/heartbeats";
import type { OfficeSeat } from "../api/office";

export const BUNDLED_OFFICE_IMAGE = {
  src: "/office/office-night.webp",
  width: 1672,
  height: 941,
} as const;

export const OFFICE_SCENE_NAME = "AI Office";
export const OFFICE_MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;

const ACTIVE_TASK_STATUSES = new Set<Issue["status"]>([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
]);

export interface OfficeRunView {
  id: string;
  agentId: string;
  status: string;
  issueId: string | null;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  createdAt: Date | string;
  lastEventAt: Date | string | null;
}

export interface OfficeAgentCardView {
  agent: Agent;
  activeRuns: OfficeRunView[];
  latestRun: OfficeRunView | null;
  /** The task explicitly linked to the displayed run, when the API provides it. */
  runIssue: Issue | null;
  /** The most recently relevant task assigned to the agent, independent of a run link. */
  assignedIssue: Issue | null;
  /** The task used when opening the inspector: linked run task first, then assigned task. */
  issue: Issue | null;
  runProject: Project | null;
  assignedProject: Project | null;
  /** The project corresponding to the displayed task context. */
  project: Project | null;
  isOutsideSelectedProject: boolean;
  lastUpdateAt: Date | string | null;
}

export function createDefaultOfficeSeats(): OfficeSeat[] {
  return [
    { id: "00000000-0000-4000-8000-000000000001", label: "Back left", agentId: null, x: 0.07, y: 0.32, width: 0.24, height: 0.19, zIndex: 1 },
    { id: "00000000-0000-4000-8000-000000000002", label: "Back center", agentId: null, x: 0.38, y: 0.32, width: 0.24, height: 0.19, zIndex: 1 },
    { id: "00000000-0000-4000-8000-000000000003", label: "Back right", agentId: null, x: 0.69, y: 0.32, width: 0.24, height: 0.19, zIndex: 1 },
    { id: "00000000-0000-4000-8000-000000000004", label: "Front left", agentId: null, x: 0.07, y: 0.72, width: 0.24, height: 0.19, zIndex: 2 },
    { id: "00000000-0000-4000-8000-000000000005", label: "Front center", agentId: null, x: 0.38, y: 0.72, width: 0.24, height: 0.19, zIndex: 2 },
    { id: "00000000-0000-4000-8000-000000000006", label: "Front right", agentId: null, x: 0.69, y: 0.72, width: 0.24, height: 0.19, zIndex: 2 },
  ];
}

function dateValue(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function issueIdFromRun(run: HeartbeatRun | LiveRunForIssue): string | null {
  if ("issueId" in run && typeof run.issueId === "string" && run.issueId.length > 0) {
    return run.issueId;
  }
  if (!("contextSnapshot" in run) || !run.contextSnapshot) return null;
  const snapshot = run.contextSnapshot;
  const candidate = snapshot.issueId ?? snapshot.taskId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function toRunView(run: HeartbeatRun | LiveRunForIssue): OfficeRunView {
  return {
    id: run.id,
    agentId: run.agentId,
    status: run.status,
    issueId: issueIdFromRun(run),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
    lastEventAt: "lastEventAt" in run ? run.lastEventAt ?? null : null,
  };
}

function runTime(run: OfficeRunView): number {
  return dateValue(run.lastEventAt) || dateValue(run.startedAt) || dateValue(run.finishedAt) || dateValue(run.createdAt);
}

function issueTime(issue: Issue): number {
  return dateValue(issue.updatedAt) || dateValue(issue.createdAt);
}

function latestOfficeTimestamp(...values: Array<Date | string | null | undefined>): Date | string | null {
  let latest: Date | string | null = null;
  let latestValue = 0;
  for (const value of values) {
    const candidate = dateValue(value);
    if (candidate > latestValue) {
      latest = value ?? null;
      latestValue = candidate;
    }
  }
  return latest;
}

const TERMINAL_RUN_STATUSES = new Set([
  "succeeded",
  "interrupted",
  "failed",
  "cancelled",
  "timed_out",
]);

export function isTerminalOfficeRunStatus(status: string): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

function mergeRunViews(primary: OfficeRunView, secondary: OfficeRunView): OfficeRunView {
  return {
    ...secondary,
    ...primary,
    // A history row does not currently carry issueId. Retain the authorized
    // live-run link while preferring the durable terminal status.
    issueId: primary.issueId ?? secondary.issueId,
    startedAt: primary.startedAt ?? secondary.startedAt,
    finishedAt: primary.finishedAt ?? secondary.finishedAt,
    lastEventAt: primary.lastEventAt ?? secondary.lastEventAt,
  };
}

function chooseRunVersion(current: OfficeRunView, incoming: OfficeRunView): OfficeRunView {
  const currentTerminal = isTerminalOfficeRunStatus(current.status);
  const incomingTerminal = isTerminalOfficeRunStatus(incoming.status);
  if (currentTerminal !== incomingTerminal) {
    // A live endpoint can briefly retain an old non-terminal event after the
    // durable run history has transitioned to terminal. Never regress it.
    return currentTerminal
      ? mergeRunViews(current, incoming)
      : mergeRunViews(incoming, current);
  }
  return runTime(incoming) >= runTime(current)
    ? mergeRunViews(incoming, current)
    : mergeRunViews(current, incoming);
}

function selectAssignedIssue(
  agentId: string,
  issues: Issue[],
): Issue | null {
  return [...issues]
    .filter((issue) => issue.assigneeAgentId === agentId)
    .sort((left, right) => {
      const leftActive = ACTIVE_TASK_STATUSES.has(left.status) ? 1 : 0;
      const rightActive = ACTIVE_TASK_STATUSES.has(right.status) ? 1 : 0;
      return rightActive - leftActive || issueTime(right) - issueTime(left);
    })[0] ?? null;
}

/** Builds a truthful display model without deriving lifecycle from run/task state. */
export function buildOfficeAgentCards(input: {
  agents: Agent[];
  issues: Issue[];
  projects: Project[];
  liveRuns: LiveRunForIssue[];
  recentRuns: HeartbeatRun[];
  selectedProjectId: string | null;
}): OfficeAgentCardView[] {
  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  const issueById = new Map(input.issues.map((issue) => [issue.id, issue]));
  const runsByAgent = new Map<string, Map<string, OfficeRunView>>();
  const liveRunIdsByAgent = new Map<string, Set<string>>();

  const addRun = (run: OfficeRunView, isLive: boolean) => {
    const runs = runsByAgent.get(run.agentId) ?? new Map<string, OfficeRunView>();
    const current = runs.get(run.id);
    runs.set(run.id, current ? chooseRunVersion(current, run) : run);
    runsByAgent.set(run.agentId, runs);
    if (isLive) {
      const ids = liveRunIdsByAgent.get(run.agentId) ?? new Set<string>();
      ids.add(run.id);
      liveRunIdsByAgent.set(run.agentId, ids);
    }
  };

  input.recentRuns.map(toRunView).forEach((run) => addRun(run, false));
  input.liveRuns.map(toRunView).forEach((run) => addRun(run, true));

  return input.agents.map((agent) => {
    const agentRuns = [...(runsByAgent.get(agent.id)?.values() ?? [])]
      .sort((left, right) => runTime(right) - runTime(left));
    const allActiveRuns = agentRuns
      .filter((run) => liveRunIdsByAgent.get(agent.id)?.has(run.id) && !isTerminalOfficeRunStatus(run.status))
      .sort((left, right) => runTime(right) - runTime(left));
    const latestRun = allActiveRuns[0] ?? agentRuns[0] ?? null;
    const runIssue = latestRun?.issueId ? issueById.get(latestRun.issueId) ?? null : null;
    const assignedIssue = selectAssignedIssue(agent.id, input.issues);
    const issue = runIssue ?? assignedIssue;
    const runProject = runIssue?.projectId ? projectById.get(runIssue.projectId) ?? null : null;
    const assignedProject = assignedIssue?.projectId ? projectById.get(assignedIssue.projectId) ?? null : null;
    const project = runIssue ? runProject : assignedProject;
    const lastUpdateAt = latestOfficeTimestamp(
      latestRun?.lastEventAt,
      latestRun?.finishedAt,
      latestRun?.startedAt,
      latestRun?.createdAt,
      issue?.updatedAt,
      agent.lastHeartbeatAt,
    );

    return {
      agent,
      activeRuns: allActiveRuns,
      latestRun,
      runIssue,
      assignedIssue,
      issue,
      runProject,
      assignedProject,
      project,
      isOutsideSelectedProject: input.selectedProjectId !== null
        && project !== null
        && project.id !== input.selectedProjectId,
      lastUpdateAt,
    };
  });
}

export function filterOfficeTasks(issues: Issue[], projectId: string | null): Issue[] {
  return projectId === null ? issues : issues.filter((issue) => issue.projectId === projectId);
}

export function activeOfficeTasks(issues: Issue[]): Issue[] {
  return issues.filter((issue) => ACTIVE_TASK_STATUSES.has(issue.status));
}

export function clampOfficeSeat(seat: OfficeSeat): OfficeSeat {
  const width = Math.min(1, Math.max(0.05, seat.width));
  const height = Math.min(1, Math.max(0.05, seat.height));
  return {
    ...seat,
    x: Math.min(1 - width, Math.max(0, seat.x)),
    y: Math.min(1 - height, Math.max(0, seat.y)),
    width,
    height,
  };
}

export function updateOfficeSeat(seat: OfficeSeat, changes: Partial<OfficeSeat>): OfficeSeat {
  return clampOfficeSeat({ ...seat, ...changes });
}

export function hasDuplicateSeatBinding(seats: OfficeSeat[]): boolean {
  const boundAgents = seats.flatMap((seat) => seat.agentId ? [seat.agentId] : []);
  return new Set(boundAgents).size !== boundAgents.length;
}

export function isAgentAvailableForSeat(seats: OfficeSeat[], agentId: string, seatId: string): boolean {
  return !seats.some((seat) => seat.id !== seatId && seat.agentId === agentId);
}

export function officeSeatStyle(seat: OfficeSeat): CSSProperties {
  return {
    "--office-seat-x": String(seat.x),
    "--office-seat-y": String(seat.y),
    "--office-seat-width": String(seat.width),
    "--office-seat-height": String(seat.height),
    "--office-seat-z": String(seat.zIndex),
  } as CSSProperties;
}

export function agentLifecycleLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "Available",
    idle: "Idle",
    running: "Working",
    paused: "Paused",
    error: "Needs attention",
    pending_approval: "Awaiting agent approval",
    terminated: "Terminated",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

export function runStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "Queued",
    scheduled_retry: "Retry scheduled",
    running: "Running",
    succeeded: "Succeeded",
    interrupted: "Interrupted",
    failed: "Failed",
    cancelled: "Cancelled",
    timed_out: "Timed out",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}
