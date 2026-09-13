# Paperclip AI Office — Verification

Date: 13 September 2026. Base: `c9e3bb7ca40160b2ff80958ec1a8c0254638ad42`. Local implementation on `codex/ai-office-mvp`; no main-repository commit, push or deployment.

## Implemented and checked

- One company-scoped persisted scene, native asset storage, six default seats, editable normalized geometry, background upload and revision conflicts.
- Office dashboard, responsive agent cards, unseated access, Inspector and native controls. Lifecycle, execution and task workflow stay independent.
- The existing company WebSocket supplies transport state and reconnect reconciliation. No second execution/status database or socket was added.
- Verified raster background: generated PNG 1,959,533 bytes and optimized WebP 146,258 bytes, 1672×941. The source and asset notes are checked into the feature working tree.
- Windows junction fixes unblock dependency links and injected Codex skills. The Codex auth-file fallback preserves refresh handling and refuses a target race. Native MCP configuration uses the installed client's `http_headers` field.

## Measured local execution

Company `480c920e-2560-4004-8a81-af9fe850bd5a` (**Paperclip AI Office**, `PAP`) has Planner, Executor and Reviewer, with disabled schedules. Project **Office MVP Verification** uses an isolated Git workspace.

Task **PAP-1** (`e7c21599-774b-4f70-8ff3-1ce2dc8cf7b1`) produced the real file `.paperclip-local/workspaces/smoke/office-smoke.txt` and native attachment `928ad4bb-ddc6-4a0e-a0b6-5b0e42b89547`. Its content is `Paperclip AI Office: 2 + 2 = 4.` and SHA-256 is `62476f001a667973974cca636fa013aa6bb9593275d22e3bd7306fff65f094d9`.

The producing run `36b88653-5d4a-4890-8fa0-e7d239ca7c02` was **cancelled** by native `issue_reassigned` handling when the agent handed the completed work to the board. The task subsequently became **in_review**. This is not reported as a succeeded run.

The explicit read-back run **`60916603-c5d6-4393-81c7-9715c98c5d18` succeeded**, with task **PAP-1 still in_review**. Its provider log contains the actual content and SHA-256 above, with zero HTTP 401/403 gateway errors and zero failed skill injections after the Windows/config fixes. The downloaded attachment exactly matches the local bytes. The Office card displays `Run Succeeded`, `In review`, `Run task: PAP-1`, and `Run project: Office MVP Verification`; the Inspector Files tab opens the actual attachment and work product. Running/succeeded appeared within **190/51 ms** of the first matching API observation. The short verification prompt/config was restored afterward.

Paperclip also ran its native `issue_review_path_lost` recovery once (`09c2a403-c1ea-4bd4-853a-e25295438c65`, succeeded). The final handoff explicitly assigns the in-review task to `local-board` after completion. Agent schedules remain disabled; no recurring schedule was created. A queued attempt against the board-owned task was correctly cancelled before execution with `issue_assignee_changed`; it is retained as native history.

During the producing run, the browser observed running and cancelled states within **236 ms** and **350 ms** of the first matching API poll. These are local observation lags, not a network-wide latency guarantee. Closing the real company socket displayed disconnected state in **251 ms**, followed by a successful reconnect. The hook regression also proves active snapshot invalidation after reconnect.

## Checks

