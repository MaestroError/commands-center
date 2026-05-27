# ✅ I4.9 UI Epic: Task Templates

## Goal

Define task templates as a separate configuration surface for reusable task setup. A template can be manual-only, can create a normal task on demand, can run immediately by creating and queueing a normal task, and can optionally repeat on a schedule.

## Scope

- Templates list.
- Template detail.
- Template creation and editing experience.
- Run Now behavior.
- Generated task history.

## Templates List

- Title.
- Default agent.
- Repeat summary, showing manual-only templates clearly.
- Next occurrence when repeating is enabled.
- Enabled or disabled status.
- Latest generated task.
- Last generated occurrence.
- Create Task action.
- Run Now action.

## Template Detail

- Template title and description.
- Default agent.
- Repeat rule summary when repetition is enabled.
- Next occurrence and previous occurrence when repetition is enabled.
- Generated tasks list.
- Latest generated task status.
- Actions for Run Now, Edit Schedule, Disable, Archive, and View Generated Tasks.

## Create Task Flow

- Create Task should create a normal generated task without queueing it.
- The user should see the generated task after creation.
- The generated task should appear on the normal board with source template context.

## Run Now Flow

- Run Now should create a normal generated task and queue that task.
- The user should see the generated task after Run Now completes.
- The generated task should appear on the normal board with source template context.
- Run Now should not require repetition to be enabled.
- Run Now should not change the template’s future recurrence schedule when repetition is enabled.

## Generated Tasks

- Generated tasks should be normal board tasks.
- Generated tasks should show source template name and occurrence time.
- Editing a generated task should not imply editing the template.
- Template detail should make it easy to inspect generated task history.

## Acceptance Criteria

- The user can clearly distinguish templates from generated task cards.
- The user can create manual-only templates without enabling repetition.
- The user can create a normal board task from a template without queueing it.
- The user can run a template immediately and find the generated task afterward.
- The user can understand whether the template is manual-only or will generate the next task on a schedule.
- The user can inspect generated task history without cluttering the board.

## Implementation Summary

- Added template detail, generated-task history, and create-task-from-template API routes.
- Added frontend template create, create task, detail, generated history, and Run Now API helpers and query hooks.
- Replaced the placeholder Templates tab with template cards, inline creation, optional repetition, detail panel, generated task history, Create Task, and Run Now navigation to the generated board task.
- Added frontend API and Tasks page coverage for manual-only template creation, create-task-from-template, detail/history loading, and Run Now behavior.
