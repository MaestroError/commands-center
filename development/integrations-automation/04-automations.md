# I4 Tasks

## Outcome

The user can create agent-backed tasks with context and todos, trigger them manually or on a schedule, review execution history, inspect or continue the OpenCode sessions created by task runs, and manage active or archived tasks.

## Why this is a separate PR

This is a full product feature with its own task model, scheduler, execution lifecycle, permission scoping, OpenCode session persistence, realtime run status, and user-facing screen.

## Blockers

- E2 OpenCode Orchestrator
- E3 API and Realtime Foundation
- C3 Direct Chat Session Model
- I6 App-Provided MCP Server (for exposing scheduling tools to agents)

## Unblocks

- No hard blockers. This is the final major Phase 1 feature.

## Scope

- Rename the product surface from **Automations** to **Tasks** in navigation, routes, page titles, API naming where practical, and user-facing copy
- Implement tasks as durable records with title, description, context, todo list, status, schedule, agent assignment, permission profile, archived state, created/updated timestamps, and latest result summary
- Support three trigger modes: manual trigger only, one-time scheduled run, and repeated schedule using cron-like expressions
- Implement scheduler abstraction for local mode, with persisted scheduler state in the portable workspace database
- Implement task CRUD, archive, restore, delete, enable, disable, manual trigger, run cancel, and status behavior as backend services exposed via REST API routes
- Expose one-time task scheduling, manual task trigger, and status check via the app-provided MCP server, so AI agents can create and monitor jobs programmatically
- Enforce optional max-task limit from config
- Run each task execution as a separate OpenCode agent session with enriched prompt context that includes task title, description, context, todos, trigger metadata, and previous relevant run result when useful
- Persist every task run with status, started/completed timestamps, trigger source, rendered prompt/context, error details, result summary, and linked OpenCode session ID
- Persist OpenCode sessions triggered by task runs so users can inspect them later and continue the same session from direct chat when appropriate
- Catch and persist execution failures, including scheduler errors, OpenCode request failures, permission failures, and cancellation
- Add per-task tool and MCP permission scoping so task runs can allow a different subset of tools than the base agent, while explicitly excluding unsafe/live tools unless the user enables them for that task
- Ensure task-scoped permissions are applied only for that run and do not mutate the agent's default permission profile unless explicitly requested
- Add active task run indicator in the top app header showing when one or more tasks are running, with a link to the active runs/tasks view
- Prevent or clearly warn before refresh/upgrade/shutdown operations when task runs are active
- Build Tasks list, task editor, task detail, run history, run detail/session links, and active runs views
- Ensure Tasks screens and run history are responsive on mobile viewports

## Data Model Requirements

- `tasks`: durable task definition with title, description, context, todos JSON, status, trigger mode, schedule definition, agent ID, permission profile, enabled/archived flags, and timestamps
- `task_runs`: append-only run history with task ID, agent ID, OpenCode session ID, status, trigger source, rendered prompt/context, result, error details, started/completed timestamps, and cancellation metadata
- `task_run_events`: optional append-only event log for lifecycle transitions and streaming/status diagnostics if needed for reliable UI updates
- Task status values should cover at least draft, enabled, disabled, archived, running, failed, and completed where applicable
- Run status values should cover at least queued, running, completed, failed, cancelled, and skipped
- All task state must live inside `.cc/workspace` and sync through the existing portable DB rules

## Permission Requirements

- Each task can define a task-specific permission profile for built-in tools, custom tools, app-provided MCP servers, external MCP servers, and tool approval policy
- Task permissions should default to the assigned agent's permissions, then apply task-specific overrides
- Live/interactive tools must be denied by default for scheduled and repeated runs unless explicitly enabled for that task
- Automation-only tools can be enabled for task runs without exposing them in normal direct chat
- The effective permission profile used for each run must be persisted on `task_runs` for auditability and future replay/diagnosis

## Session Requirements

- Each task run creates or records a dedicated OpenCode session linked from `task_runs`
- Users can open a completed or failed run and inspect the exact session transcript/context
- Users can continue a task-created OpenCode session in chat when the session is still valid for the agent workspace
- Failed session creation or failed prompt execution must produce a failed run record with a human-readable error message and structured diagnostic details

