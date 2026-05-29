# I4.9 UI Epic: Feedback Subtasks and Context

## Goal

Make task feedback actionable. User feedback should render as separate Jira-like feedback threads, create one or more simple agent-assigned subtasks, and show subtask run results as replies under the feedback that created them.

This sub-epic replaces the old passive task comments model. Comments are not preserved as a separate concept.

## Product Model

- A feedback item is user text attached to a parent task.
- A feedback item creates child subtasks for target agents.
- A subtask is simple: parent task, optional feedback id, assignee agent, and description.
- Subtasks are not independent board cards.
- The parent task remains the only board card.
- Subtask status is derived from task runs for that subtask, not stored as an independent persisted status field.
- Feedback-created subtasks run as task runs with `subtaskId` set.
- A subtask run uses the subtask assignee as the run agent.

## Current State

- Shared schemas define feedback threads, feedback creation input, and simplified subtasks.
- Backend stores feedback in `task_feedback` and simplified subtasks in `task_subtasks`.
- Current comments routes, shared comment schemas, and the `add_task_comment` MCP tool have been removed from active code.
- `GET /api/tasks/:id/feedback` lists feedback threads with generated subtasks.
- `POST /api/tasks/:id/feedback` creates one feedback row and one subtask per target agent.
- If no target agent is provided, feedback creates one subtask for `task.defaultAgentId ?? task.agentId`.
- If one target agent is provided, feedback creates one subtask assigned to that agent.
- If multiple target agents are provided, feedback creates one separate subtask per agent.
- Feedback creation does not change the parent task status.
- Parent-task queueing chooses the next pending subtask and queues a subtask-scoped run.
- Completed successful subtask runs automatically queue the next pending subtask.
- Failed or needs-review subtask runs stop the automatic subtask chain.
- Task run context includes the selected subtask and feedback-derived subtask description.
- Task run detail exposes rendered prompt and structured rendered context.
- Frontend task detail and board side panel include a feedback composer.
- Frontend task detail and board side panel list feedback threads and subtasks.
- Frontend subtask status display is inferred from the latest run for that subtask.
- Context tab supports persistent task context preview/editing and context attachment links.
- Migration `0015_feedback_subtasks.sql` drops `task_comments`, creates `task_feedback`, and recreates simplified `task_subtasks`.

## Remaining Scope

### Feedback Composer

- Replace the basic textarea and multi-select with the same prompt-style input affordances used by task creation/editing.
- Support inline agent mentions rather than only a separate multi-select.
- Preserve the exact feedback body as submitted text.
- Show target agents before submission so the user can confirm which subtasks will be created.
- Keep no-target submission behavior: create one subtask for `task.defaultAgentId ?? task.agentId`.

### Feedback Threads

- Render feedback as chronological Jira-like threads grouped by original feedback item.
- Show original user feedback, target agent chips, timestamps, and generated subtask summaries.
- Show subtask run replies under the originating feedback item.
- Keep separate feedback submissions as separate threads.
- Keep completed feedback threads visible after all generated subtasks finish.

### Subtask Replies

- For each subtask run, render a reply under the feedback thread that created the subtask.
- Each reply should show responding agent, run status, derived subtask state, timestamp, and final summary or error.
- Failed and needs-review replies should have clear review/failure styling.
- Retrying a subtask should append another reply under the same feedback thread, preserving prior attempts.
- Multiple target agents should produce multiple replies under the same feedback item.

### Subtask Actions

- Add explicit Run Subtask and Retry Subtask actions from both the feedback thread and subtask section.
- Running a subtask should queue a task run with that `subtaskId` and assigned agent.
- The parent task should remain the board card while the subtask run is active.
- The user should be able to inspect the run/session from a subtask reply.
- The user should be able to open the run-owned conversation from a subtask reply when available.

### Board Progress

- Parent task cards should show aggregate subtask progress.
- Progress should be derived from subtask runs.
- The board should not render subtasks as cards.

### Context Preview

- Add Queue With Options context preview before queueing a task or specific subtask.
- The preview should include trusted task content: title, description, todos, schedule, persistent task context, and attachments metadata.
- The preview should include untrusted context separately: selected feedback, selected subtask, prior run summaries, previous artifacts, trigger notes, and metadata.
- Quick Queue can keep current default behavior without preview.

### Past Run Context

- Keep each run's rendered prompt and structured context read-only.
- Make rendered prompt and structured context collapsible by default.
- The run detail page should answer: what task definition, feedback, history, and attachments did the AI see for this run?

## Implementation Plan

1. Feedback composer upgrade.
   - Reuse the task prompt composer patterns for text input and mention chips.
   - Add agent mention parsing/selection that produces `mentionedAgentIds`.
   - Render a target-agent preview before submit.
   - Add frontend tests for no target, one target, and multiple targets.

2. Feedback thread response shape.
   - Extend backend feedback listing to include subtask run attempts grouped by subtask.
   - Keep the current feedback and subtask tables; do not add persisted subtask status.
   - Add shared schemas for feedback thread replies if the UI needs a typed response beyond existing runs.

3. Reply rendering.
   - Render generated subtask summaries under each feedback thread.
   - Render every run attempt for each generated subtask as a reply.
   - Add inspect/open-in-chat links using existing task run routes.
   - Add frontend tests for successful, failed, needs-review, and retry replies.

4. Subtask queue actions.
   - Expose a frontend mutation that calls `POST /api/tasks/:id/queue` with `subtaskId`.
   - Add Run Subtask and Retry Subtask buttons where no active run blocks the action.
   - Ensure the UI clearly shows assigned agent before queueing.
   - Add backend tests that direct subtask queueing uses the subtask assignee.

5. Board aggregate progress.
   - Decide whether task lists should include compact subtask progress or whether the board should fetch progress separately.
   - Prefer a small derived progress endpoint/query over inflating the base task contract if the board only needs counts.
   - Display completed/total and active/review indicators on parent task cards.

6. Context preview.
   - Add a backend preview method that builds rendered context without creating a task run.
   - Add a Queue With Options UI that can select a subtask, inspect the preview, then queue.
   - Separate trusted task content from untrusted feedback/history in the preview UI.

7. Past context UI polish.
   - Make rendered prompt and rendered context collapsible by default in run detail.
   - Keep the content read-only and copyable.
   - Add tests that historical run context does not change after current task edits.

## Acceptance Criteria

- Submitting feedback with no target creates one subtask assigned to `task.defaultAgentId ?? task.agentId`.
- Submitting feedback with one agent target creates one subtask assigned to that agent.
- Submitting feedback with multiple agent targets creates one separate subtask per target agent.
- Feedback submissions render as separate chronological threads.
- Each feedback thread shows target agents and generated subtasks.
- Subtask run results render as replies under the feedback thread that created the subtask.
- Multiple target agents produce multiple reply streams under the same feedback thread.
- Retrying a subtask appends a new reply without removing previous replies.
- The user can run, retry, and inspect feedback-created subtasks without creating independent board cards.
- Parent task cards show aggregate subtask progress.
- The user can preview upcoming run context before Queue With Options.
- The user can inspect historical run context without current task edits changing it.

## Out Of Scope

- Backward compatibility for old task comments.
- Independent subtask board cards.
- Persisted subtask status fields separate from task runs.
- E2E coverage before the board and feedback UI stabilize.
