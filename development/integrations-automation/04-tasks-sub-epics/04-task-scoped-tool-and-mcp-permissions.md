# I4.4 Task-Scoped Tool and MCP Permissions

## Goal

Allow each task to run with a task-specific effective permission profile, so scheduled or manual task executions can use only the tools/MCP servers needed for that task without mutating the assigned agent's default permissions.

## Pre-Conditions

- I4.1 Task Data Model and Service API is complete.
- I4.2 Scheduler and Execution Lifecycle is complete enough to execute runs.
- I2 Integrations and MCP Management is complete.
- I3 Custom Tools Platform is complete.
- I6 App-Provided MCP Server is complete.

## Scope

### Permission Model

- Define task permission profile schema for built-in tools, custom tools, app-provided MCP servers, external MCP servers, and tool approval policy.
- Default effective permissions to the assigned agent's permissions.
- Apply task-specific overrides at run time.
- Persist effective permissions on each `task_runs` record.

### Safety Defaults

- Deny live/interactive tools by default for scheduled and recurring runs.
- Require explicit task-level opt-in before live/interactive tools can run in scheduled contexts.
- Allow automation-only tools to be enabled for task runs without exposing them in normal direct chat.

### Runtime Application

- Ensure task-scoped permissions apply only to the specific task run.
- Do not mutate the agent's base `opencode.jsonc` or default permission profile unless a user explicitly edits the agent.
- Ensure task permission failures are caught and recorded as failed run diagnostics.

### Auditability

- Persist the effective permission profile used by every run.
- Show enough metadata for later diagnosis and replay planning.

## Out of Scope

- UI editor for the full permission profile beyond what I4.5 needs to expose.
- Adding new tool permission concepts unrelated to task execution.
- Multi-user approval workflows.

## Acceptance Criteria

- A task can define permission overrides separate from the assigned agent.
- Effective permissions are computed from agent defaults plus task overrides.
- Scheduled and recurring runs deny live/interactive tools by default.
- Effective permissions are persisted on `task_runs`.
- Permission failures are caught and recorded as failed runs.
- Agent default permissions are not mutated by task execution.
- Tests cover permission merging, safety defaults, and persisted effective permissions.

## Key Files to Create/Modify

- `packages/shared/src/schemas/` task permission schemas
- `packages/backend/src/services/task-permission-service.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/mcp/cc-managed/` integration points as needed
- `packages/backend/test/services/task-permission-service.test.ts`
- `packages/backend/test/services/task-execution-service.test.ts`

## Reference

- Parent epic: `development/integrations-automation/04-automations.md`
- Agent permission model: `packages/shared/src/schemas/agents.ts`
- Agent editor MCP permissions: `development/integrations-automation/02-integrations-and-mcp-management-sub-epics/03-agent-editor-mcp-permissions.md`