## UX Requirements

- Rename sidebar/menu item from **Automations** to **Tasks**
- Add active tasks indicator to the top header; it should show the count of running task runs and link to the active runs/tasks page
- Tasks list supports filtering by status, trigger mode, agent, and archived state
- Task detail shows current status, next scheduled run, latest run result, todos, context, permission summary, and run history
- Run detail shows status timeline, rendered prompt/context, result, error details, and linked OpenCode session
- Manual trigger is available from list and detail views when the task is enabled and not already running, subject to scheduler/execution constraints

## Acceptance Criteria

- Behavior matches the Tasks screen requirements and updates/replaces `design/screens/automations/acceptance_criteria.md` with Tasks terminology
- Navigation and user-facing copy use **Tasks**, not **Automations**
- A task can be unscheduled/manual-only, scheduled once, or scheduled repeatedly
- A task has title, description, context, todos, status, permission profile, and latest result visibility
- Each run creates and persists a separate OpenCode agent session link
- Users can inspect task-created sessions and continue them in chat when valid
- Run history shows execution status, trigger source, time, rendered prompt/context, result, linked session, and error details when present
- Configured limits are enforced when present and ignored when disabled
- Failed runs are recorded and remain visible for diagnosis
- Task-specific tool/MCP permissions are applied to task runs and persisted with run records
- Live/interactive tools are unavailable to scheduled/repeated runs by default
- Active task run indicator appears in the top header whenever one or more task runs are running
- Upgrade/shutdown/refresh-sensitive operations warn or block when active runs exist
- Tasks list, task detail, task editor, active runs, and run history adapt correctly to mobile viewports
- One-time task scheduling, manual task trigger, and status check are available via the app-provided MCP server, enabling AI agents to create and monitor jobs

## Non-Goals

- Group chat orchestration
- Kanban task execution
- Multi-user task assignment
- External distributed worker fleet management
- Bare-metal cron integration outside the CommandsCenter scheduler

## Recommended Sub-Epics

This epic should be split into sub-epics. It is now too broad for one safe PR because it crosses schema, scheduler, OpenCode sessions, permission scoping, MCP tools, and multiple UI surfaces.

1. **I4.1 Task Data Model and Service API** — `development/integrations-automation/04-tasks-sub-epics/01-task-data-model-and-service-api.md`
   - Add task/task-run schemas, migrations, services, REST routes, and tests
   - Include CRUD, archive/restore/delete, status, trigger mode, todos, context, and limits

2. **I4.2 Scheduler and Execution Lifecycle** — `development/integrations-automation/04-tasks-sub-epics/02-scheduler-and-execution-lifecycle.md`
   - Implement manual, one-time, and repeated scheduling
   - Add queue/run lifecycle, cancellation, active run tracking, failure capture, and persisted run history

3. **I4.3 OpenCode Session Persistence and Continuation** — `development/integrations-automation/04-tasks-sub-epics/03-opencode-session-persistence-and-continuation.md`
   - Create task-run OpenCode sessions, persist session IDs, link transcripts/results, and support opening/continuing task sessions from chat

4. **I4.4 Task-Scoped Tool and MCP Permissions** — `development/integrations-automation/04-tasks-sub-epics/04-task-scoped-tool-and-mcp-permissions.md`
   - Define effective permission merging from agent defaults plus task overrides
   - Deny live/interactive tools by default for scheduled runs
   - Persist effective permissions per run

5. **I4.5 Tasks UI and Active Run Indicator** — `development/integrations-automation/04-tasks-sub-epics/05-tasks-ui-and-active-run-indicator.md`
   - Rename Automations to Tasks in navigation
   - Build list/editor/detail/run history/run detail/active runs UI
   - Add top-header active task indicator and mobile responsive behavior

6. **I4.6 App MCP Task Management Tools** — `development/integrations-automation/04-tasks-sub-epics/06-app-mcp-task-management-tools.md`
   - Expose task creation, manual trigger, one-time scheduling, and status checks via the app-provided MCP server
   - Ensure MCP tools call the same task services as REST/UI
