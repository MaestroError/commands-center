# Issue #202: concurrent artifact publishing

- [x] Serialize the full publication operation per manifest within the single-owner runtime, including across service instances.
- [x] Give atomic config writes unique temporary files and clean them up on failure.
- [x] Preserve invalid manifests and surface an actionable conflict instead of resetting history.
- [x] Add regression tests for concurrent distinct/same artifacts, failed publication recovery, corrupted manifests, and concurrent config writes.
- [x] Run ESLint --fix, formatting, typecheck, and tests; inspect the final diff.

Publication: the user requested a PR against staging, authorizing the commit and push.

No persistence format changes or migrations. Locking is process-local, matching the application's single-writer runtime. Existing signed links and snapshots retain their behavior.

## Validation

- All 3,813 package tests passed: backend 1,714, frontend 1,796, shared 258, CLI 45.
- Six regression cases failed against the original implementation; all 30 focused tests passed after restoring the fix.
- ESLint --fix, formatting, repository typecheck, and git diff checks passed.
- No frontend appearance changes; browser tests were not run for this filesystem/service fix.
