# Paperclip AI Office Implementation Plan

> Execution: solweaver + subagent-driven-development. User authorized M0/M1 execution and a new plan with “Approve ALL”.

**Goal:** Open a company Office, see real agents/tasks/runs, inspect results, use native controls, and persist an editable illustrated seat layout.

**Architecture:** Add a company-scoped feature to existing React/Express/PostgreSQL Paperclip. Reuse native APIs, asset storage, authorization and one LiveUpdatesProvider. Store one scene with validated seats per company; execution remains exclusively in Paperclip.

**Tech stack:** Existing TypeScript, React, TanStack Query, Drizzle, PostgreSQL, Zod, Sharp, Vitest and Playwright. No new runtime dependencies.

**Spec:** `doc/office/design-goal.md` (original user-supplied design, preserved).

## Global constraints and rulings

- Upstream: https://github.com/paperclipai/paperclip ; SHA `c9e3bb7ca40160b2ff80958ec1a8c0254638ad42`.
- Existing workspace was empty; retain user-selected spelling `peperclip-office`. Independent repository on `codex/ai-office-mvp`; do not touch the unrelated home-directory repository.
- Scope is M0/M1 with AC01–AC12. M2 has a separate follow-up plan, not fictitious integrations.
- UI represents lifecycle, run and task status independently. No invented conversations, progress or offline status.
- Scene geometry is normalized to the full original image. Mobile defaults to accessible list view; primary controls >=44px.
- Scenes require company access, board mutation authority, asset/agent ownership, bounded geometry, duplicate rejection and atomic revision checks.
- Upload <=5 MiB; accept only verified raster formats through existing storage. Never accept arbitrary external URLs or paths.
- Preserve native task/run control semantics and error/confirmation handling. No autonomous recurring work is enabled during bootstrap.
- All styling values live in the existing UI token layer. No new 3D, execution, chat or provider abstraction.
- Ruling: seats may be a validated JSON array in one OfficeScene database record. This keeps atomic scene saves simple while retaining the OfficeSeat contract.
- Ruling: supplied design is approved already; no additional design approval pause. Generate the requested illustration and verify it in the running UI.
- Frozen dependency installation failed on untouched upstream patch/lock mismatch. Use README's non-frozen install locally; do not commit regenerated lockfile.

## Task 1 — Baseline and local runtime (parent)

- [x] Inspect workspace, clone upstream, record SHA and create feature branch.
- [x] Install dependencies and launch a project-isolated local instance.
- [x] Verify health, native company/project/agent/task flows.
- [x] Configure Planner, Executor, Reviewer with explicit isolated workspaces and existing Codex auth; schedules disabled.
- [x] Run one bounded real Codex task, retain run result and output evidence.

## Task 2 — Scene contract, storage and API (backend worker)

Files: `packages/shared/src/{types,validators}/office.ts`, their exports; `packages/db/src/schema/office_scenes.ts`, schema export and generated migration; `server/src/{routes,services}/office.ts`; `server/src/app.ts`; focused `server/src/__tests__/office-*.test.ts`.

Contract: `OfficeSeat { id,label,agentId,x,y,width,height,zIndex }`; `OfficeScene { id,companyId,name,backgroundAssetId,imageWidth,imageHeight,isActive,revision,seats,createdAt,updatedAt }`.

`GET /api/companies/:companyId/office-scene` returns `OfficeScene|null`. `PUT` same path accepts `{revision,name,backgroundAssetId,imageWidth,imageHeight,seats}`; revision 0 creates, stale revision returns 409. `POST .../office-scene/background` accepts multipart file and returns `{assetId,imageWidth,imageHeight}`. Background null means bundled office art; no URL fields accepted. `GET /api/assets/:id/content` is reused for authorized image content.

- [x] Cover geometry, duplicate seats/agents, company/actor boundaries and stale writes with focused tests.
- [x] Implement shared contracts, atomic scene storage, verified upload and activity logging.
- [x] Generate migration and run backend/shared/db checks.

## Task 3 — Office dashboard and Scene Editor (UI worker)

Files: `ui/src/pages/Office.tsx`, `ui/src/components/office/{OfficeScene,SceneEditor,AgentCard}.tsx`, `ui/src/lib/office.ts`, `ui/src/api/office.ts`, UI route/sidebar integration, `ui/src/index.css`, focused UI logic tests. Inspector and LiveUpdatesProvider are excluded from this worker's scope.

Interfaces: consume scene API above and existing agents/issues/projects/heartbeats APIs. Import parent-owned `useLiveConnection()` from LiveUpdatesProvider returning `{status:'connecting'|'connected'|'disconnected',lastEventAt:string|null}`. Consume inspector component below.

- [x] Read exact native response shapes and query keys; test view-model status/project/run selection.
- [x] Build live dashboard, company/project scope labels, tasks, six editable seats and unseated agents.
- [x] Support upload, image dimensions, normalized drag/resize, numeric editing, preview/save/cancel, stale revision errors, reload.
- [x] Reuse events with bounded refetch/coalescing; render loading/error/empty/stale states.
- [x] Run UI typecheck and token gates.

## Task 4 — Inspector and native controls (inspector worker)

Files: `ui/src/components/office/OfficeInspector.tsx` and focused helper/test files exclusively prefixed `office-inspector`.

Export `OfficeInspector({companyId,agentId,issueId,projectId,onClose,onSelectIssue})` where ids except companyId are `string|null`, onClose is `()=>void`, onSelectIssue is `(id:string)=>void`. Component fetches its own authorized native data and renders overview/discussion/activity/files; selected task defines discussion. Project scope restricts task content, never relabels agent work.

- [x] Reuse existing APIs and native detail links; no parallel message store.
- [x] Show multiple runs and explicit selected run; distinguish run success from task completion.
- [x] Wire applicable native controls with pending/double-click guard/error/confirmed success; link to native approval and recovery flows where appropriate.
- [x] Run relevant UI checks.

## Task 5 — Shared connection state and scene art (parent + art worker)

Parent owns `ui/src/context/LiveUpdatesProvider.tsx` and relevant connection regression tests. Art worker owns only `ui/public/office/*` and `docs/office/scene-asset.md`.

- [x] Expose actual transport status, timestamp only valid same-company events, reconcile snapshots after reconnect.
- [x] Generate and inspect the approved six-desk raster illustration; keep original and optimized web copy.
- [x] Align six default card positions to resulting image.

## Task 6 — Integrated proof and delivery (parent)

- [x] Independent review of scene authorization/concurrency and UI truthfulness; resolve actionable findings.
- [x] Run focused tests, `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`, `pnpm check:token-gates`; record actual failures/limits separately from Office regressions.
- [x] Browser-check desktop 1920x1080 and 1280x720, mobile 390px; scene save/reload, run/task/project correctness, inspector, failed requests, reconnect.
- [x] Record AC01–AC12 evidence in `doc/office/verification.md`.
- [x] Deliver local preview, runbook, all source/assets and separate M2 plan. Do not claim cloud deployment or external connectors.
