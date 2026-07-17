# DS-0205 — Implement the AlertDialog Primitive

- Status: Planned
- Phase: [Phase 2](README.md)
- Foundation reference:
  [Radix and CC ownership](../../design-system-foundation.md#react-primitives)
- Contract: [DS-0201 artifact](artifacts/batch-1-contract.md)

## Goal

Create a copy-owned AlertDialog primitive for interruptive and destructive
confirmation, with safe focus behavior and CC-owned actions and appearance.

## Context

`ConfirmDialog` currently provides portal rendering and callback composition
but lacks a complete accessible modal contract. Destructive confirmation must
not initially focus the dangerous action. Phase 2 proves the domain-neutral
primitive; Phase 3 adapts `ConfirmDialog` to it without changing domain APIs.

## Scope

- Add `components/ui/alert-dialog.tsx` from the reviewed Shadcn/Radix starting
  point.
- Export only the root/trigger/portal/overlay/content/title/description/action/
  cancel structural pieces approved in DS-0201.
- Use Radix AlertDialog for modal semantics, focus containment/return, Escape,
  and accessibility wiring.
- Make the safe cancel action the initial focus for destructive confirmation.
- Use Button variants for primary, secondary/cancel, and danger actions without
  duplicating their visual classes.
- Support the current confirmation shape, including an optional non-destructive
  secondary action, at the composition layer rather than hardcoding labels.
- Apply the explicit DS-0201 alert-overlay dismissal decision.

## Required deliverables

- `src/components/ui/alert-dialog.tsx`.
- Focused component tests for composition, accessible naming, action/cancel
  behavior, disabled action, and controlled state.
- Real-browser tests for safe initial focus, focus containment/return, Escape,
  overlay interaction, and keyboard activation.
- Gallery-ready ordinary and danger confirmation examples for DS-0206.

## Blockers and dependencies

- Blocked by: DS-0201, DS-0202, and DS-0203.
- Blocks: DS-0206 and DS-0207.
- Enables: Phase 3 migration of `ConfirmDialog` after Phase 2 sign-off.

## Acceptance criteria

- [ ] Radix owns alert-dialog semantics and focus behavior; no custom focus trap
      is introduced.
- [ ] Title and description are accessible and the modal role is correct.
- [ ] The safe action receives initial focus for destructive confirmation.
- [ ] The danger action never runs through Escape, overlay interaction, or
      cancellation.
- [ ] Disabled confirmation remains unavailable to pointer and keyboard input.
- [ ] Focus returns to the invoking control after every approved close path.
- [ ] Appearance composes Button and CC semantic tokens without parallel
      action styles or raw palette colors.
- [ ] The optional secondary-action requirement can be composed without
      embedding `ConfirmDialog` domain props in the primitive.
- [ ] No production confirmation consumer is migrated in this task.

## Verification tests

- Use Testing Library for action/cancel callbacks, accessible naming, disabled
  state, controlled state, and structural composition.
- Use Playwright for initial safe focus, Tab containment, Escape, overlay
  contract, focus return, and danger activation by keyboard.
- Capture primary and danger examples in Default light/dark at desktop and
  narrow widths.
- Re-run the current `ConfirmDialog` baseline to prove Phase 2 did not migrate
  or incidentally restyle it.

## Out of scope

- Migrating `ConfirmDialog` or domain confirmation call sites.
- Toasts, non-modal alerts, and status banners.
- Business-specific confirmation copy or mutation behavior.
