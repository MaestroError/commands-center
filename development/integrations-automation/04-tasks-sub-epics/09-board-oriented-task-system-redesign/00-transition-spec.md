# ✅ I4.9 Phase 0: Transition Spec

## Goal

Freeze the target task model and execution semantics before changing code. This phase exists to prevent schema, service, scheduler, and UI work from drifting into incompatible interpretations.

## Blockers

- I4.9 parent sub-epic accepted.
- Agreement that existing task data does not need to be preserved.

## Unblocks

- Phase 1: Contracts and DB Model.
- Phase 2: Data Reset and Schema Cutover.
- Phase 3: Backend Queue Lifecycle.

## Scope

- Confirm final status names for tasks, task runs, comments, and subtasks.
- Confirm that task trigger modes are removed from normal task identity.
- Confirm that one-time scheduled work is a normal task with scheduled board state.
- Confirm that recurring work exists only as task templates/generators.
- Confirm that existing persisted task data can be deleted/reset during implementation.
- Confirm that E2E tests are not required for this implementation cycle.
- Decide whether old REST paths such as `/trigger` are removed immediately or temporarily kept as aliases.

## Frozen Decisions

- Phase 1 introduces the new contracts additively so the current implementation continues compiling until lifecycle services are replaced.
- Old task, task run, task template, and task scheduler data will be reset in Phase 2 instead of migrated.
- One-time scheduled work will be represented as a normal task with scheduled board state and scheduled date/time.
- Recurring work will be represented only as task templates that generate normal tasks.
- Queueing is the execution trigger for normal tasks.
- Running state is derived from active task runs; there is no in-progress board column.
- `/trigger` can remain only as a temporary compatibility alias until Phase 6 replaces REST and MCP surfaces with queue-oriented APIs.
- E2E tests are intentionally deferred until the board UI stabilizes; each implementation phase must still include unit, schema, service, route, or component tests appropriate to that phase.

## Contracts To Define

- `TaskStatus`: backlog, scheduled, queued, ready_to_check, review, done, archived.
- `TaskRunStatus`: queued, running, completed, failed, cancelled.
- `TaskRunOutcome`: success, needs_human_review, failed.
- `TaskCommentStatus`: open, included, resolved.
- `TaskSubtaskStatus`: backlog, queued, ready_to_check, review, done.
- `TaskRunTriggerSource`: manual, scheduled, api, template.

## Files To Update

- `development/integrations-automation/04-tasks-sub-epics/09-board-oriented-task-system-redesign.md`
- Phase files in `development/integrations-automation/04-tasks-sub-epics/09-board-oriented-task-system-redesign/`
- Follow-up screen requirements under `design/screens/` only when UI implementation begins.

## Verification

- The plan explicitly states that old task data can be reset.
- The plan does not require E2E tests for this cycle.
- Every later phase has a clear blocker relationship.
- Phase 0 is verified by reviewing this document; no code-level tests are required for this documentation-only phase.
