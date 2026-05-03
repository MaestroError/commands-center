# I4.6 Tasks Management MCP

## Goal

Expose task management actions through a separate chat-oriented Tasks Management MCP so AI agents can create tasks, trigger manual runs, schedule one-time jobs, and check task/run status using the same backend services as the REST API and UI.

This sub-epic is for chat-level and user-confirmable task management tools. It is distinct from task-run-only automation tools, which stay on `cc_app` and belong to task execution permissions in I4.4.

## Pre-Conditions

- I4.1 Task Data Model and Service API is complete.
- I4.2 Scheduler and Execution Lifecycle is complete.
- I6 App-Provided MCP Server is complete.
- I4.4 Task-Scoped Tool and MCP Permissions is complete enough to enforce tool access rules.

## Scope

### MCP Tools

- Add chat-level task management MCP tools for task creation with confirmation.
- Add manual task trigger tool.
- Add one-time task scheduling tool.
- Add task status and run status lookup tools.
- Add task list and task detail lookup tools suitable for direct chat use.
- Add recurring task history lookup tools so agents can inspect prior outcomes before proposing or triggering a new run.
- Keep tools that mutate the currently executing task run itself out of this epic; those are task-run-only tools handled by I4.4.
- Add recurring schedule creation only if the user-facing service contract is stable enough; otherwise defer recurring creation to UI/API.

### MCP Surface Split

- Use a separate Tasks Management MCP surface for chat-based task tools instead of publishing them through `cc_app`.
- Keep `cc_app` focused on agent-scoped app tools and task-run-only execution helpers.
- The Tasks Management MCP can still reuse the same backend task services, schemas, and policy checks as REST and `cc_app`.
- Tool names on the Tasks Management MCP should remain stable and clearly task-oriented.

Suggested initial chat-level tool set:

- create a task with confirmation
- list tasks
- read a task by id or slug
- manually trigger a task
- schedule a one-time task run
- read recent task runs
- read recurring task run history
- optionally archive, disable, or cancel a task only if the confirmation and policy model is already stable

### Service Reuse

- MCP tools must call the same task services as REST routes and UI mutations.
- Do not duplicate task business rules inside MCP tool handlers.
- Return structured results that are easy for agents to interpret.

### Permissions and Safety

- Require the calling agent to have access to the relevant Tasks Management MCP tools.
- Respect task-scoped permission rules and assigned agent constraints.
- Prevent agents from creating tasks that grant broader unsafe permissions than allowed by the app policy.
- Mark these task management tools as chat-level live tools by default when they require confirmation, live UI review, or interactive follow-up.
- Ensure these chat-level tools never appear in task execution sessions.

### Observability

- Tool responses should include task IDs, run IDs, status, and next run metadata when applicable.
- Tool errors should be structured and actionable.

## Out of Scope

- Full Tasks UI (Sub-Epic I4.5).
- New external MCP server integrations.
- Multi-agent task orchestration or group chat.

## Acceptance Criteria

- AI agents with the Tasks Management MCP enabled can create a task through an MCP tool.
- AI agents can manually trigger an existing task through an MCP tool.
- AI agents can schedule a one-time task run through an MCP tool.
- AI agents can check task and run status through MCP tools.
- AI agents can list tasks and inspect recent recurring task history through MCP tools.
- Chat-level task management tools are not exposed to any task session.
- MCP task tools use the same task services as REST/UI paths.
- Permission violations are rejected with structured MCP errors.
- Tests cover successful tool calls and permission/validation failures.

## Key Files to Create/Modify

- `packages/backend/src/mcp/tasks-management/` task management tool definitions
- `packages/backend/src/mcp/tasks-management/` task management MCP service or registry
- `packages/backend/src/services/task-service.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/shared/src/schemas/` MCP tool input/output schemas if shared
- `packages/backend/test/routes/tasks-management-mcp.test.ts`
- `packages/backend/test/mcp/` task tool tests if a dedicated test folder exists

## Reference

- Parent epic: `development/integrations-automation/04-automations.md`
- App MCP server epic: `development/integrations-automation/06-app-provided-mcp-server.md`
- Existing app MCP implementation: `packages/backend/src/mcp/cc-managed/`
