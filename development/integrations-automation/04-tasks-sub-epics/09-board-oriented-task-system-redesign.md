# I4.9 Board-Oriented Task System Redesign

## Goal

Redesign the Tasks system around Jira-like board work items and AI execution attempts. After this sub-epic, recurring schedules are represented only as task templates/generators, normal tasks are board cards, queueing is the shared execution trigger, and task runs are immutable execution attempts that feed task status and future task context.

## Pre-Conditions

- I4 parent epic has accepted board-oriented task management as the target product direction.
- Existing task, task run, scheduler, and OpenCode session services are available to migrate or replace.
- Agent assignment and task-run session creation are already supported or planned by earlier I4 sub-epics.

## Scope

### Core Concepts

- Keep `TaskTemplate` only for recurring task generation.
- Treat `Task` as the Jira-like board item that represents user-visible work.
- Treat `TaskRun` as one AI execution attempt against a task or one of its subtasks.
- Remove task identity concepts such as manual, one-time scheduled, and recurring trigger modes from normal tasks.
- Model manual trigger, scheduled trigger, API trigger, and template generation as ways a task enters the queue, not as task types.

### Task Board State

- Define task board statuses: backlog, scheduled, queued, ready_to_check, review, done, and archived.
- Do not introduce an in-progress board column.
- Derive running UI state from active task runs while the task remains in queued.
- Move tasks to ready_to_check when a run completes successfully.
- Move tasks to review when a run fails or the agent marks the run as needing human review.
- Move tasks to done only through explicit user acceptance.
- Move done tasks to archived automatically after the configured retention period.

### Queueing and Execution Lifecycle

- Add a single queue service path used by manual actions, scheduled dates, API triggers, and generated template tasks.
- Queueing a task should set task status to queued, create a new task run, snapshot task context, and start execution without a separate confirmation step.
- Prevent duplicate active runs for the same task or same subtask unless a future explicit force-run behavior is added.
- Allow retries by queueing the same task again after user feedback.
- Preserve every retry as a separate task run/session on the same task.

### Scheduling

- Represent one-time scheduled work as a normal task with scheduled status and scheduled date/time.
- When the scheduled date/time arrives, move the task into the shared queueing path.
- Do not create a task template for one-time scheduled work.
- Keep scheduler state portable inside the workspace database.

### Recurring Templates

- Represent recurring work as task templates that generate normal tasks.
- When a template occurrence is due, create a normal task with a source template ID and source occurrence timestamp.
- Queue the generated task immediately when the template configuration says the occurrence should execute at generation time.
- Support Run Now on a task template by creating a new normal task and immediately queueing it.
- Ensure rescheduling or editing one generated task does not change the recurring template's future schedule.
- Enforce idempotency for generated occurrences with a uniqueness rule over source template ID and source occurrence timestamp.

### Assignment

- Store the task's default or current assignee as `Task.defaultAgentId`.
- Store the actual executing agent on each `TaskRun.agentId`.
- Use the task default agent when queueing unless the user selects another agent for that run.
- Preserve historical run agent IDs when the task is reassigned later.

### Comments and Feedback

- Add task comments as first-class task context.
- Treat new feedback comments as open/unhandled until they are included in a later run or resolved by the user.
- Include open/unhandled comments in the next run's context as the run's actionable feedback.
- Preserve comments separately from task runs so the UI can show a unified timeline without losing edit and run history.

### Subtasks

- Add simple subtasks under a parent task with title, description, optional default agent, and lightweight status.
- Do not model subtasks as independent board cards by default.
- Allow a task run to target either the whole task or one subtask.
- Include subtask run results, artifacts, and review notes in the parent task context.
- Build subtask run prompts around the target subtask while still providing parent task context.

### Task Run Context Snapshots

- Build every task run prompt from the current task description, target subtask when present, open feedback comments, previous run results, previous review/failure notes, and previous artifacts.
- Include artifact full paths or URLs in the context snapshot.
- Persist the rendered prompt and structured context snapshot on the task run.
- Keep snapshots immutable so later task edits do not change what a past run saw.
- Let the UI present task data, comments, subtasks, runs, results, and artifacts as a unified task timeline while backend storage remains normalized.

