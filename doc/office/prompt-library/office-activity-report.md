<!-- {{ROUTINE_MARKER}} -->
# Daily Office activity report

You are preparing one evidence-backed daily activity report for the Paperclip AI Office scope below.

## Fixed scope

- Company: `{{COMPANY_ID}}`
- Project: `{{PROJECT_ID}}`
- Report time zone: `Asia/Bangkok`
- Schedule: 09:00 every day, but this task may also be started manually.

## Evidence collection

1. Record `snapshot_started_at` as the UTC ISO-8601 timestamp immediately before the first source request. Derive `report_date` in `Asia/Bangkok` from that same instant.
2. Read the current company and project through Paperclip. Confirm that the company ID is `{{COMPANY_ID}}`, the project ID is `{{PROJECT_ID}}`, and the project belongs to that company. If any check fails or cannot be read, stop and mark this task **blocked** with the endpoint, HTTP status, and safe diagnostic. Do not create a report artifact.
3. Read the complete company task set from `GET /api/companies/{{COMPANY_ID}}/issues`. Use `limit=100`, `offset`, `sortField=id`, and `sortDir=asc`; page until a response contains fewer than 100 rows. Repeat the same full scan with `projectId={{PROJECT_ID}}` for the project task set. Keep the exact task IDs, statuses, priorities, project IDs, and `updatedAt` values observed. A repeated task ID means the collection was not stable: stop and mark the task blocked instead of choosing a count.
4. Read the complete company artifact set from `GET /api/companies/{{COMPANY_ID}}/artifacts?kind=all&groupBy=none&limit=100`, following `nextCursor` until it is `null`. Repeat with `projectId={{PROJECT_ID}}`. Keep each returned artifact's ID, source, title, issue identifier, project, content type, and `updatedAt`. A repeated cursor or artifact ID is a failed collection, not a reason to guess.
5. Reconcile the project task IDs against the company task IDs and the project artifact IDs against the company artifact IDs. If a project record is absent from its corresponding company collection, stop and mark the task blocked. Never use a previous report, a dashboard total, a partial page, cached data, or an estimate as a fallback.

## Report content

Write `office-activity-<report_date>.md` using only the collected records. Include:

- source company/project IDs, report time zone, `snapshot_started_at`, and `snapshot_completed_at`;
- total company tasks and total project tasks, with status and priority breakdowns that reconcile exactly to each total;
- complete task inventories for both scopes (ID/identifier, title, status, priority, project ID, and `updatedAt`);
- total company artifacts and total project artifacts, with source and media-kind breakdowns that reconcile exactly to each total;
- complete artifact inventories for both scopes (artifact ID, source, title, linked issue, project, content type, and `updatedAt`);
- a plainly labeled note that the artifact snapshot precedes this newly created report artifact.

If an input is missing, malformed, unauthorized, incomplete, or inconsistent, do not write a success report and do not invent a zero or substitute a stale value. Leave a blocked-task diagnostic that names the failed source and what the board must repair.

## Deliverable and review handoff

After a successful collection, upload the generated Markdown file to this current routine task through Paperclip's native artifact workflow (`skills/paperclip/scripts/paperclip-upload-artifact.sh` or its equivalent native task API). The upload must create an attachment-backed `artifact` work product in `ready_for_review` state. Verify the task's attachment list and work-product list contain the exact report before declaring success.

Then use the normal board review handoff: leave the task in `in_review`, identify the attachment and work-product IDs, and request board review. Do not wake yourself, schedule a continuation, retry the routine, or create another report task from this task. If the handoff cannot be completed, leave the task in `in_review` with the failed action and diagnostic; do not loop recovery attempts.
