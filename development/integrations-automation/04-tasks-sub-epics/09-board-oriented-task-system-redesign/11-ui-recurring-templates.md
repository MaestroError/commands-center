# I4.9 UI Epic: Recurring Templates

## Goal

Define recurring templates as a separate configuration surface for generating normal board tasks, not as board cards themselves.

## Scope

- Templates list.
- Template detail.
- Template creation and editing experience.
- Run Now behavior.
- Generated task history.

## Templates List

- Title.
- Default agent.
- Recurrence summary.
- Next occurrence.
- Enabled or disabled status.
- Latest generated task.
- Last generated occurrence.
- Run Now action.

## Template Detail

- Template title and description.
- Default agent.
- Recurrence rule summary.
- Next occurrence and previous occurrence.
- Generated tasks list.
- Latest generated task status.
- Actions for Run Now, Edit Schedule, Disable, Archive, and View Generated Tasks.

## Run Now Flow

- Run Now should create a normal generated task and queue that task.
- The user should see the generated task after Run Now completes.
- The generated task should appear on the normal board with source template context.
- Run Now should not change the template’s future recurrence schedule.

## Generated Tasks

- Generated tasks should be normal board tasks.
- Generated tasks should show source template name and occurrence time.
- Editing a generated task should not imply editing the template.
- Template detail should make it easy to inspect generated task history.

## Acceptance Criteria

- The user can clearly distinguish recurring templates from generated task cards.
- The user can run a template immediately and find the generated task afterward.
- The user can understand when the template will generate the next task.
- The user can inspect generated task history without cluttering the board.