### Done Retention and Archival

- Add a workspace setting for done-task auto-archive retention in weeks.
- Default the retention period to one week.
- Store when a task enters done.
- Add a scheduler job that archives done tasks after the configured retention window.
- Keep archived tasks off the board and accessible through an archive list.

## Implementation Phases

Implement this sub-epic in phases. Existing task, task run, task template, and task scheduler data does not need to be preserved during this redesign. E2E tests are intentionally out of scope until the board UI stabilizes.

1. ✅ **Phase 0: Transition Spec** — `09-board-oriented-task-system-redesign/00-transition-spec.md`
2. ✅ **Phase 1: Contracts and DB Model** — `09-board-oriented-task-system-redesign/01-contracts-and-db-model.md`
3. ✅ **Phase 2: Data Reset and Schema Cutover** — `09-board-oriented-task-system-redesign/02-data-reset-and-schema-cutover.md`
4. ✅ **Phase 3: Backend Queue Lifecycle** — `09-board-oriented-task-system-redesign/03-backend-queue-lifecycle.md`
5. ✅ **Phase 4: Task Run Context Builder** — `09-board-oriented-task-system-redesign/04-task-run-context-builder.md`
6. ✅ **Phase 5: Scheduler, Templates, and Archival** — `09-board-oriented-task-system-redesign/05-scheduler-templates-and-archival.md`
7. ✅ **Phase 6: REST API and MCP Surface** — `09-board-oriented-task-system-redesign/06-rest-api-and-mcp-surface.md`
8. **Phase 7: Frontend Integration** — `09-board-oriented-task-system-redesign/07-frontend-integration.md`

## Out of Scope

- Board layout, drag-and-drop interactions, columns, filters, cards, and archive screen UI details; those remain in the parent epic's UX story and future screen requirements.
- Multi-user assignment or permissions.
- External distributed workers.
- Full API-triggered task creation beyond reserving trigger source semantics for future use.
- Group chat orchestration.

## Acceptance Criteria

- Normal tasks no longer require manual, scheduled_once, or recurring trigger mode fields to define their identity.
- One-time scheduled tasks are normal tasks that enter queued through the scheduler.
- Recurring templates generate normal tasks and never receive task runs directly.
- Run Now on a normal task queues the existing task and creates a new run for that task.
- Run Now on a recurring template creates a normal task and queues that task.
- Successful runs move the task to ready_to_check, not done.
- Failed runs and needs-human-review outcomes move the task to review.
- Re-queueing a task after feedback creates a new task run on the same task and includes previous run context.
- Task runs store the actual executing agent independently from the task's default agent.
- Subtask runs are recorded under the parent task and included in parent task context.
- Done tasks auto-archive after the configured retention period.
- All new task, template, schedule, comment, subtask, run, context snapshot, and archive state remains portable inside `.cc/workspace`.

## Key Files to Create/Modify

- `packages/shared/src/schemas/` - task, template, comment, subtask, queueing, and run context schemas
- `packages/backend/src/db/schema/` - task, template, comment, subtask, run, scheduler, and settings tables
- `packages/backend/src/db/migrations/` - generated migrations and migration metadata
- `packages/backend/src/services/task-service.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/services/task-scheduler-service.ts`
- `packages/backend/src/services/settings-service.ts`
- `packages/backend/src/routes/tasks.ts`
- `packages/backend/test/services/` - service tests for queueing, scheduling, templates, retries, comments, subtasks, and archival
- `packages/backend/test/routes/` - route contract tests for new lifecycle APIs

## Reference

- Parent epic: `development/integrations-automation/04-automations.md`
- Existing data model sub-epic: `development/integrations-automation/04-tasks-sub-epics/01-task-data-model-and-service-api.md`
- Existing scheduler lifecycle sub-epic: `development/integrations-automation/04-tasks-sub-epics/02-scheduler-and-execution-lifecycle.md`
- Existing recurring schedule sub-epic: `development/integrations-automation/04-tasks-sub-epics/08-ticktick-style-recurring-tasks.md`
