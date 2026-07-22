# CI Audit Fix And Reviewer Comment Triage

**Status:** Reviewer follow-up in progress. Authored 2026-07-22.

## Goal

Remove the high-severity transitive dependency findings reported by PR 134's
audit job, commit the focused dependency-resolution fix, and assess unresolved
reviewer comments without changing reviewer-requested code before approval.

## Tasks

- [x] Refresh only the vulnerable transitive dependency resolutions to patched
      versions allowed by the existing dependency ranges.
- [x] Verify the high-severity audit, lint, and full test suite.
- [x] Commit the audit fix on `feat/public-mcp-oauth`.
- [x] Fetch unresolved PR review threads and classify each recommendation.
- [x] Report which reviewer comments should be fixed and the proposed approach.
- [x] Exempt OAuth protocol POST endpoints from browser-origin validation while
      retaining it for browser interaction APIs.
- [x] Add regression tests for production OAuth clients without `Origin`,
      proxy-aware rate-limit identities, and IPv6 loopback origins.
- [x] Format, lint, and test the reviewer follow-up.
- [ ] Reply to every unresolved review thread and resolve only those fully
      addressed by code or verified behavior.

## Acceptance Criteria

- `pnpm audit --audit-level=high --ignore-registry-errors` exits successfully.
- The lockfile no longer resolves the affected vulnerable versions.
- Lint and tests pass before the audit fix is committed.
- Reviewer feedback is presented with resolution state, impact, and a concrete
  recommendation; no review thread is resolved or replied to automatically.
