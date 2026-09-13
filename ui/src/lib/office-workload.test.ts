import { expect, it } from "vitest";
import { officeWorkload } from "./office-workload";

it("reconciles project workload, deduplicates runs, and never assigns unlinked work to a project", () => {
  const agents = [{ id: "a", companyId: "c", name: "Agent" }];
  const tasks = [
    { id: "one", companyId: "c", projectId: "p", assigneeAgentId: "a", status: "blocked" as const },
    { id: "two", companyId: "c", projectId: "q", assigneeAgentId: "a", status: "in_review" as const },
    { id: "three", companyId: "c", projectId: "p", assigneeAgentId: null, status: "todo" as const },
    { id: "other", companyId: "foreign", projectId: "p", assigneeAgentId: "a", status: "todo" as const },
  ];
  const run = { id: "r", agentId: "a", issueId: "two", status: "running" };
  const runs = [run, run, { id: "unknown", agentId: "a", status: "queued" }];
  expect(officeWorkload("c", "p", agents, tasks, runs)).toEqual({
    rows: [{ id: "a", name: "Agent", assigned: 1, blocked: 1, review: 0, running: 0, queued: 0 }],
    unassigned: 1, unlinkedRuns: 1,
  });
  expect(officeWorkload("c", null, agents, tasks, runs).rows[0]).toMatchObject({
    assigned: 2, review: 1, running: 1, queued: 1,
  });
});
