# Task Operations Migration Record (DS-0405)

- Task: [DS-0405](../05-task-operations.md)
- Shared helper owner: DS-0405 consumed the DS-0404 authoring decision before closing `task-helpers.ts`.

## Status map and deltas

- Raw palette occurrences: **38 → 0** in `task-helpers.ts`, `TaskBoard.tsx`, and `TaskDetailPage.tsx`; DS-0404 owns the three shared `task-ui.tsx` occurrences.
- Ready-to-check remains accent; review/running uses warning; completed/done uses success; failed uses danger; queued remains accent; inactive/default stays neutral.
- Card emphasis, icon actions, subtask dots, and result boxes now derive from those semantic roles in both resolved modes.
- Drag/drop, queue/cancel/retry, selection, polling/events, artifacts, routing, and task data code were not changed.

Verification is owned by task helper/UI tests and `e2e/tasks/board.spec.ts`, `runs.spec.ts`, and `feedback.spec.ts`.
