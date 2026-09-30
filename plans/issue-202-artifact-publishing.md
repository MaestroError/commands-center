# Issue #202: concurrent artifact publishing

- [x] Serialize the full publication operation per manifest within the single-owner runtime, including across service instances.
- [x] Give atomic config writes unique temporary files and clean them up on failure.
- [x] Preserve invalid manifests and surface an actionable conflict instead of resetting history.
- [x] Add regression tests for concurrent distinct/same artifacts, failed publication recovery, corrupted manifests, and concurrent config writes.
- [x] Run ESLint --fix, formatting, typecheck, and tests; inspect the final diff.

Publication: the user requested a PR against staging, authorizing the commit and push.

No persistence format changes or migrations. Publication uses an in-process queue plus a SQLite lock beside the manifest to coordinate independent server processes. Existing signed links and snapshots retain their behavior.

## Validation

- All 3,813 package tests passed: backend 1,714, frontend 1,796, shared 258, CLI 45.
- Six regression cases failed against the original implementation; all 30 focused tests passed after restoring the fix.
- ESLint --fix, formatting, repository typecheck, and git diff checks passed.
- No frontend appearance changes; browser tests were not run for this filesystem/service fix.

## Review: cross-process publication

The review identified that multiple server processes can open one workspace. The initial single-writer assumption is not enforced.

- [x] Add a dedicated SQLite lock beside the manifest, shared across processes regardless of application database configuration. Keep the lock database disposable; the JSON manifest remains authoritative.
- [x] Bound contention waits and release the lock on errors and process exit.
- [x] Exercise independent publishing processes and lock recovery after termination.
- [x] Run ESLint --fix, typecheck, and tests; prepare the review fix for publication.

Review validation: all 1,716 backend tests passed; 32 focused tests passed; repository typecheck, ESLint --fix, formatting, and diff checks passed. The held-lock regression fails with the cross-process lock disabled.
