# DS-0203 — Implement the Typed Button Primitive

- Status: Planned
- Phase: [Phase 2](README.md)
- Foundation reference:
  [compatibility API](../../design-system-foundation.md#4-preserve-current-classes-as-a-compatibility-api)
- Contract: [DS-0201 artifact](artifacts/batch-1-contract.md)

## Goal

Create a typed, domain-neutral Button that exposes the current CC primary,
secondary, and danger visual contract without duplicating or redesigning it.

## Context

Button styling is currently expressed through `cc-button`,
`cc-button-secondary`, and `cc-button-danger` across many call sites. Phase 2
needs a typed entry point over that same contract while existing class-based
consumers continue to work. The first Dialog and AlertDialog implementations
need Button for their action examples and gallery states.

## Scope

- Add `components/ui/button.tsx` with named exports and strict native-button
  props/ref support.
- Use CVA only for the approved primary, secondary, and danger variants.
- Render the existing compatibility classes internally where they already
  express the approved appearance.
- Accept `className` through `cn` so Tailwind layout utilities remain available
  to consumers.
- Preserve native activation, disabled, focus-visible, name/value, and form
  behavior.
- Keep the API free of domain-specific labels, loading logic, confirmation
  behavior, theme branching, and unapproved polymorphism.

## Required deliverables

- `src/components/ui/button.tsx`.
- Focused Button unit tests covering default and explicit variants, native prop
  forwarding, ref forwarding, disabled activation, and class composition.
- Gallery-ready examples for normal, hover/focus review, disabled, and all
  variants; final fixture integration belongs to DS-0206.

## Blockers and dependencies

- Blocked by: DS-0201 and DS-0202.
- Blocks: DS-0204, DS-0205, DS-0206, and DS-0207.

## Acceptance criteria

- [ ] The primitive exposes only the DS-0201-approved variants and native props.
- [ ] Existing `cc-button*` classes remain the shared visual compatibility
      contract rather than becoming a parallel variant system.
- [ ] Primary, secondary, danger, disabled, and focus-visible states use only CC
      semantic tokens in Default light and dark.
- [ ] `className` supports consumer layout composition without overriding the
      selected variant accidentally.
- [ ] Native button semantics, ref, event handlers, and form attributes are
      preserved.
- [ ] Disabled buttons cannot invoke activation handlers.
- [ ] No `asChild`, IconButton, loading state, size catalogue, or link behavior
      is added without updating DS-0201 with a concrete consumer.
- [ ] Existing class-only buttons continue to render unchanged.

## Verification tests

- Use Testing Library/user-event for activation, disabled state, native props,
  ref, and accessible-name behavior.
- Assert the public variant output through rendered behavior/classes without
  testing CVA internals.
- Review every state in Default light/dark and at narrow/wide fixture sizes.
- Run existing application baselines to detect compatibility-class regressions.

## Out of scope

- Bulk button migration.
- Link/polymorphic buttons and IconButton.
- Input, toggle, split-button, menu-button, or loading abstractions.
