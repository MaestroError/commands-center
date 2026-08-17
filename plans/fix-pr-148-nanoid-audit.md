# Fix PR #148 nanoid audit failure

## Goal

Clear the informational high-severity dependency audit failure on PR #148
without changing application behavior.

## Root cause

The lockfile resolves `nanoid@3.3.17` through PostCSS. GitHub advisory
`GHSA-2v37-7h3g-55p8` marks versions below `3.3.18` as vulnerable. The existing
pnpm override pins the previous patched floor and no longer covers the current
advisory.

## Plan

1. Change the root pnpm override to force `nanoid` versions below `3.3.18` to
   `3.3.18`.
2. Regenerate `pnpm-lock.yaml` with the repository's pinned pnpm version.
3. Verify the resolved dependency graph and run the high-severity audit, lint,
   typecheck, and tests.
4. Commit and push the focused dependency fix to PR #148.
5. Inspect unresolved review threads and report any actionable feedback.

## Acceptance criteria

- `pnpm why nanoid --filter @cc/frontend` reports `nanoid@3.3.18` for the
  PostCSS dependency path.
- `pnpm audit --audit-level=high --ignore-registry-errors` exits successfully.
- Required repository checks pass locally.
- The fix is committed and pushed without changing unrelated dependencies.
