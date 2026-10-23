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

## Custom script namespace collision

- [x] Reserve cc_custom for scripts in MCP create/update validation.
- [x] Disable conflicting existing/manual MCP entries at runtime with rename guidance; exclude them from MCP catalogs and policy matching.
- [x] Verify scripts remain usable with an empty task MCP matrix and conflicting configured integration.
- [ ] Run tests/lint/typechecks, push and reply to review.

No persisted files are migrated; existing MCP configuration remains available for renaming. No workspace gitignore changes are required.

Collision validation: 86 integration/service tests passed; the final additional catalog regression passed with the six-test catalog suite (87 total unique tests). ESLint --fix and backend typecheck passed.

## Persisted snapshots and specialist form review

- [x] Preserve MCP per-tool defaults during specialist form hydration/save.
- [x] Mark new run snapshots as version 1; interpret older snapshots using their stored group/wildcard rules when no complete matrix exists.
- [ ] Verify legacy grants/denials, strict new matrices, and specialist reopen/save; run lint/typechecks and request review.

Snapshot/form validation: 60 backend/SDK tests, 53 shared schema tests, and the specialist reopen/save regression passed. ESLint --fix and all package typechecks passed.

## Final functional review

- [x] Start CC handler timeout only after authorization; preserve cancellation during approval.
- [x] Rename MCP references in task profiles and portable task-template settings, without changing run snapshots.
- [ ] Test approval timing/cancellation and rename persistence; run lint/typechecks and request review.

Decision: legacy task/template profile migration is out of scope; operator accepts recreating old tasks/templates. The specialist MCP hydration issue is already fixed in 8a8f96b6.

Final functional validation: 97 unique adapter/service/SDK tests passed, ESLint --fix and backend typecheck passed. Template updates use existing task.json paths; no workspace gitignore change or migration is needed.

## Rename ordering regression

- [x] Remove the duplicate pre-validation task permission rewrite.
- [x] Verify rejected renames leave task/template state untouched and prefix renames run exactly once.
- [ ] Run lint/tests/typecheck and update PR.

Rename-order validation: 42 tests, ESLint --fix, and backend typecheck passed.

## Overlapping MCP names

- [x] Resolve rename rule ownership against configured namespaces, preferring the longest matching server name.
- [x] Preserve unrelated overlapping-server rules in task, template and specialist profiles.
- [ ] Test exact and wildcard rules, run checks, update PR.

Overlapping-name validation: 49 service regressions, ESLint --fix and backend typecheck passed.
