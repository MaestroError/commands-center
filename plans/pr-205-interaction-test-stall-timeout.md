# PR #205 interaction-filtering coverage failure

- [x] Inspect CI: only Backend Coverage failed; the interaction-filtering test timed out after five seconds.
- [x] Reproduce the test's five-millisecond stall detector firing during a delayed pending-interaction read.
- [x] Remove the unrelated stall deadline from this test and dispose its execution service before database cleanup.
- [ ] Run ESLint --fix, typecheck, and backend coverage; push the verified follow-up and confirm CI.

A temporary 20ms delay in listPendingPermissions reproduced cancellation instead of completion. The same delayed fixture passed with noProgressMs=0. Temporary diagnostic assertions and delay were removed; only the unrelated stall timer and explicit disposal changed.

Local validation passed: ESLint --fix, backend typecheck, and all 1,665 backend tests with coverage thresholds.
