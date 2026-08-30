# PR 184 Overlapping Unarchive Maintenance

1. Add a service regression that overlaps two unarchive requests for the same deduped activity and verifies neither response reports the restored target as archived.
2. Exclude the requested activity ID from the transaction's dedupe-collision archive update while preserving different-ID displacement reporting.
3. Run focused backend tests, lint with fixes, typecheck, formatting, and whitespace checks before pushing the focused maintenance commit.
