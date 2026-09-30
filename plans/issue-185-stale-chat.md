# Issue #185: stale Direct Chat navigation

- [x] Isolate chat state per specialist route so previous state cannot rewrite a new URL.
- [x] Preserve HTTP status in JSON request errors and recover missing conversation details using the current-conversation endpoint only for 404 responses.
- [x] Hydrate only the active query after its refresh; replace recovered stale URLs while preserving intentional history navigation.
- [x] Add hook, page, API, and browser regression coverage for stale URLs, cached snapshots, and error boundaries.
- [x] Run ESLint --fix, typecheck, tests, and focused browser checks; prepare the verified fix for a PR against staging.

No persistence or appearance changes, dependencies, or migrations. Valid historical conversations remain accessible.

## Validation

- Full package suites passed: backend 1,716, frontend 1,804, shared 258, CLI 45.
- Final focused suite passed all 158 tests, including the additional same-conversation URL-recovery case.
- All 12 desktop/mobile chat browser cases passed with mocked API responses. Both new browser regressions fail against the original implementation.
- ESLint --fix, repository typecheck, formatting, and diff checks passed.
- Preserving component state within a specialist avoids dropping pending uploads during initial URL synchronization; the upload browser regression passes.
