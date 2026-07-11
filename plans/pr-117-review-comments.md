# PR 117 review comment fixes

## Scope

Address all four unresolved review threads on PR 117 and resolve them after verification.

## Plan

1. Separate artifact-registration pending state from file-tree mutation state.
   - Track pending artifact paths independently so delete, move, upload, and folder actions cannot re-enable an in-flight artifact button.
   - Add a regression test that completes an unrelated file-tree action while artifact registration remains pending.

2. Enforce file-only artifact sharing centrally.
   - Make `ArtifactShareControls` render only for `type: "file"`, covering both task-detail call sites and any future reuse.
   - Extend component coverage for document and URL artifacts.

3. Correct task-panel document navigation.
   - Reuse `buildArtifactHref()` for aggregated artifacts and mark only URL artifacts as external.
   - Add helper coverage proving document artifacts open through the Documents route.

4. Verify and close review threads.
   - Run ESLint with `--fix`, typecheck, focused tests, and full relevant suites.
   - Reply to each thread with the implemented change and resolve it through GitHub's review-thread API.

## Second review round

1. Make share-link rotation atomic.
   - Run active-row revocation and replacement insertion in one database transaction.
   - Verify an insertion failure rolls back the revocation and preserves the previous active share.

2. Restart copy feedback on every copy click.
   - Clear copied state before the asynchronous clipboard write so repeated clicks of the same Render or Download button schedule a fresh 2.5-second timeout.
   - Add fake-timer coverage for repeated same-button copying.

3. Use the correct live-region role for artifact results.
   - Render failures with `role="alert"` and successes with `role="status"`.
   - Cover both announcement modes in component tests.
