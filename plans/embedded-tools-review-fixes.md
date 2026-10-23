# PR 213 review fixes

- [x] Initialize assigned specialist MCP inventory before snapshotting; keep validation/execution passive.
- [x] Parse migration inputs as JSONC; retain original rollback text.
- [x] Write credential-bearing migration files atomically with mode 0600 from creation.
- [x] Preserve task legacy MCP overrides when initializing the editor matrix.
- [x] Validate against effective default assignee, including assignee changes.
- [x] Normalize legacy Ask on internal task/template duplication.
- [ ] Run focused regression tests, ESLint --fix, and typechecks; push and request Copilot review.

No workspace gitignore changes needed: existing migration backup exclusions cover these files. Never update live workspace gitignore files.

Validation: 95 backend tests and 9 component tests passed; ESLint --fix and all package typechecks passed. JSONC parser approved by operator.

## Second review

- [x] Resolve inherited MCP defaults through merged task settings.
- [x] Preserve wildcard CC permission precedence in snapshots and picker initialization.
- [x] Keep task ownership separate from the form's effective assignee.
- [ ] Run regression tests and lint/typechecks, push, and request Copilot again.

Second-review validation: 18 backend and 23 frontend regression tests passed, ESLint --fix passed, and all package typechecks passed.

## Third review

- [x] Apply ordered wildcard CC rules to chat authorization using the shared resolver; retain exact-only task snapshots.
- [x] Verify wildcard Ask waits for approval before execution, including a later wildcard overriding an earlier exact Allow.
- [ ] Run focused SDK tests, lint, typechecks; push and request Copilot review.

Third-review validation: 32 SDK integration tests passed, including wildcard Ask waiting before handler execution and a later wildcard overriding an exact Allow. Backend typecheck and ESLint --fix passed.

## Fourth review

- [x] Align specialist CC picker actions with ordered wildcard enforcement.
- [x] Test wildcard Ask and later wildcard Deny; run lint and typecheck.
- [ ] Push the fix and reply to the review.

Fourth-review validation: 19 helper/component tests, frontend typecheck, and ESLint --fix passed.
