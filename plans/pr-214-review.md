# PR 214 review fixes

All six review comments are relevant. Each fix will be tested, committed separately,
pushed, and its review thread resolved.

- [ ] 4443653024: reject symlinked artifact destinations and verify containment.
- [x] 4443653115: keep worker reply claims from changing the parent board status.
- [x] 4443653188: submit mention-only and skill-only task-chat replies.
- [ ] 4443653266: preserve chat drafts changed during queued submission.
- [ ] 4443653343: preserve task timeline drafts changed during submission.
- [ ] 4443653418: allow attachment-sized payloads on both reply endpoints.

Use existing services and components without reuse refactoring or new dependencies.
No portable storage layout changes or filesystem migrations are needed. The existing
workspace ignore policy already covers runtime team inputs; do not modify live ignores.
