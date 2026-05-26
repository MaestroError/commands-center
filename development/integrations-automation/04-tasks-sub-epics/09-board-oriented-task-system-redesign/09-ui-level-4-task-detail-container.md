# I4.9 UI Epic: Level 4 Task Detail Container

## Goal

Define the task detail surface as the operator’s primary place to understand, review, modify, and continue work on a task.

## Scope

- Desktop and mobile detail presentation.
- Header hierarchy and persistent actions.
- Detail navigation from board, templates, archive, and run links.
- State-specific task actions.
- Relationship between detail view and the board behind it.

## Presentation Model

- Desktop should open task detail as a panel or modal while preserving the board context behind it.
- Mobile should present task detail as a full page.
- Deep links should open task detail directly.
- Closing detail should return the user to the previous Tasks view when available.
- Detail should support direct links to a specific run or generated template source.

## Header

- Task title.
- Board status.
- Default agent.
- Source template badge when generated from a recurring template.
- Schedule and due date summary when present.
- Primary action based on current status.
- Secondary actions menu for edit, archive, restore, reopen, and copy link.

## State-Based Primary Actions

- Backlog: Queue.
- Scheduled: Queue Now or Reschedule.
- Queued: View Active Run.
- Ready to Check: Accept.
- Review: Add Feedback and Retry.
- Done: Archive.
- Archived: Restore.

## Detail Layout

- Main content should prioritize the current decision needed from the user.
- Supporting context should be visible but not overwhelm the current task state.
- On desktop, metadata and quick actions can sit in a side rail.
- On mobile, actions should remain reachable through a sticky bottom action area or compact top action menu.

## Acceptance Criteria

- The user always knows what state the task is in and what the next recommended action is.
- Opening task detail never loses the board position or selected view.
- Task detail works as both a modal-style workflow and a directly loaded page.
- The task detail header remains useful for backlog, scheduled, queued, review, ready-to-check, done, and archived tasks.
