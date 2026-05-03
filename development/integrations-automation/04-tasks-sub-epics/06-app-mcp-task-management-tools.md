# I4.6 App MCP Task Management Tools

## Goal

Expose task management actions through the app-provided MCP server so AI agents can create tasks, trigger manual runs, schedule one-time jobs, and check task/run status using the same backend services as the REST API and UI.

## Pre-Conditions

- I4.1 Task Data Model and Service API is complete.
- I4.2 Scheduler and Execution Lifecycle is complete.
- I6 App-Provided MCP Server is complete.
- I4.4 Task-Scoped Tool and MCP Permissions is complete enough to enforce tool access rules.

## Scope

### MCP Tools

- Add app-provided MCP tools for task creation.
- Add manual task trigger tool.
- Add one-time task scheduling tool.
- Add task status and run status lookup tools.
- Add recurring schedule creation only if the user-facing service contract is stable enough; otherwise defer recurring creation to UI/API.

### Service Reuse

- MCP tools must call the same task services as REST routes and UI mutations.
- Do not duplicate task business rules inside MCP tool handlers.
- Return structured results that are easy for agents to interpret.

### Permissions and Safety

- Require the calling agent to have access to the relevant app-provided MCP task tools.
- Respect task-scoped permission rules and assigned agent constraints.
- Prevent agents from creating tasks that grant broader unsafe permissions than allowed by the app policy.

### Observability

- Tool responses should include task IDs, run IDs, status, and next run metadata when applicable.
- Tool errors should be structured and actionable.

## Out of Scope

- Full Tasks UI (Sub-Epic I4.5).
- New external MCP server integrations.
- Multi-agent task orchestration or group chat.

## Acceptance Criteria

- AI agents with the app-provided MCP server enabled can create a task through an MCP tool.
- AI agents can manually trigger an existing task through an MCP tool.
- AI agents can schedule a one-time task run through an MCP tool.
- AI agents can check task and run status through MCP tools.
- MCP task tools use the same task services as REST/UI paths.
- Permission violations are rejected with structured MCP errors.
- Tests cover successful tool calls and permission/validation failures.

## Key Files to Create/Modify

- `packages/backend/src/mcp/cc-managed/` task tool definitions
- `packages/backend/src/services/task-service.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/shared/src/schemas/` MCP tool input/output schemas if shared
- `packages/backend/test/routes/cc-managed-mcp.test.ts`
- `packages/backend/test/mcp/` task tool tests if a dedicated test folder exists

## Reference

- Parent epic: `development/integrations-automation/04-automations.md`
- App MCP server epic: `development/integrations-automation/06-app-provided-mcp-server.md`
- Existing cc-managed MCP implementation: `packages/backend/src/mcp/cc-managed/`
