import { AgentStatusBadge, IssueStatusBadge, StatusBadge } from "@/components/StatusBadge";
import { cn, relativeTime } from "@/lib/utils";
import {
  agentLifecycleLabel,
  runStatusLabel,
  type OfficeAgentCardView,
} from "@/lib/office";

interface AgentCardProps {
  card: OfficeAgentCardView;
  variant: "scene" | "list";
  selected?: boolean;
  onSelect: (card: OfficeAgentCardView) => void;
}

function taskContext(card: OfficeAgentCardView) {
  if (card.runIssue) {
    return {
      issue: card.runIssue,
      project: card.runProject,
      taskLabel: "Run task",
      projectLabel: "Run project",
    };
  }
  if (card.assignedIssue) {
    return {
      issue: card.assignedIssue,
      project: card.assignedProject,
      taskLabel: "Assigned task",
      projectLabel: "Assigned project",
    };
  }
  return null;
}

function taskName(issue: NonNullable<OfficeAgentCardView["issue"]>): string {
  return issue.identifier ?? issue.title;
}

export function AgentCard({ card, variant, selected = false, onSelect }: AgentCardProps) {
  const context = taskContext(card);
  const runSummary = card.activeRuns.length > 1
    ? `${card.activeRuns.length} live runs`
    : card.latestRun
      ? `Run ${runStatusLabel(card.latestRun.status)}`
      : "No run";
  const taskSummary = context
    ? `${context.taskLabel}: ${taskName(context.issue)}`
    : card.latestRun
      ? "Run task not linked"
      : "No assigned task";
  const projectSummary = context
    ? `${context.projectLabel}: ${context.project?.name ?? (context.issue.projectId ? "Unavailable" : "None")}`
    : "No project";
  const statusDescription = [
    `Agent: ${agentLifecycleLabel(card.agent.status)}`,
    runSummary,
    context ? `${context.taskLabel}: ${context.issue.status.replace(/_/g, " ")}` : null,
    taskSummary,
    projectSummary,
    card.lastUpdateAt ? `Updated ${relativeTime(card.lastUpdateAt)}` : null,
  ].filter(Boolean).join(". ");

  return (
    <button
      type="button"
      onClick={() => onSelect(card)}
      aria-pressed={selected}
      aria-label={`${card.agent.name}. ${statusDescription}`}
      data-testid={`office-agent-${card.agent.id}`}
      data-agent-lifecycle={card.agent.status}
      data-run-status={card.latestRun?.status ?? "none"}
      data-task-status={context?.issue.status ?? "none"}
      className={cn(
        "office-agent-card min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "scene" ? "office-agent-card-scene" : "office-agent-card-list min-h-(--sz-44px)",
        selected && "office-agent-card-selected",
        card.isOutsideSelectedProject && "office-agent-card-dimmed",
      )}
    >
      <span className="office-agent-card-heading">
        <span className="truncate text-xs font-semibold" title={card.agent.name}>{card.agent.name}</span>
        <span className="office-agent-card-lifecycle shrink-0">
          <AgentStatusBadge status={card.agent.status} />
        </span>
      </span>
      <span className="office-agent-card-meta truncate" title={`${card.agent.title ?? card.agent.role} · ${card.agent.adapterType}`}>
        {card.agent.title ?? card.agent.role} · {card.agent.adapterType}
      </span>
      <span className="office-agent-card-badges" aria-label={`Run and task status. ${runSummary}${context ? `. ${context.issue.status.replace(/_/g, " ")}` : ""}`}>
        <StatusBadge status={card.latestRun?.status ?? "idle"} label={runSummary} />
        {context ? <IssueStatusBadge status={context.issue.status} /> : null}
      </span>
      <span className="office-agent-card-summary truncate" title={taskSummary}>{taskSummary}</span>
      <span className="office-agent-card-project truncate" title={projectSummary}>{projectSummary}</span>
      {card.lastUpdateAt ? (
        <span className="office-agent-card-updated">Updated {relativeTime(card.lastUpdateAt)}</span>
      ) : null}
    </button>
  );
}
