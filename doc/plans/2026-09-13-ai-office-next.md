# Paperclip AI Office — Next Development Plan

**Created:** 13 September 2026

**Purpose:** A concrete M2 roadmap after the approved M0/M1 implementation. This is a plan, not evidence of completed external integrations. Delivery evidence for the current implementation belongs in `doc/office/verification.md`.

**Reference:** `doc/office/design-goal.md`; upstream SHA `c9e3bb7ca40160b2ff80958ec1a8c0254638ad42`.

## Entry condition

Finish and verify M0/M1 before enabling further automation: a real Codex run, company-scoped scene persistence, accurate task/run presentation, recovery after lost connection, and desktop/mobile checks. Resolve any failed Office-specific acceptance checks first. Existing upstream platform failures must be reproduced and documented separately.

## 1. Project scenes and independent characters

**Outcome:** Select a project-specific office while preserving the main company scene and truthful actual-project labels.

- Add optional project ownership to OfficeScene with a unique active scene per company/project; keep existing company scenes as the fallback.
- Add character asset references through existing validated company asset storage. Keep character art independent from execution status.
- Extend Scene Editor to choose background/character layers and normalized positions; preserve revision-based collision detection.
- Migrate existing scenes without replacing layouts or uploading assets again.

**Acceptance:** Existing scenes reload unchanged; project A cannot reference project B/company B resources; unset project scene falls back visibly; mobile remains readable; changing a character never creates or wakes an agent.

## 2. Reusable team and workflow presets

**Outcome:** Reuse Planner/Executor/Reviewer configuration with explicit roles, workspace boundaries and task handoff criteria.

- Inspect the installed teams catalog and onboarding APIs before designing a new format; extend their supported template mechanism.
- Provide a preview listing agents, roles, tools, instructions, workspace locations and expected budget behavior.
- Apply a preset through normal agent/task creation APIs with an idempotency key and a returned creation receipt.
- Keep provider authentication separate from template data; a preset must never contain keys or user sessions.

**Acceptance:** Applying the same preset twice does not duplicate a team; partial failures identify exact created records; no run starts before intended trigger; Reviewer completion uses the task review workflow.

## 3. Prompt Library and scheduled reports

**Outcome:** Produce inspectable work products on a known schedule using Paperclip routines.

- Choose one real Prompt Library workspace and one report definition with explicit input, output, time zone, schedule and success criteria.
- Reuse Paperclip routines, task documents and artifact/work-product APIs. Do not introduce another scheduler or status database.
- Start with one manual run; compare input counts and output evidence before enabling its schedule.
- Record missing inputs as a failed/blocked task with useful diagnostics; do not invent counts or silently reuse stale reports.

**Acceptance:** One routine creates one traceable task/run; reruns are idempotent where side effects occur; report timestamps and source scope are visible; a missing input prevents a success report.

## 4. Higgsfield and Content Factory connector

**Outcome:** One authenticated, observable media-generation workflow producing a playable artifact in a task.

- Research the provider's current official API and supported auth/usage limits at implementation time, following `doc/connections/CONNECTOR-PLAYBOOK.md`.
- Define one bounded operation first: submit generation, poll/callback result, cancel if supported, capture artifact and usage receipt.
- Bind secrets through native secret/connection services and enforce company ownership at every request.
- Handle request ambiguity using provider job IDs/idempotency; never retry a paid generation merely because the response was lost.
- Add an approval-backed publishing step only as its own explicit scope after generation works.

**Acceptance:** Real provider job ID, actual artifact, traceable status and reported/unknown cost; invalid auth yields a recoverable error; duplicate delivery does not create another paid job; no fake connector success.

## 5. Actionable notifications and workload

**Outcome:** The owner sees completion, failures and required decisions without continuous status noise.

- Reuse current company live events and notification channels; persist event receipts only if the existing infrastructure does not already provide deduplication.
- Define events for failed run, required approval, blocked task and deliverable ready. Suppress unchanged/non-actionable state.
- Compute workload from actual assigned tasks and active runs, with separate company/project scopes.
- Show provider-reported usage and unavailable/estimated labels; do not portray Paperclip costs as exact ChatGPT subscription quota.

**Acceptance:** One meaningful event produces at most one notification per intended recipient; reconnect/replay does not duplicate it; paused schedules do not imply offline; workload totals reconcile to the source tasks.

## Verification and release sequence for every increment

1. Record upstream SHA and clean/dirty state; preserve unrelated changes.
2. Read exact native API/storage permissions and trace all affected callers.
3. Add the smallest regression covering the risky behavior, then implement with existing dependencies.
4. Check authorization, validation, failure/retry semantics and irreversible effects.
5. Run focused tests and appropriate type/build checks, then one real end-to-end flow.
6. Update the runbook and evidence ledger with actual outputs and remaining limits.

3D rendering, SaaS billing, a replacement tenancy system, multi-platform autopublishing and in-app image-provider infrastructure remain separate projects. Each needs its own concrete use case, integration proof and acceptance boundary.
