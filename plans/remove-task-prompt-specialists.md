# Remove specialist mentions from task prompts plan

## Scope

Remove specialist mention affordances from task prompt composers while preserving the working specialist delegation flow in task feedback, where mentions assign follow-up subtasks.

## Audit findings

- Task create/edit uses `TaskPromptComposer` without specialist data.
- Task-template create/edit uses `TaskPromptComposer` without specialist data.
- Task detail prompt editing uses `TaskPromptComposer` without specialist data.
- Task feedback uses `TaskPromptComposer` with specialists; the selected specialist IDs are submitted as subtask assignees.
- Chat uses a separate `ChatComposer` with files and skills but no specialist mention support.
- Task-run replies use a plain textarea with no mention support.

## Assumptions

- The task feedback composer should keep specialist mentions because that flow is implemented and documented as subtask delegation.
- “Task prompt” includes task creation, task editing, task-template creation/editing, and task detail prompt editing.
- Removing specialist mentions includes the shortcut pill, placeholder guidance, `@` popover trigger, and specialist chips on non-feedback task prompt surfaces.

## Implementation tasks

- [x] Add regression coverage proving specialist mentions are disabled by default while explicit feedback mode retains them.
- [x] Make specialist mentions an explicit opt-in capability of `TaskPromptComposer`.
- [x] Enable that capability only in task feedback and leave all task/task-template prompt surfaces opted out.
- [x] Run ESLint with fixes, focused tests, typecheck, the full suite, and task E2E coverage.

## Acceptance criteria

- Task and task-template prompts show only file and skill shortcuts/guidance.
- Typing `@` in a task prompt does not open a specialist picker.
- Task feedback still supports selecting a specialist for delegated subtasks.
- Chat and task-run reply behavior remain unchanged.
- No API or persistence changes are introduced.

## Constraints

- Preserve unrelated uncommitted UI fixes.
- Do not add dependencies.
- Do not commit.
