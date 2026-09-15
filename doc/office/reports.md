# Office daily activity report

The Office report is a native Paperclip routine, its prompt is a versioned routine description document, and its completed Markdown is an attachment-backed artifact work product. No separate scheduler, database, or report status store is used.

## Definition

| Field | Value |
| --- | --- |
| Routine | `Daily Office activity report` |
| Scope | Explicit company and project IDs supplied to setup |
| Assignee | Explicit existing agent ID supplied to setup |
| Input | Complete paged company/project task and artifact API collections |
| Output | One Markdown attachment and `artifact` work product on the generated routine task |
| Time zone | `Asia/Bangkok` |
| Schedule | `0 9 * * *` (09:00 daily), initially disabled |
| Success | Counts reconcile to collected records; exact report attachment/work product exists; task is handed to board review |

The prompt fails closed when a source is unavailable, paged data moves, or project data does not reconcile to company data. It does not reuse a prior report or replace an unknown count with zero.

## Setup

Start the local Office instance first, then provide every scope value explicitly:

```powershell
node scripts/setup-office-reports.mjs `
  --base-url http://127.0.0.1:3100 `
  --company-id <company-id> `
  --project-id <project-id> `
  --assignee-agent-id <agent-id>
```

The command prints a receipt with the routine, native description-document, and disabled trigger IDs. It is safe to repeat serially: it reads the ownership marker first and returns the existing receipt only when the routine, prompt, scope, assignee, and disabled schedule all match. A mismatch or duplicate marker stops for review; the script never rewrites a pre-existing routine or turns on a schedule.

## First manual evidence run

Do this only after setup printed a receipt and while the intended agent is ready. Do not pass the disabled schedule trigger ID: manual runs use no trigger. Reuse the same key if the HTTP response is lost.

```powershell
$body = @{ source = "manual"; idempotencyKey = "office-activity-<YYYY-MM-DD>" } | ConvertTo-Json -Compress
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3100/api/routines/<routine-id>/run" `
  -ContentType "application/json" `
  -Body $body
```

Inspect `GET /api/routines/<routine-id>/runs` and the linked task. A valid manual proof has one traceable routine run, complete source inventories/counts, an attached `office-activity-<date>.md`, its artifact work product, and an `in_review` board handoff. A blocked task is evidence that an input was unavailable, not a successful report.

After the parent verifies that manual proof, enable the existing trigger with a separate explicit action:

```powershell
Invoke-RestMethod -Method Patch `
  -Uri "http://127.0.0.1:3100/api/routine-triggers/<trigger-id>" `
  -ContentType "application/json" `
  -Body '{"enabled":true}'
```

Until then, the trigger remains disabled and cannot start an automatic provider run.

## Verified local delivery — 13 September 2026

The manual routine produced `office-activity-2026-09-13.md` (5,847 bytes) as an attachment and a ready-for-review artifact work product. Both source scopes reconciled to two tasks and one pre-existing artifact. The new report is explicitly excluded from its own artifact snapshot. See `evidence/report-receipt.json` and the attached report on task PAP-2.

The task reached `in_review` with the board as assignee. The provider run was cancelled with `issue_reassigned` as a consequence of that handoff, after upload; it is not recorded as a successful provider exit. The report bytes and complete task inventory were independently checked through the native API.

After this verification, the existing daily 09:00 Asia/Bangkok trigger was enabled. The routine uses `skip_if_active`: a report still awaiting board review can prevent another overlapping report. This is the configured concurrency rule, not an offline agent or failed schedule. Setup deliberately refuses to overwrite an already-enabled schedule.

## Scheduled delivery — 14 September 2026

After the stopped local service restarted, the native scheduler created PAP-3 at 10:30 Bangkok time. It produced a 7,456-byte report with three tasks and three pre-existing artifact records in each scope. Independent API read-back verified every inventory ID and the attachment hash. The artifact is `ready_for_review` with `needs_board_review`, and the task is `in_review`.

The provider run subsequently ended `timed_out`; it is not a successful provider exit. The uploaded report and review state were preserved. See `evidence/scheduled-report-receipt.json` and `evidence/office-activity-2026-09-14.md`. The next configured trigger is 15 September at 09:00 Bangkok time; this scheduled delivery did not occur at 09:00 while the local service was stopped.

The run reports `Timed out after 180s`, matching Executor's earlier short acceptance-test setting. Its native adapter timeout was increased to 900 seconds and read back on 14 September. No duplicate report was started. A successful provider exit under the new limit remains unverified until a future run.
