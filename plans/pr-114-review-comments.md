# PR 114 Review Comments

## Goal

Address PR review threads on private document scope validation, then resolve
the threads on GitHub.

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

## Scope/Owner Contract Follow-up

1. [completed] Require an owner for private document read requests, and
   reject owners on global read requests.
2. [completed] Require an owner for private create, folder-create, and metadata
   update payloads, and reject owners on global payloads.
3. [completed] Add schema and route regression tests for invalid scope/owner
   combinations.
4. [completed] Apply the same scope/owner validation to document content
   saves, which share the same service boundary.
5. [completed] Run lint, typecheck, focused tests, commit, push, and resolve the
   review threads.
