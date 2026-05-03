# I4.2 Scheduler and Execution Lifecycle

## Goal

Implement the task execution lifecycle for manual, one-time scheduled, and recurring scheduled tasks, with durable run records and active run tracking.

## Pre-Conditions

- I4.1 Task Data Model and Service API is complete.
- E2 OpenCode Orchestrator is complete.
- E3 API and Realtime Foundation is complete.

## Scope

### Scheduler

- Implement scheduler abstraction for local mode using the project-approved local scheduling stack.
- Persist scheduler state in the workspace database so copied workspaces keep their task schedules.
- Support manual-only tasks that are never automatically scheduled.
- Support one-time scheduled tasks with a target run time.
- Support recurring schedules using cron-like expressions.

### Execution Lifecycle

- Add task trigger service methods for manual, one-time, and scheduled recurring execution.
- Create a `task_runs` record before execution begins.
- Track queued, running, completed, failed, cancelled, and skipped states.
- Prevent duplicate runs for a task when concurrency is not allowed.
- Support cancellation where technically possible and persist cancellation state.

### Active Runs

- Maintain an active run query that returns currently queued/running task runs.
- Emit realtime events for task run state changes when the API/realtime foundation supports it.
- Provide enough state for the UI header indicator to show active task count.

### Failure Handling

- Catch scheduler errors, task lookup failures, disabled task attempts, agent lookup failures, and execution bootstrap failures.
- Persist failed run records with human-readable error messages and structured diagnostics.

## Out of Scope

- OpenCode session transcript persistence and continuation details beyond recording session IDs when available (Sub-Epic I4.3).
- Task-scoped permission merge/application (Sub-Epic I4.4).
- UI implementation of active run indicator (Sub-Epic I4.5).
- MCP task tools (Sub-Epic I4.6).

## Acceptance Criteria

- Manual-only tasks can be triggered manually and produce durable run records.
- One-time scheduled tasks run once at the configured time and do not repeat.
- Recurring tasks run according to their schedule and persist each run separately.
- Disabled or archived tasks do not run automatically.
- Failed execution attempts produce visible failed run records.
- Active queued/running task runs can be queried by the frontend.
- Task run status transitions are tested at the service level.

## Key Files to Create/Modify

- `packages/backend/src/services/task-scheduler-service.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/routes/tasks.ts`
- `packages/backend/src/ws/` or realtime event modules as needed
- `packages/backend/test/services/task-scheduler-service.test.ts`
- `packages/backend/test/services/task-execution-service.test.ts`

## Reference

- Parent epic: `development/integrations-automation/04-automations.md`
- Runtime scheduler placeholder: `packages/backend/src/services/scheduler-service.ts`
- Drain/active-operation patterns: `packages/backend/src/lib/drain-protocol.ts`
