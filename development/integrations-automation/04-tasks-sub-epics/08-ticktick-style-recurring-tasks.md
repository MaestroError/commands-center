# I4.8 TickTick-Style Recurring Tasks

## Goal

Replace user-facing cron recurrence with a TickTick-style repeat model: store a simple recurrence rule, schedule one concrete future run, and create the next scheduled run only after the previous scheduled run finishes.

## Pre-Conditions

- I4.1 Task Data Model and Service API is complete enough to change schedule contracts.
- I4.2 Scheduler and Execution Lifecycle is complete enough to enqueue and execute concrete scheduled runs.
- I4.5 Tasks UI is complete enough to add the repeat picker UX.

## Scope

### Recurrence Contract

- Replace `cronExpression` in user-facing recurring task schemas with a recurrence rule object.
- Support presets: daily, weekly, monthly, yearly, and every weekday.
- Support custom repeat: every `N` days, weeks, months, or years.
- For weekly custom repeat, support selecting one or more weekdays.
- Store timezone and an anchor datetime so future occurrences are calculated deterministically.

### Scheduling Model

- Persist recurrence rules on the task or a task recurrence record.
- Persist concrete scheduled runs as `task_runs` with `status: "queued"` or a dedicated scheduled state if introduced by this refactor.
- Keep only the next concrete scheduled run active for each recurring task.
- After a scheduled run reaches a terminal state, calculate the next occurrence from the previous scheduled time, not from completion time.
- If the app was offline, run at most the latest due occurrence once and then schedule the next future occurrence.

### UI

- Replace cron inputs with a repeat picker inspired by TickTick.
- Show simple options first: Daily, Weekly, Monthly, Yearly, Every Weekday, Custom.
- In Custom, let the user choose interval, unit, and unit-specific details like weekdays.
- Display a human-readable summary, such as `Every 1 week on Tue, Thu`.

### Services and Tests

- Add a small next-occurrence calculator with focused unit tests.
- Update scheduler service to create the next concrete run after completion.
- Ensure disabled or archived recurring tasks do not create future runs.
- Ensure deleting or archiving a recurring task cancels or ignores its pending concrete run.

## Out of Scope

- Arbitrary cron syntax.
- Complex exceptions like skipped dates, holiday calendars, or per-run overrides.
- Backfilling every missed occurrence after long downtime.
- Natural-language repeat parsing.

## Acceptance Criteria

- Users can configure daily, weekly, monthly, yearly, every-weekday, and basic custom repeat schedules without seeing cron syntax.
- The backend stores recurrence as structured data, not a raw cron expression.
- A recurring task has only one next concrete scheduled run at a time.
- Completing, failing, cancelling, or skipping a scheduled recurring run schedules the next future run when the task is still enabled.
- Next occurrence calculation is deterministic by timezone and anchor datetime.
- Tests cover daily, weekly weekday selection, every weekday, monthly day-of-month, disabled task behavior, and offline overdue behavior.

## Key Files to Modify

- `packages/shared/src/schemas/tasks.ts`
- `packages/backend/src/db/schema/tasks.ts`
- `packages/backend/src/db/migrations/`
- `packages/backend/src/services/task-scheduler-service.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/test/services/task-scheduler-service.test.ts`
- `packages/frontend/src/pages/TasksPage.tsx`
- `packages/frontend/src/pages/TaskDetailPage.tsx`
- `packages/frontend/src/components/tasks/` if the repeat picker is extracted
