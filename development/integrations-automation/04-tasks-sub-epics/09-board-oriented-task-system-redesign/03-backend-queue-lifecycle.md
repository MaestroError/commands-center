# ✅ I4.9 Phase 3: Backend Queue Lifecycle

## Goal

Introduce the queue-first backend lifecycle. Queueing becomes the only path that creates execution runs for normal tasks, whether initiated manually, by schedule, by API, or by a generated template task.

## Blockers

- Phase 1: Contracts and DB Model.
- Phase 2: Data Reset and Schema Cutover.

## Unblocks

- Phase 4: Task Run Context Builder.
- Phase 5: Scheduler, Templates, and Archival.
- Phase 6: REST API and MCP Surface.

## Scope

- Add `queueTask` service behavior.
- Queueing sets task status to queued and creates a new task run.
- Queueing starts execution without a separate confirmation step once the task is queued.
- Prevent duplicate active task runs for the same task/subtask.
- Allow retry by queueing the same task again after a terminal run.
- Add terminal run handling that moves task status based on run outcome.
- Keep running state derived from active task runs rather than a board column.

## Service Contracts

- `taskService.createTask`
- `taskService.updateTask`
- `taskService.queueTask`
- `taskService.acceptTask`
- `taskService.archiveTask`
- `taskService.restoreTask`
- `taskService.createRun`
- `taskService.setRunStatus`
- `taskExecutionService.queue`
- `taskExecutionService.runQueuedTask`
- `taskExecutionService.cancel`

## Backend Files

- `packages/backend/src/services/task-service.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/services/task-permission-service.ts`
- `packages/backend/src/routes/tasks.ts` only for temporary internal wiring if needed.

## Status Transition Rules

- backlog -> queued through queue action.
- scheduled -> queued through scheduler.
- queued remains queued while a run is active.
- completed run with success -> ready_to_check.
- completed run with needs_human_review -> review.
- failed run -> review.
- user acceptance -> done.
- archive action -> archived.

## Verification

- Service tests cover every lifecycle transition.
- Service tests reject duplicate active runs.
- Service tests prove retries create new task runs on the same task.
- Failed and human-review outcomes move tasks to review.
- Successful runs move tasks to ready_to_check, not done.
