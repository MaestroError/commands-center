# I4.9 UI Epic: Level 3 Board Cards

## Goal

Define task cards as compact decision surfaces that show enough status, assignment, schedule, feedback, and progress context for the operator to decide what to do next without opening every task.

## Scope

- Card content hierarchy.
- Card badges and status signals.
- Card actions by task state.
- Visual differences between user-created tasks and generated recurring tasks.
- Card behavior for active runs, review work, and ready-to-check work.

## Card Content

- Title.
- Short description preview.
- Current board status.
- Default or assigned agent.
- Schedule or due badge when present.
- Latest run state when active or recently completed.
- Latest result preview when ready to check or in review.
- Open feedback count.
- Comment count.
- Subtask progress, such as 2 of 5 done.
- Source template badge for generated recurring tasks.
- Last updated timestamp.

## Card Actions

- Backlog: Queue, Schedule, Edit, Archive.
- Scheduled: Queue Now, Reschedule, Clear Schedule, Edit.
- Queued: View Run, Cancel Run.
- Ready to Check: Accept, Ask for Changes, Open Run.
- Review: Add Feedback, Retry, Move to Backlog, Open Run.
- Done: Reopen, Archive.
- Archived view: Restore, Open Detail.

## Visual Priority

- Ready to Check cards should emphasize the latest result summary.
- Review cards should emphasize the reason attention is needed.
- Queued cards should emphasize live execution state and prevent accidental duplicate queueing.
- Scheduled cards should emphasize when the task will run and whether it is overdue.
- Generated recurring tasks should look like normal board tasks but carry clear source-template context.

## Card Interaction

- Clicking the card opens task detail.
- Primary action buttons should be available without opening detail for common actions.
- Secondary actions should be available through a compact card menu.
- Long titles and descriptions should truncate cleanly without hiding core state.
- Cards should be usable on narrow mobile layouts without relying on hover.

## Acceptance Criteria

- The user can decide whether to queue, review, accept, retry, or reschedule from card information.
- Active queued/running tasks cannot be accidentally queued again from the card.
- Generated recurring tasks are clearly attributable to their source template.
- Cards remain readable on both desktop board columns and mobile stacked layouts.
