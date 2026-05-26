# ✅ I4.9 Phase 2: Data Reset and Schema Cutover

## Goal

Apply the new task schema without preserving old task data. Existing task, task template, scheduler, and task run data may be deleted during this phase so the implementation can move cleanly to the new model.

## Blockers

- Phase 1: Contracts and DB Model.

## Unblocks

- Phase 3: Backend Queue Lifecycle.
- Phase 5: Scheduler, Templates, and Archival.

## Scope

- Reset old task-related tables or replace them with new schema-compatible tables.
- Remove old template proxy-row assumptions from persisted data.
- Remove old one-time scheduled task template data from persisted data.
- Keep unrelated data intact, including agents, conversations not tied to deleted task runs, settings, providers, MCP servers, tools, and secrets.
- Ensure task-run-owned conversations are handled consistently if their task run rows are deleted.

## Cutover Boundary

- This phase resets old task data and keeps the additive Phase 1 schema in place.
- Legacy columns required by the current service implementation stay in the schema until Phase 3 replaces the task lifecycle services.
- The temporary migration repair shim is not needed because old task data can be reset manually or through the reset migration.
- Task-run-owned conversations are treated as task-related data and are deleted with their messages.

## Data Handling Decision

- Existing task data does not need to migrate forward.
- Existing task runs do not need to migrate forward.
- Existing recurring templates do not need to migrate forward.
- Existing scheduler state for tasks/templates does not need to migrate forward.
- The migration or manual reset should avoid damaging non-task application state.

## Database Files

- `packages/backend/src/db/schema/tasks.ts`
- `packages/backend/src/db/migrations/`
- `packages/backend/src/db/migrations/meta/`
- Test DB setup helpers if they seed old task assumptions.

## Verification

- Fresh database starts with the new task schema.
- Existing test database setup can still use old trigger modes until Phase 3 replaces services.
- Task-related reset leaves non-task tables available.
- Backend tests that do not depend on tasks still pass.
- Data cleaning itself is verified manually by reviewing the reset migration SQL.
