# Fix PR 94 Shared Coverage Plan

1. [ ] Inspect the failing shared schema tests and confirm which assertions still expect root-level `Documents/` file paths.
2. [ ] Update the shared document schema tests to match the new subfolder-only creation rule and add an explicit rejection case for root-level document creation.
3. [ ] Run `eslint --fix` and the focused shared coverage test file.
4. [ ] Commit and push the fix on the current PR branch.
