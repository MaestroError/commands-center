# ✅ I4.9 UI Sub-Epic: Level 1-2 Navigation and Board

## Goal

Define the top-level Tasks navigation and board layout so the operator has one clear place for daily task work and a separate place for recurring template configuration and archived history.

## Scope

- Provide primary views for Board, Templates, and Archive.
- Make Board the default Tasks view.
- Keep recurring templates out of the normal task board.
- Keep archived tasks out of the normal task board.
- Present board columns that match the task lifecycle language used by the product.
- Define what each board column means to the operator.

## Navigation Model

- Board: day-to-day work surface for active task cards.
- Templates: recurring task generators and their latest generated tasks.
- Archive: searchable history of archived tasks.
- Task detail should open from any view without losing the user’s place.
- Returning from detail should preserve the last selected Tasks view and filters.

## Board Columns

- Backlog: tasks that exist but are not scheduled, queued, ready for acceptance, under review, or done.
- Scheduled: tasks that should enter execution later or have a due date that affects prioritization.
- Queued: tasks with active queued or running work.
- Ready to Check: tasks where AI work finished successfully and the user should review the result.
- Review: tasks that failed, need human decision-making, or need extra feedback before retry.
- Done: tasks explicitly accepted by the user.

## Board Behavior

- The board should prioritize action over density.
- Queued tasks should visually communicate active work without adding an in-progress column.
- Dragging a task into Scheduled should ask for schedule details.
- Dragging a task into Queued should mean queue/run the task, not just change a label.
- Dragging a task into Done should be treated as explicit acceptance.
- Dragging a queued/running task away from Queued should be restricted until the active run finishes or is cancelled.

## Empty States

- Empty Board: explain that tasks become board cards and offer Create Task.
- Empty Scheduled column: explain that scheduled tasks will queue automatically.
- Empty Ready to Check column: explain that completed AI runs appear here for acceptance.
- Empty Review column: explain that failures and human-review requests appear here.
- Empty Templates view: explain recurring generators and offer Create Template.
- Empty Archive view: explain that completed or archived work appears here later.

## Acceptance Criteria

- The user can understand the task lifecycle from the board columns alone.
- The user can distinguish normal tasks, recurring templates, and archived tasks.
- The board never shows recurring templates as normal task cards.
- The board never requires the user to understand internal task trigger terminology.
- The user can move from Board to task detail and back without losing board context.
