# DS-0607 — Retire Proven-Unused Compatibility Classes

- Status: Complete
- Phase: [Phase 6](README.md)
- Foundation reference:
  [Compatibility API](../../design-system-foundation.md#4-preserve-current-classes-as-a-compatibility-api)
- Upstream gates: DS-0601 compatibility disposition and DS-0606 audit

## Goal

Remove legacy `cc-*` compatibility definitions only where all production, test,
fixture, and documentation consumers are gone and removal clearly simplifies
the supported styling contract.

## Context

Compatibility classes were intentionally retained through migration. Phase 6
is the first safe removal point, but it is not a zero-count contest. A class
with a real consumer stays documented and ratcheted; a fully unused class should
not remain as a second public styling API.

## Scope

- Re-run exact consumer searches for each family in DS-0601's disposition.
- Distinguish definitions, compositions, dynamic string construction, test
  selectors, documentation examples, snapshots, and true runtime consumers.
- Remove one proven-unused class family at a time with its obsolete definitions,
  tests, examples, and allowlist entries.
- Do not migrate remaining domain UI merely to make deletion possible; record
  the exact blocker/owner instead.
- Update the compatibility ratchet after each accepted removal so deleted class
  names cannot be reintroduced.
- Preserve unrelated semantic tokens and base/third-party/protected styles.

## Required deliverables

- Removed compatibility families with per-family consumer evidence and focused
  verification.
- `artifacts/compatibility-retirement-record.md` listing removed, retained, and
  blocked families with counts, owners, rationale, and future condition.
- Updated audit configuration/baselines for no-new and no-reintroduction rules.
- Updated canonical docs that mention the final compatibility policy.

## Blockers and dependencies

- Blocked by: DS-0601 and DS-0606.
- Blocks: DS-0608 and DS-0609.

## Acceptance criteria

- [x] Every removed class has zero live production, test-selector, fixture, and
      documentation consumers before its definition is deleted.
- [x] Dynamic/computed class construction is accounted for rather than missed by
      literal search alone.
- [x] Removal produces a smaller public styling contract without introducing a
      replacement alias or page-specific CSS tree.
- [x] Retained classes have exact consumers, owners, rationale, and a ratchet
      preventing count growth.
- [x] Blocked families remain functional; Phase 6 does not force unrelated
      domain refactors.
- [x] Behavior, appearance, focus, responsive, Markdown, and third-party
      fixtures show no regression after each removal batch.
- [x] Deleted class names fail the audit if reintroduced.

## Verification tests

- Run literal and dynamic consumer searches before and after each family.
- Run affected unit/E2E/visual tests and two no-update design-system visual
  passes after the final batch.
- Run `pnpm lint`, typecheck, the design-system audit, and production build.
- Search production output for removed class names and retained gallery/test-only
  references according to the final disposition.

## Out of scope

- Rewriting domain screens solely to achieve zero compatibility classes.
- Removing semantic tokens or protected scopes because names appear old.
- Cleaning unrelated global CSS.
