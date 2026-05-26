# I4.9 Phase 6: REST API and MCP Surface

## Goal

Expose the new queue-first task lifecycle through REST and MCP while removing or replacing trigger-mode-oriented APIs.

## Blockers

- Phase 3: Backend Queue Lifecycle.
- Phase 4: Task Run Context Builder.
- Phase 5: Scheduler, Templates, and Archival.

## Unblocks

- Phase 7: Frontend Integration.

## Scope

- Replace task trigger endpoints with queue-oriented endpoints.
- Add endpoints for task comments.
- Add endpoints for subtasks.
- Add endpoints for task acceptance, scheduling, and archive listing.
- Add endpoints for recurring templates and template Run Now.
- Update task management MCP tools to call the same services as REST.
- Update task-run outcome MCP tools so result/human-review behavior drives task board status.

## REST Contracts

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/queue`
- `POST /api/tasks/:id/accept`
- `POST /api/tasks/:id/archive`
- `POST /api/tasks/:id/restore`
- `GET /api/tasks/archive`
- `GET /api/tasks/:id/runs`
- `GET /api/tasks/:id/runs/:runId`
- `POST /api/tasks/:id/runs/:runId/cancel`
- `GET /api/tasks/:id/comments`
- `POST /api/tasks/:id/comments`
- `PATCH /api/tasks/:id/comments/:commentId`
- `GET /api/tasks/:id/subtasks`
- `POST /api/tasks/:id/subtasks`
- `PATCH /api/tasks/:id/subtasks/:subtaskId`
- `POST /api/tasks/templates`
- `GET /api/tasks/templates`
- `POST /api/tasks/templates/:id/run-now`

## MCP Contracts

- `create_task`
- `list_tasks`
- `get_task`
- `queue_task`
- `schedule_task`
- `add_task_comment`
- `list_task_runs`
- `get_task_run`
- `create_task_template`
- `run_task_template_now`
- Keep task-run session tools: `set_task_result`, `add_task_artifact`, `mark_needs_human_review`.

## Backend Files

- `packages/backend/src/routes/tasks.ts`
- `packages/backend/src/mcp/cc-managed/groups/cc-tasks-management/tools/task-management-tools.ts`
- `packages/backend/src/mcp/cc-managed/groups/cc-default/tools/task-run-outcome-tools.ts`
- `packages/shared/src/schemas/tasks.ts`
- `packages/frontend/src/lib/api.ts` only if shared API typing needs to compile before UI work.

## Verification

- Route tests cover new lifecycle endpoints.
- MCP tests cover queueing, scheduling, comments, template creation, and template Run Now.
- Existing task-run session inspection and open-in-chat behavior still works for task runs.
