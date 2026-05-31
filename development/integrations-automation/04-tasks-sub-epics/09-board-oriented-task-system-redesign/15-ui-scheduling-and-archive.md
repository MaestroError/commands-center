# I4.9 ✅ UI Epic: Scheduling and Archive

## Goal

Define scheduling and archived history surfaces so time-based work is easy to understand and completed work stays accessible without cluttering the active board.

## Scope

- Normal task scheduling.
- Due date presentation.
- Scheduled board behavior.
- Archive view.
- Restore flow.

## Scheduling Normal Tasks

- Schedule should answer when the task should enter the queue.
- Due date should answer when the task should ideally be completed or reviewed.
- Scheduling should be available from task card and task detail.
- Rescheduling should be explicit and easy from Scheduled state.
- Clearing schedule should return the task to Backlog unless another status is more appropriate.

## Scheduled Board Presentation

- Scheduled cards should show scheduled date/time prominently.
- Due date should appear when different from scheduled date/time.
- Overdue tasks should be visibly distinct.
- Queue Now should be available for scheduled tasks.
- Scheduled tasks should not look like recurring templates.

## Archive View

- Archived tasks should be outside the active board.
- Archive should support finding past work by title, agent, status, source template, date range, and artifact presence.
- Archived task detail should remain inspectable.
- Restoring should move the task back to an active state that the user can continue from.

## Done Retention Awareness

- Done tasks should remain visible on the board until archival retention moves them out.
- The UI should make it clear that Done is accepted work, not deleted work.
- Archive should make auto-archived done tasks easy to recognize.

## Acceptance Criteria

- The user can schedule, reschedule, clear, and queue a scheduled task without understanding recurrence internals.
- The user can distinguish scheduled normal tasks from recurring templates.
- Done and archived states have clear meanings.
- The user can restore archived work when needed.
