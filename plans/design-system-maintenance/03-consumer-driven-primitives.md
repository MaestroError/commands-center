# DSM-003 — Add Deferred Primitives Only for Proven Consumers

- Status: Complete
- Program: [Design-System Maintenance](README.md)
- Foundation reference:
  [React primitives](../design-system-foundation.md#react-primitives)
- Canonical guidance:
  [Components and interaction ownership](../../docs/design-system/components.md)

## Goal

Give Tooltip, Textarea, Select, and Badge/Pill/Status an evidence-backed final
disposition, implementing only the primitives required by current CC consumers
and migrating those consumers in the same change.

## Context

These candidates were intentionally deferred because the foundation forbids a
speculative component catalogue. DSM-002 will identify real compatibility-
styled controls and behavior gaps. Completion does not require creating every
candidate: a documented defer/native/common-composition decision is correct
when no current consumer proves a reusable primitive contract.

The 2026-07-18 visual-review follow-up completed the Select decision: seven
dynamic consumers reuse `SearchableSelect`, seven fixed consumers use the
copy-owned Radix Select, and native application selects are retired. DSM-003
must retain that contract while resolving Textarea, Badge/Pill/Status, and
Tooltip.

## Scope

- Build `artifacts/deferred-primitive-decision-matrix.md` from DSM-002's blocked
  or repeated consumers. Record consumer paths, semantics, behavior, visual
  roles, state requirements, and the selected implementation layer.
- Apply these decision rules:
  - `Textarea`: prefer a typed native wrapper when current text-area consumers
    share the Input visual/state contract.
  - `Select`: retain the completed consumer split: use `SearchableSelect` for
    searchable product selection and the copy-owned Radix Select for fixed
    choices. Do not reintroduce browser-native application selects.
  - `Badge`, `Pill`, and `Status`: keep semantic differences explicit. Combine
    them only when at least two consumers share role, variants, sizing, and
    accessibility behavior—not merely rounded appearance.
  - `Tooltip`: introduce the Radix/Shadcn behavior primitive only for current
    hover/focus supplementary information. A tooltip never replaces an
    accessible name.
- For every `add` decision, implement the smallest typed API, migrate every
  approved immediate consumer, add gallery coverage, and test supported states.
- Keep Radix imports inside `components/ui/`. Use semantic Tailwind roles and
  existing tokens; do not create a parallel CSS vocabulary.
- For every `defer`, `native`, or `reuse` decision, record the evidence and
  activation condition so later work does not repeat the assessment.
- Retire compatibility definitions and lower audit baselines only when the
  relevant family reaches zero consumers.

## Required deliverables

- `artifacts/deferred-primitive-decision-matrix.md` covering all named
  candidates and every concrete consumer from DSM-002.
- Minimal copy-owned primitive modules only for approved `add` decisions.
- Immediate production migrations and focused unit/E2E/gallery coverage for
  each introduced primitive.
- Updated component documentation, audit baselines, and compatibility
  disposition.
- Recorded activation conditions for candidates that remain deferred.

## Blockers and dependencies

- Blocked by: DSM-002 and its completed adoption matrix.
- Blocks: DSM-004, so selector cleanup runs against the final content/control
  component boundaries rather than changing in parallel.

## Acceptance criteria

- [x] Tooltip, Textarea, Select, and Badge/Pill/Status each have an explicit
      `add`, `native`, `reuse`, or `defer` decision backed by exact live
      consumers.
- [x] Every introduced primitive ships with at least one immediate production
      consumer; common compositions require at least two consumers with the
      same product contract.
- [x] No introduced module or exported variant is unused, speculative, or
      justified only by Shadcn availability.
- [x] Textarea preserves native value/defaultValue, form, ref, disabled,
      readonly, validation, resize, and accessible-label behavior required by
      its consumers.
- [x] Select ownership remains intentional: searchable behavior reuses
      `SearchableSelect`, fixed choices use the copy-owned Select, and no
      browser-native application select is reintroduced.
- [x] Badge/Pill/Status APIs encode proven semantic roles and accessible status
      communication rather than color alone; unrelated rounded labels are not
      forced into one abstraction.
- [x] Tooltip content appears for hover and keyboard focus, dismisses correctly,
      does not trap focus, and is not the sole accessible label.
- [x] All Radix usage remains inside `components/ui/`, appearance uses semantic
      theme roles, and no component branches on theme identity.
- [x] Default light/dark, disabled/error/selected states, focus visibility, and
      320px/390px containment are covered for every introduced API.
- [x] Compatibility counts only decrease, zero-consumer definitions are
      removed, and audit failures name the approved replacement.
- [x] Deferred candidates have a concrete activation condition and do not leave
      unused source, dependency, gallery, or documentation entries.

## Verification tests

- Verify the decision matrix against live imports, JSX consumers, compatibility
  counts, and existing common components before implementation.
- For each introduced primitive, test its typed public API and one behavior per
  test: keyboard, focus, dismissal, form semantics, disabled/readonly, status
  announcement, or tooltip timing as applicable.
- Add deterministic gallery states only for public reusable APIs and exercise
  Default light/dark plus narrow/wide layouts.
- Run `pnpm exec eslint . --fix`, `pnpm lint`, `pnpm typecheck`, all affected
  tests, full tests, design-system Playwright twice, full E2E, `pnpm knip`,
  production build, and `pnpm design-system:audit`.
- Search for direct Radix imports, unused exports, new raw palette roles, and
  retired compatibility definitions.

## Completion evidence

- The decision matrix records evidence and activation conditions for Textarea,
  Select, Badge, Pill, Status, and Tooltip.
- Textarea migrated 14 ordinary field consumers across 10 paths. The audit
  retains exactly five specialized domain textareas and rejects growth.
- Badge replaced every `cc-badge` consumer and retired all three badge
  compatibility classes. Tooltip replaced five task-board implementations.
- Component tests cover native textarea semantics, badge text/roles, and
  tooltip hover, focus, and Escape behavior. The full workspace test run passes,
  including 148 frontend files and 1,443 frontend tests.
- Design-system Playwright passed twice with 45 desktop checks per run; the full
  E2E suite passed 155 tests with 45 intentionally skipped mobile duplicates.
- ESLint fix/check, typecheck, Prettier, Knip, production builds, the 24-case
  design-system audit, and `git diff --check` pass. Manual gallery inspection
  verified the introduced states in Default light and dark modes.

## Out of scope

- Implementing every candidate regardless of present demand.
- Replacing either established Select implementation with a new abstraction.
- Treating status color as sufficient accessible meaning.
- Building a field/form framework, polymorphic component system, or exhaustive
  variant catalogue.
