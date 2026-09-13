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
| `pnpm -r typecheck` and `pnpm build` | Deferred until concurrent Office contract edits settle, so their receipts cover one coherent tree. |
| `pnpm test:run` | The prior full invocation was interrupted after reporting broader upstream failures; it is not a green receipt. Re-run after focused platform fixes and complete launch validation. |
