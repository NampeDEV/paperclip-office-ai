import type { Agent, Issue } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../api/heartbeats";

type Task = Pick<Issue, "id" | "companyId" | "projectId" | "assigneeAgentId" | "status">;
type Run = Pick<LiveRunForIssue, "id" | "agentId" | "issueId" | "status">;

export function officeWorkload(companyId: string, projectId: string | null,
  agents: Pick<Agent, "id" | "name" | "companyId">[], tasks: Task[], runs: Run[]) {
  const companyTasks = new Map(tasks.filter(t => t.companyId === companyId).map(t => [t.id, t]));
  const rows = new Map(agents.filter(a => a.companyId === companyId).map(a => [a.id, {
    id: a.id, name: a.name, assigned: 0, blocked: 0, review: 0, running: 0, queued: 0,
  }]));
  let unassigned = 0;
  let unlinkedRuns = 0;
  for (const task of companyTasks.values()) {
    if ((projectId && task.projectId !== projectId) || ["done", "cancelled"].includes(task.status)) continue;
    const row = task.assigneeAgentId ? rows.get(task.assigneeAgentId) : undefined;
    if (!row) { unassigned++; continue; }
    row.assigned++;
    if (task.status === "blocked") row.blocked++;
    if (task.status === "in_review") row.review++;
  }
  for (const run of new Map(runs.map(r => [r.id, r])).values()) {
    const row = rows.get(run.agentId);
    if (!row || !["running", "queued", "scheduled_retry"].includes(run.status)) continue;
    const task = run.issueId ? companyTasks.get(run.issueId) : undefined;
    if (!task) unlinkedRuns++;
    if (projectId && task?.projectId !== projectId) continue;
    if (run.status === "running") row.running++;
    else row.queued++;
  }
  return { rows: [...rows.values()], unassigned, unlinkedRuns };
}
