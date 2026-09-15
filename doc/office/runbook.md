# Paperclip AI Office — Local Runbook

Workspace: `C:\Users\nampe\Project\peperclip-office`  
Upstream: `https://github.com/paperclipai/paperclip.git`  
Base commit: `c9e3bb7ca40160b2ff80958ec1a8c0254638ad42`  
Feature branch: `codex/ai-office-mvp`

## Start

Use PowerShell in this workspace with Node 24.11 or later and pnpm 9.15.4:

```powershell
pnpm install --no-frozen-lockfile
pnpm --filter @paperclipai/paperclip-runner generate:protocol-types
pnpm --filter @paperclipai/plugin-sdk build
pnpm office:start
```

Open `http://127.0.0.1:3100/PAP/office`. The first start loads a large TypeScript module graph and can take a few minutes. Check `http://127.0.0.1:3100/api/health` before deciding that startup failed. Stop the foreground server with Ctrl+C.

The pinned upstream checkout has a patched-dependency/lockfile mismatch, so its frozen installation fails before dependency resolution. The non-frozen command follows the repository README fallback. Regenerated lockfile contents are not part of the feature change; the repository reserves lockfile updates for its CI workflow.

## Local state and execution

`scripts/start-office.ts` isolates this instance under `.paperclip-local` and binds it to `127.0.0.1`. PostgreSQL uses the existing embedded server on port 54329; the application uses port 3100. The instance is `local_trusted`; it is intended for this machine. Secrets are generated with native Paperclip helpers and persisted in the ignored instance directory. Do not copy that directory into source control or publish its contents.

The verification company is **Paperclip AI Office** (`PAP`). It contains the **Office MVP Verification** project and Planner, Executor and Reviewer agents using the existing local Codex CLI authentication. Their workspaces are under `.paperclip-local/workspaces`; the smoke project has its own isolated Git repository. Agent schedules are disabled. Executor accepts explicit on-demand work.

This instance uses Paperclip's supported legacy Codex adapter by setting **Experimental → Native Runner** off. Rust and Windows C++ build tools are now installed, and the runner's Rust typecheck passed; this does not change the adapter used by the verified local workflow. Windows directory links use junctions; managed Codex authentication uses the existing synchronized auth handling with a file-copy fallback when Windows denies a symbolic link.

## Office workflow

1. Open **Office**, then **Edit layout**. Upload a verified PNG/JPEG/WebP/GIF image up to 5 MiB or retain the bundled night-office illustration.
2. Assign each agent to at most one seat. Drag or resize seats, or edit normalized geometry using the numeric controls. Preview, then save.
3. Select an agent or task to inspect its native overview, discussion, activity and files. The project selector limits task content and selects its saved scene. A project without a scene uses the company layout; editing saves a separate project layout. Character art is decorative and moves independently of agent seats.
4. Run status, agent lifecycle and task workflow are independent. A successful run can leave its task in review. A lost live connection marks the snapshot stale; reconnect reloads current data.
5. Use native controls or the linked native detail pages. In this pinned Paperclip version, pausing an agent also requests cancellation of its active runs; the Inspector explains that native behavior. Use the selected-run cancellation control when targeting one run. Failed requests must remain visible.

A save rejected with HTTP 409 means another editor saved first. The current draft is retained; reload the scene explicitly before applying further changes. Agents without seats remain available in the unseated list. Mobile opens with readable agent cards and an optional scene overview.

## Verification and next work

See `verification.md` for M0/M1 evidence and `../plans/2026-09-13-ai-office-m2-execution.md` for current delivery status. The native team preset is documented in `team-preset.md`, the verified daily report in `reports.md`, and the unresolved media-provider connection in `higgsfield.md`. No cloud deployment is claimed.
