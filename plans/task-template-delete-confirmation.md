# Task Template Delete Confirmation

## Goal

Add the same delete confirmation behavior used elsewhere before removing task templates.

## Todo

- [x] Inspect the task templates delete flow and confirm which confirmation approach the frontend already uses for destructive actions.
- [x] Add a shared confirmation guard for task template deletion so both template list and detail panel delete buttons use it.
- [x] Update task page tests to cover confirmed deletion and canceled deletion for task templates.
- [x] Attempt to run `eslint --fix` and the relevant task page tests.

## Verify

- Clicking `Delete template` asks for confirmation before the delete request is sent.
- Canceling the confirmation leaves the template untouched and sends no delete request.
- Run `pnpm eslint --fix`.
- Run the relevant task page tests.

## Verification Notes

- `pnpm --filter @cc/frontend lint -- --fix src/pages/TasksPage.tsx src/pages/TasksPage.test.tsx` failed because `eslint` is unavailable in this checkout (`node_modules` is missing).
- `pnpm --filter @cc/frontend test -- src/pages/TasksPage.test.tsx` failed because `vitest` is unavailable in this checkout (`node_modules` is missing).
