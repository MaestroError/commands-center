---
name: task-planner
description: Plan task execution before acting. Use when a request needs multiple steps, code or file changes, command execution, verification, investigation, or coordination across backend/frontend/docs. Helps define success criteria, track work with the generic todo list tool, identify blockers, and keep progress visible during CommandsCenter task runs.
compatibility: opencode
metadata:
  category: workflow
  version: 1.0.0
---

# task-planner

Use this skill before executing non-trivial work.

## Workflow

1. Restate the requested outcome in one sentence.
2. Identify concrete success criteria.
3. Break the work into 3 to 6 ordered steps.
4. Attach a verification method to each risky or user-visible step.
5. Record the plan in the generic todo list tool before editing or running long work.
6. Execute by following the todo list in order unless new information changes the path.
7. Keep todo statuses current as work starts, completes, or becomes blocked.
8. Call out blockers, missing inputs, or assumptions before making risky changes.

## Planning rules

- Keep the plan practical and close to the requested work.
- Do not add speculative features, refactors, or cleanup.
- Prefer the existing project structure and instructions over a generic workflow.
- If project instructions require a persisted plan, create it before editing.
- If the task is tiny and safe, use a one-sentence plan or proceed directly.
- Update the todo list when the plan changes instead of continuing from stale steps.

## Good plans include

- Files or areas likely to change.
- Commands or tests likely to verify the work.
- Any user decision that blocks progress.
- Any risk that could change the implementation approach.

## Output style

- Prefer a short numbered list.
- Use clear verbs: inspect, update, add, verify, report.
- Keep implementation details brief until execution begins.
- Do not present planning as final completion.
