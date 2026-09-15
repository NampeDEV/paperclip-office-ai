---
name: AI Office Workflow
description: Optional Planner, Executor, and Reviewer pod for an explicit, review-gated delivery workflow with no scheduled work.
schema: agentcompanies/v1
slug: planner-executor-reviewer
category: office
key: paperclipai/optional/office/planner-executor-reviewer
manager: agents/planner/AGENTS.md
includes:
  - agents/executor/AGENTS.md
  - agents/reviewer/AGENTS.md
  - projects/office-workflow/PROJECT.md
defaultInstall: false
recommendedForCompanyTypes:
  - software
  - startup
  - generalist
tags:
  - office
  - planning
  - execution
  - review
requiredSkills:
  - paperclipai/bundled/paperclip-operations/task-planning
  - paperclipai/bundled/paperclip-operations/issue-triage
  - paperclipai/bundled/docs/doc-maintenance
  - paperclipai/bundled/quality/qa-acceptance
---

# AI Office Workflow

An optional three-agent delivery pod for an existing Paperclip company. It turns an explicitly assigned outcome into a scoped plan, bounded execution, and a native issue review decision.

## Contents

- `Planner` — PM and team root. Converts an incoming outcome into an assigned, reviewable task with acceptance criteria.
- `Executor` — engineer. Works only in the task's selected project workspace and hands the source issue to native review.
- `Reviewer` — QA. Acts only as the active native review-stage participant and records an approve or changes-requested decision on the source issue.
- `office-workflow` project — the durable project boundary for this pod. It intentionally has no repository or workspace baked into the catalog.

## Runtime and budget boundary

The preset creates no task, routine, timer, wake request, provider credential, repository URL, local path, or adapter session. Importing it therefore creates no run. Choose each agent's already-configured adapter in the install preview, then attach a real company project workspace before assigning execution work.

The preset sets no per-agent monetary limit. Existing company and agent budget policies remain authoritative; agents stop and record the platform's actual budget or pause state instead of estimating a balance.

## Handoff

Planner → Executor is a source issue with a task plan, acceptance criteria, project, and selected workspace. Executor → Reviewer is the same source issue moved to `in_review` with Reviewer configured as the native `review` execution-stage participant. Reviewer approves with `done` or requests changes with `in_progress` through the normal issue update route.
