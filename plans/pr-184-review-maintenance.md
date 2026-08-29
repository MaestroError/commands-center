# PR 184 review maintenance

1. Make archive requests survive navigation and cover routed proposal actions.
2. Correct swipe completion and cancellation behavior with regression tests.
3. Preserve the pending dedupe-key invariant when unarchiving.
4. Deduplicate optimistic cache moves and serialize read-state mutations.
5. Restore 44 px mobile controls and remove duplicate tab dispatch.
6. Run focused tests, lint with fixes, design-system audit, typecheck, and the relevant broader checks.

## Second review cycle

1. Keep archive-all confirmation pending and error states mounted through optimistic cache changes.
2. Make unarchive cache movement wait for canonical server data when a different dedupe-key card may be displaced.
3. Enforce one pending activity per dedupe key with a partial unique index, atomic emit upsert, migration cleanup, and concurrency coverage.
4. Block opposing archive and unarchive operations for the same activity until the active request settles.
5. Close the complete mobile dialog at the desktop breakpoint and cover viewport resizing.
6. Restrict swipe completion to leftward gestures and add right-swipe snap-back coverage.
7. Replace filter tabs with accessible pressed segmented buttons so no control references a missing tabpanel.
8. Run focused and full tests, lint with fixes, formatting, design-system audit, typecheck, Knip, and applicable E2E checks.

## Continuation cycle 1

1. Apply the shared read-state mutation lock to the activity bell and cover a same-ID mark-unread/mark-read crossing.
2. Return the current unarchive response envelope from notification Playwright fixtures, including displaced IDs, and verify settled pending/resolved state.
3. Run focused frontend tests, Playwright discovery, lint with fixes, formatting, typecheck, and broader relevant checks.
