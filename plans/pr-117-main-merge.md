# PR 117 main merge resolution

## Conflict

`packages/frontend/src/pages/tasks/task-helpers.test.ts` received independent additive tests on both branches.

## Resolution

- Keep the artifact document-navigation regression coverage from the PR branch.
- Keep the task-template MCP form mapping coverage from `main`.
- Combine the `TaskRun` and `TaskTemplate` type imports and all required helper imports.
- Run ESLint, typecheck, and the full test suites before committing the merge.

## Verification

- [x] Conflict markers removed and combined test file passes formatting checks.
- [x] ESLint completed with `--fix`, followed by the full workspace lint.
- [x] Workspace typecheck passed.
- [x] Backend, frontend, shared, and CLI test suites passed.
- [ ] Commit the merge, push the branch, and confirm the PR merge state.
