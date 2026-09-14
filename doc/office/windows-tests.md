# Windows validation notes

Snapshot: 13 September 2026 on Windows, Node 24.14.0, pnpm 9.15.4, and the
MSVC Rust toolchain installed through Rustup.

## Confirmed checks

| Check | Result | Evidence |
| --- | --- | --- |
| Rust runner typecheck | Passed | `pnpm --filter @paperclipai/paperclip-runner typecheck:rust` completed in 6m44s. Rust emitted existing warnings, with no error. |
| Attachment staging safety | Passed | `native-runner-attachment-staging.test.ts`: 3 passed, including the Windows junction-outside-workspace rejection and redirected-open check. |
| Native runner file handoff | Passed | `native-runner-file-handoff.test.ts`: 7 passed on Windows. |
| Affected external-chat file delivery | Passed | Telegram, Discord, and GitHub `register_deliverable` cases: 3 passed; 139 unrelated cases skipped by the focused name filter. |

The Rust command uses the repository's pinned toolchain. The warnings are not
suppressed or treated as a successful production build. The two database-backed
native handoff suites now use the existing 90-second embedded-Postgres test
budget, rather than their stale local 30-second hook values. The shared budget
is already documented as the bounded limit for a contended cluster start and
migration; it does not disable the timeout.

## File-handoff defect found and fixed

The earlier full Vitest run reported three failures in
`external-chat-wait.integration.test.ts`: Telegram, Discord, and GitHub
`register_deliverable` scenarios. A one-test Windows reproduction failed with
`paperclip_runner_file_handoff_descriptor_unverifiable`.

The cause was platform-specific: `openedFilePath` supported Darwin through
`lsof` and Unix through `/proc` or `/dev/fd`, but had no Windows descriptor
path mechanism. The Windows branch now explicitly marks the descriptor path as
unavailable. It accepts a local file only when the existing held-handle
identity, path `lstat`, no-reparse-component, realpath containment, size, and
post-read/write checks all agree. It does not invent a descriptor path or
relax Unix checks.

The new Windows regression creates a junction from `.paperclip-inbound` to an
outside directory and verifies that staging fails before writing any bytes
there. The redirected-open regression verifies that an outside handle cannot
be truncated when the current workspace path still names a different file.

## Still to run or re-run

| Check | State |
| --- | --- |
| `pnpm -r typecheck` | Passed on 14 September 2026, exit 0, 03:25:30–03:28:52 UTC. Rust release compilation completed in the prior run; the interrupted parent command was not counted as a pass. |
| `pnpm build` | Passed on 14 September 2026, exit 0, 03:36:34–03:39:11 UTC. All 1,138 copied server/vendor/adapter files were compared byte-for-byte with their sources; the CLI bundle exists. |
| `pnpm test:run` | Incomplete: the process is no longer present and no final receipt was written. The last log records failures in Slack ordering, workspace runtime, adapter, and spool tests. This is not a passing gate. |

The remaining Windows build fixes replace Unix-only copy/remove/chmod commands with Node filesystem operations. Generated runner checks accept CRLF without changing content checks, and workflow traceability imports use a file URL. Skill catalog text uses LF and inventory sorting uses an explicit English locale; all existing catalog hashes remain unchanged. Six catalog-builder tests pass after this change.

## CI follow-up — 14 September 2026

CI on `ca4393a6895c01d978361e08a908a212d19eb6f7` passed build, typecheck, runner verification, all five general-server shards, and workspace shards. Serialized shards 1 and 4 and E2E shard 3 failed. Office was missing from the OpenAPI route inventory and document; all four routes now have coverage, path/query/body contracts, upload fields, and board-only mutation metadata. The final OpenAPI suite passes all eight tests, and the server typecheck passes.

The routine revision restore failure did not reproduce locally: all 15 routine route tests passed without changing production code. The CI signoff test could not observe an issue-bound heartbeat run. These CI results remain unresolved until a new run confirms them. No permission or execution ownership check was relaxed.

CI run 34805107285 on `9f01542155d0e37247877d0801238160529ef4fa` passed all three E2E shards and all five serialized server shards, including Office OpenAPI and routine restore. Build, typecheck, runner verification, and all workspace shards also passed. The only failing test lane was general server shard 3: two assertions still expected Unix copy commands (3,862 tests passed in that lane). The build test now executes the actual Node copy command against isolated nested fixtures, including hidden files, and checks all four output directories. All six focused build-script tests pass. A new CI run must verify this final test change.
