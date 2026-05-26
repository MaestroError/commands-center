# I4.9 UI Epic: Subtasks

## Goal

Define subtasks as lightweight work breakdown inside a parent task, with enough status and run visibility to target focused execution without turning subtasks into independent board cards.

## Scope

- Subtask list inside task detail.
- Subtask statuses and controls.
- Running AI against a specific subtask.
- Relationship between subtask status and parent task status.

## Subtask Display

- Title.
- Short description when provided.
- Status.
- Optional default agent.
- Latest run state.
- Latest result or review note.
- Done toggle or status control.
- Run Subtask action.

## Subtask Statuses

- Backlog: not started.
- Queued: has active queued or running work.
- Ready to Check: latest subtask run completed successfully and needs review.
- Review: latest subtask run failed or requested human review.
- Done: accepted by the user.

## Run Subtask Flow

- Run Subtask should make the target subtask explicit before queueing.
- The parent task should remain the board card.
- The run result should appear in parent task run history and subtask history.
- The user should be able to retry a subtask after adding feedback.

## Parent Relationship

- Subtasks should not appear as independent board cards by default.
- Parent task card should show subtask progress.
- Parent task detail should make subtask results part of overall task context.
- Completing all subtasks should not automatically accept the parent task unless the product later decides otherwise.

## Acceptance Criteria

- The user can break a task into smaller work items without leaving task detail.
- The user can queue AI work for one subtask and inspect that run separately.
- Subtask progress is visible on the parent card.
- Subtasks do not create a second competing board model.
