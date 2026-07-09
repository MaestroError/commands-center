# PR 114 Review Comments

## Goal

Address the three unresolved PR review threads on private document scope
validation, then resolve the threads on GitHub.

## Tasks

1. Update the private document uniqueness index predicate so it only applies to
   private rows with a non-null `owner_specialist_id`.
2. Keep the migration SQL and Drizzle snapshot metadata aligned with the schema.
3. Treat private document URLs without an `owner` as invalid in
   `DocumentsPage`.
4. Treat private sidebar targets without an `owner` as invalid in
   `DocumentsSidebarSection`.
5. Add focused regression tests for the DB index predicate and malformed
   private URLs.
6. Run lint, typecheck, tests, commit, push, and resolve the review threads.
