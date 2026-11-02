# PR 214 review fixes

All six review comments are relevant. Each fix will be tested, committed separately,
pushed, and its review thread resolved.

- [x] 4443653024: reject symlinked artifact destinations and verify containment.
- [x] 4443653115: keep worker reply claims from changing the parent board status.
- [x] 4443653188: submit mention-only and skill-only task-chat replies.
- [x] 4443653266: preserve chat drafts changed during queued submission.
- [x] 4443653343: preserve task timeline drafts changed during submission.
- [x] 4443653418: allow attachment-sized payloads on both reply endpoints.

The user approved extracting the upload service's directory validation for reuse
by team artifact materialization. Validate each directory and the final file before
writing; use a no-follow file handle and verify containment before truncation.
Run artifact, upload and Teams regressions, ESLint --fix and typecheck before commit.
No new dependencies are needed.
No portable storage layout changes or filesystem migrations are needed. The existing
workspace ignore policy already covers runtime team inputs; do not modify live ignores.

Symlink fix verification: all four directory/file symlink regressions reproduced the
original bug and now pass. Hard-link rejection and normal snapshot refresh are
covered. Artifact, upload and execution suites passed 142 tests; final artifact
checks were rerun after adding file identity verification. ESLint --fix, backend
typecheck and diff whitespace validation passed.
