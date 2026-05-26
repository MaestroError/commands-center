# ✅ I4.9 Phase 1: Contracts and DB Model

## Goal

Introduce board-oriented task, template, comment, subtask, and task-run contracts. This phase defines the durable target shape additively so the current implementation keeps compiling until the lifecycle cutover removes trigger-mode-oriented behavior.

## Blockers

- Phase 0: Transition Spec.

## Unblocks

- Phase 2: Data Reset and Schema Cutover.
- Phase 3: Backend Queue Lifecycle.
- Phase 4: Task Run Context Builder.

## Scope

- Add the board-oriented contracts that will remove normal task dependency on `triggerMode` and schedule discriminants during the lifecycle cutover.
- Keep recurrence fields only on task templates.
- Add normal task scheduling fields for one-time scheduled work.
- Add comments and subtasks as first-class task context.
- Add run outcome and optional subtask targeting to task runs.
- Add settings contract for done-task auto-archive retention.

## Shared Contracts

- `taskSchema`: board item with default agent, board status, optional scheduled date, optional source template metadata, done/archive timestamps, and latest run metadata.
- `taskTemplateSchema`: recurring generator with recurrence rule, default task fields, default agent, next occurrence state, and enabled/archived state.
- `taskCommentSchema`: task-scoped user feedback with open/included/resolved lifecycle.
- `taskSubtaskSchema`: simple task child item with title, description, optional default agent, and lightweight status.
- `queueTaskInputSchema`: task ID, optional subtask ID, optional agent override, trigger source, and optional run context.
- `taskRunSchema`: immutable run attempt with actual agent ID, optional subtask ID, trigger source, status, outcome, rendered prompt/context, artifacts, result text, review reason, and timestamps.

## Database Files

- `packages/backend/src/db/schema/tasks.ts`
- `packages/backend/src/db/schema/settings.ts`
- `packages/backend/src/db/schema/index.ts`
- `packages/backend/src/db/migrations/`

## Shared Files

- `packages/shared/src/schemas/tasks.ts`
- `packages/shared/src/schemas/settings.ts` if a settings schema module is introduced.
- `packages/shared/src/schemas/index.ts`

## Verification

- Typecheck validates all exported shared schemas and types.
- Schema unit tests cover accepted and rejected statuses, queue input, comments, subtasks, templates, and run outcomes.
- Migration is generated from Drizzle metadata instead of manually invented SQL, except for deliberate data reset SQL if needed.
