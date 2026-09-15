import { useQuery } from "@tanstack/react-query";
import type { Agent, Issue } from "@paperclipai/shared";
import { attentionApi } from "@/api/attention";
import type { LiveRunForIssue } from "@/api/heartbeats";
import { officeWorkload } from "@/lib/office-workload";
import { queryKeys } from "@/lib/queryKeys";
import { Link } from "@/lib/router";

export function OfficeWorkload({ companyId, projectId, agents, tasks, runs }: {
  companyId: string; projectId: string | null; agents: Agent[]; tasks: Issue[]; runs: LiveRunForIssue[];
}) {
  const workload = officeWorkload(companyId, projectId, agents, tasks, runs);
  const attention = useQuery({
    queryKey: [...queryKeys.attention(companyId), "office"],
    queryFn: () => attentionApi.list(companyId, { all: true }),
  });
  const items = attention.data?.items.filter(item => !projectId || item.project?.id === projectId);
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Office workload">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">Workload · {projectId ? "selected project" : "company"}</h2>
      <Link className="inline-flex min-h-(--sz-44px) items-center underline" to="/inbox">Open notifications and decisions</Link>
    </div>
    <p className="text-sm text-muted-foreground">
      {attention.error ? "Notifications could not refresh." : items ? `${items.length} items need attention in this scope.` : "Loading notifications…"}
      {" "}Review, approval, blocked work and failures use the existing inbox, including its dismiss and snooze history.
    </p>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Open assigned tasks and actual live runs</caption>
        <thead><tr>{["Agent", "Assigned", "Blocked", "Review", "Running", "Queued / retry"].map(label => <th key={label} scope="col" className="whitespace-nowrap p-2 font-medium">{label}</th>)}</tr></thead>
        <tbody>{workload.rows.map(row => <tr key={row.id} className="border-t border-border">
          <th scope="row" className="p-2 font-normal">{row.name}</th>
          {[row.assigned, row.blocked, row.review, row.running, row.queued].map((count, i) => <td key={i} className="p-2 tabular-nums">{count}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="text-xs text-muted-foreground">{workload.unassigned} open tasks have no available agent assignee. {workload.unlinkedRuns} company live runs have no known task link; they are excluded from project counts.</p>
    <Link className="inline-flex min-h-(--sz-44px) items-center text-sm underline" to="/costs">View recorded provider usage and costs</Link>
    <p className="text-xs text-muted-foreground">Recorded costs are not a measure of your remaining ChatGPT subscription quota.</p>
  </section>;
}
