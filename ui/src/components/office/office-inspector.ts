import type { Issue } from "@paperclipai/shared";

export function officeInspectorScopedIssues(
  issues: Issue[],
  scope: { companyId: string; projectId: string | null; agentId: string | null },
  explicitIssue: Issue | null = null,
): Issue[] {
  const matchesCompanyAndProject = (issue: Issue) =>
    issue.companyId === scope.companyId
    && (scope.projectId === null || issue.projectId === scope.projectId);
  const agentScopedIssues = issues.filter(
    (issue) =>
      matchesCompanyAndProject(issue)
      && (scope.agentId === null || issue.assigneeAgentId === scope.agentId),
  );
  if (
    !explicitIssue
    || !matchesCompanyAndProject(explicitIssue)
    || agentScopedIssues.some((issue) => issue.id === explicitIssue.id)
  ) {
    return agentScopedIssues;
  }
  return [explicitIssue, ...agentScopedIssues];
}

export function officeInspectorSafeHref(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/api/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

export function officeInspectorRunNowResultMessage(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "Paperclip did not confirm that a run was created.";
  }
  const response = result as Record<string, unknown>;
  if (response.status === "skipped") {
    const detail = typeof response.message === "string" && response.message.trim()
      ? response.message
      : "Paperclip skipped the agent wake request.";
    return `No run was created: ${detail}`;
  }
  const runId = typeof response.id === "string" ? response.id : null;
  const status = typeof response.status === "string" ? response.status : null;
  return runId && status
    ? `Run ${runId} was created with status ${status}.`
    : "Paperclip did not confirm that a run was created.";
}
