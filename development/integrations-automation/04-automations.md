# I4 Tasks

## Outcome

The user can create agent-backed tasks with todos, trigger them manually or on a schedule with run-specific context, review execution history, inspect or continue the OpenCode sessions created by task runs, and manage active or archived tasks.

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
- Implement tasks as durable records with title, description, todo list, status, schedule, agent assignment, permission profile, archived state, created/updated timestamps, and latest result summary
- Support three trigger modes: manual trigger only, one-time scheduled run, and repeated schedule using a TickTick-style recurrence rule
- Implement scheduler abstraction for local mode, with persisted scheduler state in the portable workspace database
- Implement task CRUD, archive, restore, delete, enable, disable, manual trigger, run cancel, and status behavior as backend services exposed via REST API routes
- Expose task-run-safe execution helpers through `cc_app`, and expose chat-based task management through a separate Tasks Management MCP surface, so AI agents can both manage tasks in chat and operate inside task sessions safely
- Enforce optional max-task limit from config
- Run each task execution as a separate OpenCode agent session with enriched prompt context that includes task title, description, run-specific context, todos, trigger metadata, and previous relevant run result when useful
- Persist every task run with status, started/completed timestamps, trigger source, run-specific context, rendered prompt/context, error details, result summary, and linked OpenCode session ID
- Persist OpenCode sessions triggered by task runs so users can inspect them later and continue the same session from direct chat when appropriate
- Catch and persist execution failures, including scheduler errors, OpenCode request failures, permission failures, and cancellation
- Add per-task tool and MCP permission scoping so task runs can allow a different subset of tools than the base agent, while explicitly excluding unsafe/live tools from all task sessions
- Ensure task sessions do not depend on interactive approval. Task runs must use auto-approve or an equivalent no-`ask` effective permission profile
- Ensure task-scoped permissions are applied only for that run and do not mutate the agent's default permission profile unless explicitly requested
- Add active task run indicator in the top app header showing when one or more tasks are running, with a link to the active runs/tasks view
- Prevent or clearly warn before refresh/upgrade/shutdown operations when task runs are active
- Build Tasks list, task editor, task detail, run history, run detail/session links, and active runs views
- Ensure Tasks screens and run history are responsive on mobile viewports

## Data Model Requirements

- `tasks`: durable task definition with title, description, todos JSON, status, trigger mode, schedule definition, agent ID, permission profile, enabled/archived flags, and timestamps
- `task_runs`: append-only run history with task ID, agent ID, OpenCode session ID, status, trigger source, run-specific context, rendered prompt/context, result, error details, started/completed timestamps, and cancellation metadata
- `task_run_events`: optional append-only event log for lifecycle transitions and streaming/status diagnostics if needed for reliable UI updates
- Task status values should cover at least draft, enabled, disabled, archived, running, failed, and completed where applicable
- Run status values should cover at least queued, running, completed, failed, cancelled, and skipped
- All task state must live inside `.cc/workspace` and sync through the existing portable DB rules

## Permission Requirements

- Each task can define a task-specific permission profile for built-in tools, custom tools, app-provided MCP servers, external MCP servers, and tool approval policy
- Task permissions should default to the assigned agent's permissions, then apply task-specific overrides
- Live/interactive tools must be denied for all task sessions
- Automation-only tools can be enabled for task runs without exposing them in normal direct chat
- Task-run-only tools on `cc_app` can be enabled for task sessions without exposing them in normal direct chat
- Chat-based task management tools belong to a separate Tasks Management MCP surface and never appear inside task sessions
- The effective permission profile used for each run must be persisted on `task_runs` for auditability and future replay/diagnosis

## Session Requirements

- Each task run creates or records a dedicated OpenCode session linked from `task_runs`
- Task sessions must not require interactive user responses for tool approvals during execution
- Users can open a completed or failed run and inspect the exact session transcript/context
- Users can continue a task-created OpenCode session in chat when the session is still valid for the agent workspace
- Failed session creation or failed prompt execution must produce a failed run record with a human-readable error message and structured diagnostic details

## UX Requirements

- Rename sidebar/menu item from **Automations** to **Tasks**
- Add active tasks indicator to the top header; it should show the count of running task runs and link to the active runs/tasks page
- Tasks list supports filtering by status, trigger mode, agent, and archived state
- Task detail shows current status, next scheduled run, latest run result, todos, permission summary, and run history
- Run detail shows status timeline, rendered prompt/context, result, error details, and linked OpenCode session
- Manual trigger is available from list and detail views when the task is enabled and not already running, subject to scheduler/execution constraints

## Board-Oriented Task Management User Story

As a user, I want CommandsCenter tasks to feel like Jira-style work items where AI agents are the assignees instead of people. I want to add rough work items to a backlog, refine them until they are ready, send them for execution, inspect the AI output, give feedback, retry with the same or another agent, and keep the full execution history as part of the task context.

### Backlog and Execution Readiness

- I can quickly add work items to a backlog without deciding immediately when or how they should run.
- When I am sure a task is ready for execution, I can send it to the execution queue by moving it to a queued status or clicking a simple action.
- When a task is queued, it means the system should run it; there is no extra confirmation step before creating or starting the task run.
- If the task should not run now, but I know exactly when it should run, I can schedule a date and time for it to move into execution automatically.
- Scheduled one-time work is still a normal task, not a recurring template.
- The UI should make scheduled tasks easy to find, either with a separate Scheduled column when there is at least one scheduled task or with a one-click Scheduled filter.

### After a Successful Run

