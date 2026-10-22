# CC tool specialist actions

- [x] Restore per-tool Allow / Ask / Deny in specialist forms using existing permission controls.
- [x] Persist exact actions and display inherited group actions correctly.
- [x] Keep task/template controls binary and inherited Ask automatically allowed.
- [x] Verify regression tests, lint, typechecks, and design audit.

Existing portable permission fields support all three values; no migration or
filesystem ignore changes are needed.

Verified the live specialist editor shows all three actions for notification tools.
The full frontend run passed 1,614 tests and found one obsolete switch-selector
test. Replaced it with save coverage for all three actions; the affected four
test files then passed all 40 tests. Lint, typecheck, and design audit passed.
