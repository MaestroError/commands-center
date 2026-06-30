# Task Template Delete E2E Deadlock Fix

## Goal

Fix the task template delete E2E test so the confirmation dialog is handled without blocking the click action.

## Todo

- [x] Inspect the failing E2E test flow and confirm where the dialog handling deadlocks.
- [x] Update the test to accept the dialog concurrently with the click while keeping the dialog assertions.
- [x] Attempt local verification if the checkout has Playwright available.
- [ ] Commit and push the fix to the current PR branch.

## Verify

- The delete-template E2E test accepts the confirmation dialog during the click flow instead of after it.
- Run the focused Playwright task test if local dependencies are available.

## Verification Notes

- `pnpm --filter @cc/frontend test:e2e:tasks -- --grep "deletes a template from the templates view"` failed because `playwright` is unavailable in this checkout (`node_modules` is missing).
