import { describe, expect, it } from "vitest";
import type { Issue } from "@paperclipai/shared";
import {
  officeInspectorRunNowResultMessage,
  officeInspectorSafeHref,
  officeInspectorScopedIssues,
} from "./office-inspector";

function task(overrides: Partial<Issue>): Issue {
  return {
    id: "task-1",
    companyId: "company-a",
    projectId: "project-a",
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    title: "Task",
    description: null,
    status: "todo",
    workMode: "standard",
    priority: "medium",
    reviewPolicy: null,
    assigneeAgentId: "agent-a",
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    responsibleUserId: null,
    issueNumber: null,
    identifier: null,
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Issue;
}

describe("office inspector guards", () => {
  it("keeps task content inside the selected company, project, and assignee", () => {
    const visible = officeInspectorScopedIssues(
      [
        task({ id: "visible" }),
        task({ id: "other-company", companyId: "company-b" }),
        task({ id: "other-project", projectId: "project-b" }),
        task({ id: "other-agent", assigneeAgentId: "agent-b" }),
      ],
      { companyId: "company-a", projectId: "project-a", agentId: "agent-a" },
    );

    expect(visible.map((issue) => issue.id)).toEqual(["visible"]);
  });

  it("keeps an explicitly selected board-reassigned task in scope", () => {
    const scope = { companyId: "company-a", projectId: "project-a", agentId: "agent-a" };
    const visible = officeInspectorScopedIssues(
      [task({ id: "agent-task" })],
      scope,
      task({ id: "run-linked-task", assigneeAgentId: null, status: "in_review" }),
    );

    expect(visible.map((issue) => issue.id)).toEqual(["run-linked-task", "agent-task"]);
    expect(
      officeInspectorScopedIssues(
        [task({ id: "agent-task" })],
        scope,
        task({ id: "other-project", assigneeAgentId: null, projectId: "project-b" }),
      ).map((issue) => issue.id),
    ).toEqual(["agent-task"]);
    expect(
      officeInspectorScopedIssues(
        [task({ id: "agent-task" })],
        scope,
        task({ id: "other-company", assigneeAgentId: null, companyId: "company-b" }),
      ).map((issue) => issue.id),
    ).toEqual(["agent-task"]);
  });

  it("accepts only safe native or web links returned by the API", () => {
    expect(officeInspectorSafeHref("/api/attachments/attachment-1/content")).toBe(
      "/api/attachments/attachment-1/content",
    );
    expect(officeInspectorSafeHref("https://example.test/result")).toBe(
      "https://example.test/result",
    );
    expect(officeInspectorSafeHref("javascript:alert(1)")).toBeNull();
    expect(officeInspectorSafeHref("file:///workspace/result.txt")).toBeNull();
  });

  it("does not report a skipped wake request as a created run", () => {
    expect(officeInspectorRunNowResultMessage({ status: "skipped" })).toContain(
      "No run was created",
    );
    expect(
      officeInspectorRunNowResultMessage({ id: "run-1", status: "queued" }),
    ).toBe("Run run-1 was created with status queued.");
  });
});