- When AI execution completes successfully, the task should move to a Ready to Check column, not directly to Done.
- I can open the task, inspect the result, view artifacts, and decide whether the output is acceptable.
- If I like the result, I can manually move the task to Done.
- If I do not like the result, I can add one or more feedback comments to the task.
- When I am sure my feedback is complete, I can move the task back to queued so the AI agent can read the task, my comments, and the previous run history before attempting it again.
- The second run should be a separate task run/session, but it should belong to the same task and have access to the previous results, artifacts, and user feedback.
- When the second run completes, the task should return to Ready to Check so I can review it again.

### Review and Failure Handling

- If a task run fails, the task should move to Review.
- If the AI agent marks the run as needing human review, the task should move to Review.
- Review is for tasks that need user attention before another run or before acceptance.
- A running task does not need its own board column; the task can stay in queued while the UI shows a loading/running indicator based on the active task run.

### Feedback Loop and Reassignment

- I can add feedback as task comments after reviewing a run.
- Open/unhandled comments become the current run's actionable feedback when the task is queued again.
- I can reassign a task to another AI agent before retrying, so a different agent can continue from the same task context.
- Past runs must preserve the actual agent that executed them, even if the task is reassigned later.
- The task card and detail view should show all past runs and a general task context that includes the description, feedback comments, results, artifacts, review notes, and failure history.

### Subtasks

- I can add subtasks inside a task and assign those subtasks to different AI agents.
- Subtasks are simple objects with a title, description, optional default agent, and lightweight status.
- Subtasks are not separate board cards by default.
- A subtask run should still be recorded as part of the parent task's run history and context.
- The prompt for a subtask run should be built differently from a whole-task run, focusing the agent on the subtask while still providing parent task context.

### Done and Archive Lifecycle

- When I move a task to Done, it should remain visible in Done for a configurable period.
- The default Done retention period is one week.
- After the retention period, the task should automatically move to Archived.
- Archived tasks are not part of the board; they appear on a separate archive page as a simple list.
- The Done-to-Archive retention period should be configurable in settings.

### Run Context Requirements

- Every task run should receive the task's current description, relevant comments, unhandled feedback comments, target subtask when applicable, previous run results, previous run review/failure notes, and previous artifacts.
- Artifacts in run context should include full paths or URLs so the agent can reference them accurately.
- The run should store the exact context snapshot it received, so future inspection is reproducible even if the task changes later.
- The UI can present run history and task context as one unified task timeline, while storage should keep task data, comments, subtasks, and runs separately enough to preserve history.

## Acceptance Criteria

- Behavior matches the Tasks screen requirements and updates/replaces `design/screens/automations/acceptance_criteria.md` with Tasks terminology
- Navigation and user-facing copy use **Tasks**, not **Automations**
- A task can be unscheduled/manual-only, scheduled once, or scheduled repeatedly
- A task has title, description, todos, status, permission profile, and latest result visibility
- Each run creates and persists a separate OpenCode agent session link
- Users can inspect task-created sessions and continue them in chat when valid
- Run history shows execution status, trigger source, time, rendered prompt/context, result, linked session, and error details when present
- Configured limits are enforced when present and ignored when disabled
- Failed runs are recorded and remain visible for diagnosis
- Task-specific tool/MCP permissions are applied to task runs and persisted with run records
- Live/interactive tools are unavailable to all task sessions
- Task sessions do not expose tools in `ask` mode and do not require user approval during execution
- Active task run indicator appears in the top header whenever one or more task runs are running
- Upgrade/shutdown/refresh-sensitive operations warn or block when active runs exist
- Tasks list, task detail, task editor, active runs, and run history adapt correctly to mobile viewports
- Task-run-safe execution helpers are available through `cc_app`, and chat-based task management is available through a separate Tasks Management MCP surface

## Non-Goals

- Group chat orchestration
- Multi-user Jira-style collaboration
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
   - Deny live/interactive tools for all task sessions
   - Ensure task runs do not rely on `ask` approvals
   - Persist effective permissions per run

5. **I4.5 Tasks UI and Active Run Indicator** — `development/integrations-automation/04-tasks-sub-epics/05-tasks-ui-and-active-run-indicator.md`
   - Rename Automations to Tasks in navigation
   - Build list/editor/detail/run history/run detail/active runs UI
   - Add top-header active task indicator and mobile responsive behavior

6. **I4.6 Tasks Management MCP** — `development/integrations-automation/04-tasks-sub-epics/06-app-mcp-task-management-tools.md`
   - Expose task creation, manual trigger, one-time scheduling, list/read, and status checks via a separate chat-oriented Tasks Management MCP
   - Ensure MCP tools call the same task services as REST/UI

7. **I4.7 Task Run Variable Context** — `development/integrations-automation/04-tasks-sub-epics/07-task-run-variable-context.md`
   - Move context from task definitions to task runs
   - Allow REST, UI, scheduler, and the existing `trigger_task` MCP tool to pass optional context at trigger time

8. **I4.8 TickTick-Style Recurring Tasks** — `development/integrations-automation/04-tasks-sub-epics/08-ticktick-style-recurring-tasks.md`
   - Replace user-facing cron recurrence with structured repeat rules
   - Schedule one concrete run at a time and calculate the next run after completion

9. **I4.9 Board-Oriented Task System Redesign** — `development/integrations-automation/04-tasks-sub-epics/09-board-oriented-task-system-redesign.md`
   - Separate recurring task templates from normal board tasks
   - Replace task trigger modes with board statuses, queueing, scheduled queueing, comments, subtasks, and task-run context snapshots
   - Keep UI behavior in the parent epic while this sub-epic focuses on schemas, services, lifecycle rules, and prompt context composition
