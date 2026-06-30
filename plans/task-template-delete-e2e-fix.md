# Task Template Delete E2E Fix

## Goal

Update the task templates E2E test to accept the new delete confirmation dialog.

## Todo

- [x] Inspect the existing task templates E2E test and confirm the exact request it waits for.
- [x] Update the delete-template E2E test to accept the confirmation dialog before waiting for the delete request.
- [x] Attempt to run the focused task templates E2E test or the tasks E2E suite.
- [ ] Commit and push the fix to the current PR branch.

## Verify

- The delete-template E2E test accepts the browser confirmation and can observe the DELETE request again.
- Run the relevant Playwright task E2E command if the local checkout allows it.

## Verification Notes

- `pnpm --filter @cc/frontend test:e2e:tasks -- --grep "deletes a template from the templates view"` failed because `playwright` is unavailable in this checkout (`node_modules` is missing).
