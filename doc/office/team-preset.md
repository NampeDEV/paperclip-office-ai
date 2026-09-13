# AI Office Team Preset

## Scope

`paperclipai/optional/office/planner-executor-reviewer` is a native Teams Catalog preset. It imports three agents and one project through the existing preview/install route. It contains no routine or task, so installation does not create a run or an automatic wake.

| Agent | Native role | Catalog skills | Workspace boundary | Handoff |
| --- | --- | --- | --- | --- |
| Planner | `pm` | `task-planning`, `issue-triage` | Task documents and project context only | Creates the source issue plan and native review stage, then assigns Executor. |
| Executor | `engineer` | `doc-maintenance` | Only the source issue's selected project workspace | Moves that same issue to `in_review` with evidence. |
| Reviewer | `qa` | `qa-acceptance` | Reviews the selected workspace and evidence; does not implement | Uses the native review stage to set `done` or return `in_progress`. |

The project intentionally has no repository or local workspace in the catalog. A reusable package cannot safely guess a target repository. Attach the real company project workspace before assigning execution work. The preset also contains no adapter choice, credentials, session, environment variable, scheduled heartbeat, or monetary limit. The install preview must select an already-configured adapter; Paperclip's actual company/agent budget policies remain authoritative.

## Preview and install acceptance

Use a new empty acceptance company so the first install can prove creation. Live acceptance passed on 13 September 2026 at 12:40 UTC: three agents, one project, identical receipt on replay, changed-input HTTP 409, and no tasks or live runs. See `evidence/team-receipt.json`. `node scripts/verify-office-team.mjs` repeats this check in the dedicated acceptance company.

```powershell
$companyId = "<empty-acceptance-company-uuid>"
$catalogId = "planner-executor-reviewer"
$baseUri = "http://127.0.0.1:3100/api/companies/$companyId/teams/catalog/$catalogId"
$body = @{
  include = @{ agents = $true; projects = $true; issues = $true; skills = $true }
  collisionStrategy = "skip"
} | ConvertTo-Json -Depth 8

$preview = Invoke-RestMethod -Method Post -Uri "$baseUri/preview" -ContentType "application/json" -Body $body
$preview.team.key
$preview.portabilityPreview.plan.agentPlans
$preview.portabilityPreview.plan.projectPlans
$preview.portabilityPreview.files["projects/office-workflow/PROJECT.md"]
$preview.errors
```

The preview must show Planner, Executor, Reviewer, and Office Workflow; `tasks` and `routines` are both zero in the manifest. It must show the catalog skills as required installations, no environment inputs, no external sources, and no planned run.

Choose the adapter already configured for the target company. For the local Office verification instance, the explicit Codex variant is:

```powershell
$installBody = @{
  idempotencyKey = "office-preset-first-install-$(New-Guid)"
  include = @{ agents = $true; projects = $true; issues = $true; skills = $true }
  collisionStrategy = "skip"
  adapterOverrides = @{
    planner = @{ adapterType = "codex_local" }
    executor = @{ adapterType = "codex_local" }
    reviewer = @{ adapterType = "codex_local" }
  }
} | ConvertTo-Json -Depth 8

$first = Invoke-RestMethod -Method Post -Uri "$baseUri/install" -ContentType "application/json" -Body $installBody
$first.portabilityImport.agents
$first.portabilityImport.projects
$first.portabilityImport.routines

$replay = Invoke-RestMethod -Method Post -Uri "$baseUri/install" -ContentType "application/json" -Body $installBody
if (($first | ConvertTo-Json -Depth 32) -ne ($replay | ConvertTo-Json -Depth 32)) {
  throw "The idempotent replay did not return the original install receipt."
}
```

The first receipt must report three created agents and one created project, with no routines. The replay must return that same receipt and the company must still have exactly one each. To deliberately run a fresh sequential install after that, use a new idempotency key; with `collisionStrategy: "skip"`, that new request reports `skip`/`skipped` for matching agent and project slugs.

## Native idempotency behavior

`catalogTeamInstallSchema` accepts an optional `idempotencyKey` of up to 200 characters. When supplied, Paperclip creates one durable receipt scoped to `(companyId, catalogId, idempotencyKey)` before it starts the native portability import. The database uniqueness constraint makes concurrent requests safe: one request imports; a matching request either receives the stored success receipt or a `409` while the first request is still running.

The key is bound to the resolved catalog ID and content hash plus normalized install options: manager target, included resources, selected agents/files, collision strategy, name and adapter-type overrides, source policy, and the effective fallback adapter. Reusing the same key for different bound options returns `409`.

To keep the stored request fingerprint and replay receipt free of credentials, a keyed install rejects `secretValues` and any `adapterOverrides.*.adapterConfig`. It supports adapter-type-only overrides, which covers the Office preset's `codex_local` selection. Configure credentials and adapter settings through the native company controls after the install completes. Installs without an idempotency key keep the existing adapter-config and secret-value behavior.

If preparation fails before the importer starts, the receipt is marked `failed`. If the native importer has started and throws, the receipt is marked `ambiguous`, because it may have created some resources before the failure. Both states return `409` for the same key and Paperclip never retries them automatically. This preserves the operator's ability to inspect the actual company state before choosing a new key.
