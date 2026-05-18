# I4.7 Task Run Variable Context

## Goal

Move execution context from the durable task definition to each task run, so every manual, scheduled, API-triggered, or MCP-triggered execution can receive context that is specific to that run.

## Pre-Conditions

- I4.1 Task Data Model and Service API is complete enough to migrate task and task-run schemas.
- I4.2 Scheduler and Execution Lifecycle is complete enough to route all task starts through `TaskExecutionService.trigger`.
- I4.6 Tasks Management MCP is complete enough to expose `trigger_task`.

## Scope

### Data Model and Contracts

- Remove user-entered execution context from `tasks` creation and update contracts.
- Add optional `context` to `triggerTaskInputSchema` and persist it on `task_runs` as structured JSON.
- Keep `renderedContext` as the execution/audit snapshot built for the run; it should include task identity, trigger source, trigger metadata, schedule metadata, todos, and the run context payload.
- Preserve existing task description and todos as stable task definition fields.

### Trigger Service

- Update `TaskExecutionService.trigger(taskId, input)` to accept optional run context.
- Render task prompts from stable task fields plus the run context supplied at trigger time.
- Ensure scheduled runs can pass scheduler-generated context later without mutating the task.
- Keep duplicate-run prevention and enabled/archived checks unchanged.

### REST and UI

- Update `POST /api/tasks/:id/trigger` to accept optional context in the request body.
- Add a small manual-run context modal or drawer in Tasks UI.
- Do not ask for context while creating or editing a task.
- Allow empty context for quick manual triggers.

### MCP

- Update the existing `trigger_task` MCP tool in `packages/backend/src/mcp/cc-managed/groups/cc-tasks-management/tools/task-management-tools.ts` to accept optional context.
- Include the supplied context in the confirmation metadata so the operator can review what will be passed to the run.
- Pass the context through `TaskExecutionService.trigger` instead of storing it on the task.

## Out of Scope

- Public external API authentication or API-key design.
- Rich context-builder UI beyond a basic optional text/JSON input.
- Historical migration cleanup beyond preserving existing task context in an acceptable compatibility path.

## Acceptance Criteria

- New task definitions no longer require or store per-run context.
- Manual REST triggers can pass optional context and the created run persists it.
- Manual UI triggers support optional context without changing the task definition.
- The `trigger_task` MCP tool accepts optional context and passes it into the created run.
- Rendered prompts include run context only when supplied for that execution.
- Tests cover REST trigger context, service prompt rendering, and MCP `trigger_task` context passthrough.

## Key Files to Modify

- `packages/shared/src/schemas/tasks.ts`
- `packages/backend/src/db/schema/tasks.ts`
- `packages/backend/src/db/migrations/`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/routes/tasks.ts`
- `packages/backend/src/mcp/cc-managed/groups/cc-tasks-management/tools/task-management-tools.ts`
- `packages/frontend/src/pages/TasksPage.tsx`
- `packages/frontend/src/pages/TaskDetailPage.tsx`
- `packages/frontend/src/lib/api.ts`
- `packages/backend/test/services/task-execution-service.test.ts`
- `packages/backend/test/routes/tasks.test.ts`
- `packages/backend/test/routes/cc-managed-mcp.test.ts`
