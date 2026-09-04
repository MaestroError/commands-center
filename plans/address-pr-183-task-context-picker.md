# Address PR 183 Task Context Picker

## Goal

Keep the persistent task-context attachment picker aligned with the shared storage extension contract.

## Changes

1. Add a focused `TasksPage` regression assertion for the persistent context picker's `accept` attribute.
2. Replace the hard-coded extension list in `TaskDetailSections.tsx` with `TASK_CONTEXT_ATTACHMENT_EXTENSIONS.join(",")`.
3. Run the focused frontend test, lint, typecheck, formatting, and diff checks before committing and pushing.

## Constraints

- Do not alter attachment storage behavior or the shared extension list.
- Do not address unrelated code or feedback.
