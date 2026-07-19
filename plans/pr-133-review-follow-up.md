# PR #133 Review Follow-up

- Status: In progress — push blocked by outbound repository policy
- Pull request: `MaestroError/commands-center#133`
- Foundation reference: [CC Design System Foundation](design-system-foundation.md)

## Goal

Assess every unresolved review thread, apply only valid corrections, preserve
existing product behavior, and close the reviewed threads with focused
regression coverage.

## Tasks

- [x] Map live-request `danger` actions directly to the typed Button danger
      variant and prove the helper contract with a focused unit test.
- [x] Delegate Global Search Escape dismissal entirely to the Dialog primitive
      and prove Escape closes while focus is in the result list.
- [x] Move the late `Zap` import in `AutoApproveToggle` to the module import
      section and run focused/static verification.
- [x] Update the PR description to disclose the intentional file-manager file
      download and folder-as-ZIP feature already present in commit `1cf9e645`.
- [x] Run ESLint fix/check, formatting, typecheck, affected tests, full tests,
      and the design-system audit against the complete review-fix set.
- [x] Commit the verified review fixes.
- [ ] Push the fix commit and resolve the remaining import-order thread without
      adding a reply.

## Acceptance criteria

- Danger live-request actions return `variant: "danger"` without contradictory
  primary styling or ad-hoc class overrides.
- Global Search closes exactly once through Dialog ownership when Escape is
  pressed from both the search field and a focused result.
- `AutoApproveToggle` keeps all imports in the conventional top-of-module
  section.
- The PR description explicitly covers single-file download, recursive folder
  ZIP streaming, the backend endpoints, and the `archiver` dependency.
- Search result navigation, overlay dismissal, live-request behavior, and file
  download behavior otherwise remain unchanged.
- Every valid review fix is committed and pushed before its thread is resolved.

## Verification

- Run the focused LiveRequestReviewForm, GlobalSearchPalette, and ChatComposer
  tests.
- Run ESLint with `--fix`, Prettier, typecheck, full tests, the design-system
  audit, and `git diff --check`.
- Confirm the remote branch contains the fix commit, the PR body contains the
  file-download scope, and no unresolved review threads remain.

## Evidence so far

- The LiveRequestReviewForm and GlobalSearchPalette suites pass 25 focused
  tests; ChatComposer passes 23 tests.
- A previous full run passed 1,252 backend, 1,445 frontend, and 205 shared tests,
  plus the CLI suite.
- The file-manager feature is an intentional, self-contained ancestor commit:
  `1cf9e645 Add file download and folder-as-zip to file manager`.
- PR #133 now documents the file-manager download scope, streaming endpoints,
  ZIP dependency, and test coverage.
- Final verification passes 1,252 backend, 1,445 frontend, and 205 shared tests,
  plus the CLI suite. ESLint fix/check, Prettier, typecheck, `git diff --check`,
  and all 27 design-system audit cases pass.
- The file-manager scope thread is resolved because its PR-description fix is
  already live. The import-order thread remains open until the environment
  permits the local fix commit to reach the PR branch.
