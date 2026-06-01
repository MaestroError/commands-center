# ✅ I4.9 Phase 5: Scheduler, Templates, and Archival

## Goal

Update scheduling around board tasks and recurring templates. One-time scheduled tasks enter the queue at their scheduled time, recurring templates generate normal tasks, and done tasks auto-archive after the configured retention window.

## Blockers

- Phase 1: Contracts and DB Model.
- Phase 2: Data Reset and Schema Cutover.
- Phase 3: Backend Queue Lifecycle.
- Phase 4: Task Run Context Builder.

## Unblocks

- Phase 6: REST API and MCP Surface.
- Phase 7: Frontend Integration.

## Scope

- Scheduler finds due normal tasks with scheduled status and scheduled date/time.
- Scheduler queues due normal tasks through `queueTask`.
- Scheduler finds due recurring templates.
- Recurring templates generate normal tasks with source template metadata.
- Recurring generation is idempotent per source template and occurrence timestamp.
- Template Run Now creates a normal task and queues it immediately.
- Rescheduling a generated task does not mutate the template's recurrence schedule.
- Done tasks auto-archive after the configured setting.

## Scheduler Contracts

- `task_scheduler_state` may track normal scheduled task IDs and recurring template IDs, or separate state tables may be introduced if clearer.
- Generated tasks store `sourceTemplateId` and `sourceOccurrenceAt`.
- Generated tasks have normal board status and can be rescheduled independently.
- Template recurrence state advances independently from generated task edits.

## Settings Contract

- `taskDoneAutoArchiveWeeks`: number, default 1.

## Backend Files

- `packages/backend/src/services/task-scheduler-service.ts`
- `packages/backend/src/services/task-service.ts`
- `packages/backend/src/services/settings-service.ts` if introduced.
- `packages/backend/src/db/helpers.ts` if settings helper reuse is enough.
- `packages/backend/src/db/schema/tasks.ts`
- `packages/backend/src/db/schema/settings.ts`

## Verification

- Scheduler tests cover one-time scheduled task queueing.
- Scheduler tests cover recurring template generation.
- Scheduler tests cover idempotent duplicate ticks.
- Scheduler tests cover Run Now on template.
- Scheduler tests cover generated task reschedule independence.
- Scheduler tests cover done auto-archive.