| Check | Actual result |
| --- | --- |
| Dependency installation | Passed after Windows junction fix; initial frozen install failed on untouched upstream patch/lock mismatch |
| Shared + DB typechecks | Passed, including migration numbering/safety |
| Direct server TypeScript check | Passed |
| UI typecheck and production UI build | Passed; existing Vite/CSS/chunk warnings remain |
| Backend Office suite | 6 passed: authorization, scoped references, CAS races, stored-byte validation, decode/truncation, orientation, GET/upload/activity |
| Final live-provider + model + Inspector + Editor tests | **97 passed across 5 files**, including board-reassigned/paged-out selected tasks, terminal status reconciliation, stale editor drafts and image fallback |
| Editor/image and Office UI regression suite | 8 passed across 2 files at final worker handoff |
| Windows Codex regression filter | 4 passed; 57 unrelated cases excluded by explicit filter |
| Plugin-link script tests | 7 passed |
| `pnpm -r typecheck` | Stops at native Rust runner: Cargo is unavailable; runner TypeScript and DB checks completed before that failure |
| `pnpm build` | Stops at upstream generated PRP manifest freshness on this Windows checkout; native binary also requires Cargo |
| Windows stable-test launcher | Regression passed; existing shard helper 18 passed; an actual serialized shard launched and passed 2 tests |
| `pnpm test:run` | Launcher startup repaired; the full invocation now reaches pnpm/Vitest but fails Windows command length (`The command line is too long.`). This is not a full-suite pass |
| `pnpm check:token-gates` | 78 existing color violations and 31 existing arbitrary-value violations; no Office files listed; raw font-size and legacy-HSL gates clean |

The full upstream `codex-home` suite has unrelated fixtures that require privileged symlinks/POSIX permissions. The filtered Windows regression result does not claim that entire suite passed.

## Browser acceptance evidence

`node scripts/verify-office.mjs` is the repeatable local acceptance check. It intentionally edits the verification company's layout and creates an empty project/company for boundary checks. It reads the isolated fixture IDs in `.paperclip-local/company.json` and `.paperclip-local/agents.json`. Its JSON receipts and screenshots are under `.paperclip-local/qa`.

The initial browser pass verified upload, three bindings, normalized position editing, preview, exact save/reload, concurrent writes returning one 200 and one 409, draft retention on stale save, and zero horizontal overflow at 1920×1080, 1280×720 and 390×844. Visual review found a clipped timestamp at 1280px; cards were enlarged and given a minimum readable content height before the final pass.

Final browser acceptance **passed** at 10:32:18 UTC, followed by native-flow checks at 10:35:29 UTC. Both receipts report zero browser page errors. The latest native-flow screenshot shows agent **idle**, run **succeeded**, board-owned task **in_review**, a working attachment link and no stale runtime error.

| Acceptance | Evidence/result |
| --- | --- |
| AC01 | Native Dashboard, PAP-1 detail and Executor detail rendered; native company/project/task/agent API flows operated successfully |
| AC02 | Uploaded WebP, bound 3 agents, changed x, previewed, saved and exactly reloaded the persisted scene |
| AC03 | Real producing run and successful Codex read-back; native run/task/project labels; measured local updates below 5 seconds |
| AC04 | Real succeeded read-back with task in_review, then verified again after board reassignment |
| AC05 | Actual failed workspace/auth runs remain visible in native history and were shown by the card/Inspector; timeout is supported by the terminal-status mapping but no timeout is claimed as a live test |
| AC06 | Planner/Reviewer with disabled schedules and no runs remain idle, with no invented offline state |
| AC07 | Real socket close displayed disconnected within 251 ms and reconnected; hook test verifies full active-snapshot invalidation |
| AC08 | Empty project filtered tasks and discussion; agent retained the native linked project label |
| AC09 | Controlled browser HTTP 403: two immediate clicks sent one request and displayed the error; backend suite checks actor/company denials; real skipped wake did not report a created run |
| AC10 | 1920×1080, 1280×720 and 390×844: zero horizontal overflow, readable cards, mobile Inspector, 44px primary targets and optional scene overview; final screenshots visually inspected |
| AC11 | Temporarily used two seats with three real agents, opened the third from Unseated, then restored six seats |
| AC12 | Second company rejected foreign scene references with HTTP 422; navigation displayed no first-company agents; backend suite checks unauthorized actor/company paths |

Receipts and delivery screenshots are in `evidence/`. Raw local logs remain under `.paperclip-local/`. The acceptance script restores the full layout if its temporary unseated scenario fails. The final layout has six seats and three bindings; no provider run is left active.

Scope remains M0/M1. The separate M2 plan is `../plans/2026-09-13-ai-office-next.md`; it is a roadmap, not evidence of external connector completion. Full repository test/build/typecheck gates are **not all green** for the platform reasons above. The Office-specific checks and live acceptance passed.
