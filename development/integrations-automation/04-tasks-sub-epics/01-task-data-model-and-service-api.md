# ✅ I4.1 Task Data Model and Service API

## Goal

Create the durable Tasks foundation: schemas, database tables, service layer, and REST API for task definitions and run records. After this sub-epic, CommandsCenter can store and manage tasks independently from the scheduler and UI execution surfaces.

## Pre-Conditions

- C1 Database and Workspace Foundation is complete.
- C2 Agent Workspace Lifecycle is complete.
- C3 Direct Chat Session Model is complete.
- I4 parent epic has accepted Tasks terminology and scope.

## Scope

### Shared Contracts

- Add shared schemas for task definitions, task todos, schedules, statuses, run records, and lifecycle inputs/outputs.
- Support trigger modes: manual, one-time scheduled, and recurring schedule.
- Define task status values covering at least draft, enabled, disabled, archived, running, failed, and completed where applicable.
- Define run status values covering at least queued, running, completed, failed, cancelled, and skipped.

### Database

- Add `tasks` table with title, description, context, todos JSON, status, trigger mode, schedule definition, assigned agent ID, permission profile JSON, enabled/archived flags, and timestamps.
- Add `task_runs` table with task ID, agent ID, OpenCode session ID, status, trigger source, rendered prompt/context, effective permissions JSON, result, error details, started/completed timestamps, and cancellation metadata.
- Add `task_run_events` only if needed for lifecycle diagnostics or reliable realtime UI updates.
- Generate and commit migrations for both SQLite and PostgreSQL-compatible schema changes.

### Backend Service API

- Create a task service as the single source of truth for task CRUD and run metadata access.
- Implement list, get, create, update, archive, restore, delete, enable, disable, and run-history methods.
- Enforce optional max-task limit from runtime config when configured.
- Validate all external inputs with shared Zod schemas at route boundaries.

### REST Routes

- Add routes for task CRUD and run history.
- Keep route handlers thin; all business behavior belongs in the task service.
- Use typed response schemas for every route.

## Out of Scope

- Actually scheduling or executing task runs (Sub-Epic I4.2).
- OpenCode session creation/continuation behavior (Sub-Epic I4.3).
- Permission merge/effective permission application (Sub-Epic I4.4).
- Full Tasks UI (Sub-Epic I4.5).
- App MCP tools for task management (Sub-Epic I4.6).

## Acceptance Criteria

- Tasks can be created, listed, retrieved, updated, archived, restored, enabled, disabled, and deleted through REST APIs.
- Task definitions persist title, description, context, todos, status, trigger mode, schedule, assigned agent, and permission profile fields.
- Task run records can be listed and retrieved even before execution behavior is implemented.
- Configured max-task limits are enforced when present and ignored when disabled.
- All persisted task state lives inside `.cc/workspace` and follows the Portable Workspace Rule.
- Backend service and route tests cover successful lifecycle flows and validation failures.

## Key Files to Create/Modify

- `packages/shared/src/schemas/` — task and task-run schemas
- `packages/backend/src/db/schema/` — task and task-run tables
- `packages/backend/src/db/migrations/` — generated migrations
- `packages/backend/src/services/task-service.ts`
- `packages/backend/src/routes/tasks.ts`
- `packages/backend/test/services/task-service.test.ts`
- `packages/backend/test/routes/tasks.test.ts`

## Reference

- Parent epic: `development/integrations-automation/04-automations.md`
- Existing service patterns: `packages/backend/src/services/agent-service.ts`
- Existing route patterns: `packages/backend/src/routes/agents.ts`
