# DS-0304 — Consolidate `PageHeader` and Page States

- Status: Complete
- Phase: [Phase 3](README.md)
- Foundation reference:
  [component ownership boundaries](../../design-system-foundation.md#5-reuse-the-existing-component-hierarchy)
- Adoption rows: UI-005, UI-007, and UI-020 in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Keep `PageHeader`, `LoadingState`, `ErrorState`, and `EmptyState` as reusable CC
compositions while moving shared surface and alert visual states behind the
smallest approved UI primitives.

## Context

These common components are widely used and their APIs are already appropriately
domain-neutral. The problem is not their ownership; it is that surface, alert,
empty-state, and action styling is assembled directly. Phase 3 should preserve
the common layer and extract only behavior/appearance that is truly primitive.

## Scope

- Record current PageHeader and PageStates consumers, visual variants, test IDs,
  action slots, and responsive behavior.
- Add only the Surface and/or Alert support primitives authorized by DS-0301.
- Compose those primitives inside the existing common components while
  preserving public props and rendered semantic structure.
- Keep skeleton/loading layout in the common composition unless a reusable
  primitive has a demonstrated second consumer.
- Preserve explicit Tailwind layout at the composition layer.
- Remove only duplicated border/background/radius/status visual states made
  obsolete by the new primitives.

## Required deliverables

- Approved support primitive files with focused tests and gallery states.
- Migrated `PageHeader.tsx` and `PageStates.tsx` with stable APIs.
- New focused common-component tests for title/description/action/testId,
  loading shape count, and error/empty semantics.
- Representative page visual coverage in Default light/dark and narrow/wide.

## Blockers and dependencies

- Blocked by: DS-0301 and its support-primitive authorization.
- Blocks: DS-0309 and DS-0310.

## Acceptance criteria

- [ ] PageHeader and all PageStates public props remain compatible.
- [ ] Surface/Alert primitives contain only domain-neutral appearance and
      semantics demonstrated by current consumers.
- [ ] Page-level layout, copy, action composition, loading-grid shape, and test
      IDs stay in `components/common`.
- [ ] Error status uses semantic danger roles with appropriate accessible
      behavior; it does not add an unsolicited live region to static content.
- [ ] Empty and loading states retain their existing meaning and responsive
      layout.
- [ ] Changed appearance uses semantic tokens and existing theme shape roles.
- [ ] No broad page migration or page-specific selector is introduced.
- [ ] Existing class-only Surface/Alert consumers remain supported for Phase 4.

## Verification tests

- Add focused component tests for each common export and support primitive.
- Sample consumers across settings, tasks, specialists, integrations, and
  activity surfaces.
- Review Default light/dark at desktop and 390px; assert no new page overflow.
- Run affected page tests, application contracts, and design-system assertions
  twice without unexplained updates.

## Out of scope

- Rewriting page content or information architecture.
- Migrating every `cc-panel`, `cc-alert`, or `cc-empty-state` call site.
- Creating speculative Card, Skeleton, or status APIs without a named consumer.
