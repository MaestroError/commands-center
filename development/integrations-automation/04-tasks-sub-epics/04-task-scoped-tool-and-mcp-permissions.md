# ✅ I4.4 Task-Scoped Tool and MCP Permissions

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
- Add app-tool metadata that marks whether a tool is live/interactive, automation-safe, task-run-only, chat-only, or usable in both contexts.
- Exclude live/interactive CC-managed MCP tools from every task session, including any `cc_app` tools that depend on live UI confirmations, live event streaming, or direct chat follow-up.
- Ensure task permission merging can filter or deny CC-managed app tools based on these metadata flags before task-specific allow rules are applied.
- Default effective permissions to the assigned agent's permissions.
- Apply task-specific overrides at run time.
- Persist effective permissions on each `task_runs` record.
- Ensure task execution never depends on user approvals during a run. Task sessions must run with auto-approve enabled, or equivalently with no effective tool left in `ask` mode.

### App MCP Tool Split

- Treat task execution tools and chat-based task management tools as two separate MCP surfaces.
- Task-run-safe tools are automation-oriented tools that can execute without live user interaction and are eligible for task runs when allowed by the task permission profile.
- Chat-level task management tools are interactive tools intended for direct chat sessions, where the user can confirm actions, review drafts, and receive live feedback.
- Keep task-run-only tools on `cc_app`, because they operate inside the current task execution session rather than through a user-facing management conversation.
- Publish chat-based task management tools through a separate Tasks Management MCP surface rather than `cc_app`.
- Do not publish chat-level task management tools into any task session.

### Task-Run-Only Tools

- Add explicit support for task-run-only app tools that are not useful in normal direct chat and should only be available inside task execution sessions.
- The first task-run-only tool set should include at least:
  - add a result or result note to the current task run
  - mark the current task as complete
  - read recent runs for the current recurring task
  - add new task todo items
  - mark task todo items as complete
- Consider additional task-run-safe tools such as appending structured diagnostics, reading current task metadata, or marking a run as blocked/deferred if the execution model needs them.

### Safety Defaults

- Deny live/interactive tools for all task sessions.
- Do not allow task-level opt-in for live/chat-oriented tools inside task sessions, because tasks are user-less by nature.
- Allow automation-only and task-run-only tools to be enabled for task runs without exposing them in normal direct chat.
- Convert or reject any effective `ask` permissions before task execution begins. A task run must either receive fully auto-approved allowed tools or fail validation before session start.
- Manual, scheduled, and recurring task runs must all deny tools marked as live even if the assigned agent normally has them enabled in direct chat.

### Runtime Application

- Ensure task-scoped permissions apply only to the specific task run.
- Do not mutate the agent's base `opencode.jsonc` or default permission profile unless a user explicitly edits the agent.
- Ensure task permission failures are caught and recorded as failed run diagnostics.
- Ensure task-run-effective permissions are computed from the assigned agent defaults, then narrowed or extended by task overrides and app-tool safety metadata for the current trigger context.
- Persist enough detail to explain why a requested tool was filtered out, for example `live_tool_denied_for_task_session`, `chat_only_tool_hidden_from_task_run`, `ask_mode_not_allowed_for_task_run`, or `not_enabled_for_task`.
- Keep the implementation strategy for passing per-task permissions open for now, but require an immutable per-run effective permission snapshot and server-side enforcement for CC-managed tools.

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
- All task sessions deny live/interactive tools.
- CC-managed app tools can be marked as live/interactive, task-run-only, chat-only, or shared, and task execution respects those flags.
- Live chat-oriented task management tools are not published into any task session.
- Task-run-only tools can be enabled for task execution without exposing them in normal direct chat.
- Task sessions run with auto-approve enabled or an equivalent no-`ask` effective permission profile.
- Effective permissions are persisted on `task_runs`.
- Permission failures are caught and recorded as failed runs.
- Agent default permissions are not mutated by task execution.
- Tests cover permission merging, safety defaults, and persisted effective permissions.

## Key Files to Create/Modify

- `packages/shared/src/schemas/` task permission schemas
- `packages/backend/src/services/task-permission-service.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/mcp/cc-managed/` integration points as needed
- `packages/backend/src/mcp/cc-managed/` app tool metadata and filtering hooks
- `packages/backend/test/services/task-permission-service.test.ts`
- `packages/backend/test/services/task-execution-service.test.ts`

## Reference

- Parent epic: `development/integrations-automation/04-automations.md`
- Agent permission model: `packages/shared/src/schemas/agents.ts`
- Agent editor MCP permissions: `development/integrations-automation/02-integrations-and-mcp-management-sub-epics/03-agent-editor-mcp-permissions.md`
- App MCP task management tools: `development/integrations-automation/04-tasks-sub-epics/06-app-mcp-task-management-tools.md`
