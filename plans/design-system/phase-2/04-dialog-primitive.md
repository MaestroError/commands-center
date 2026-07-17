# DS-0204 — Implement the Dialog Primitive

- Status: Complete (unit + a11y coverage landed; real-browser focus/Escape/overlay/narrow-containment tests are driven through the fixture in DS-0206)
- Phase: [Phase 2](README.md)
- Foundation reference:
  [Radix and CC ownership](../../design-system-foundation.md#react-primitives)
- Contract: [DS-0201 artifact](artifacts/batch-1-contract.md)

## Goal

Create a copy-owned Dialog primitive that uses Radix for modal behavior and CC's
semantic tokens and Tailwind composition for appearance.

## Context

Ordinary CC dialogs currently repeat overlays, portals, responsive shells,
titles, descriptions, action rows, Escape handling, outside dismissal, and
focus behavior inconsistently. Phase 2 establishes the domain-neutral behavior
layer only. Phase 3 will migrate the document dialog compositions.

## Scope

- Add `components/ui/dialog.tsx` from the reviewed Shadcn/Radix starting point.
- Export only the structural pieces approved in DS-0201, such as root, trigger,
  portal, overlay, content, header, footer, title, description, and close.
- Support controlled and uncontrolled open state through Radix's public API.
- Use Radix for portal ownership, modal focus containment, Escape, outside
  interaction, accessibility wiring, and focus return.
- Adapt overlay, content, focus, spacing, responsive width, radius, border,
  surface, and shadow to CC semantic utilities/tokens.
- Use Button for explicit actions; do not make Dialog own action labels or
  domain callbacks.
- Use a Lucide icon with an accessible name only if the approved contract
  includes a default icon close control.

## Required deliverables

- `src/components/ui/dialog.tsx`.
- Focused unit/component tests for public composition and accessible naming.
- Real-browser tests for focus entry/containment/return, Escape, overlay
  behavior, portal placement, and narrow-viewport containment.
- Gallery-ready controlled and trigger-driven examples for DS-0206.

## Blockers and dependencies

- Blocked by: DS-0201, DS-0202, and DS-0203.
- Blocks: DS-0206 and DS-0207.
- Enables: Phase 3 migration of `DocumentCreateDialog` and
  `DocumentFolderDialog` after Phase 2 sign-off.

## Acceptance criteria

- [ ] Radix owns modal, portal, focus, Escape, and outside-interaction behavior;
      no custom focus trap or document-level keyboard listener is introduced.
- [ ] Dialog content has an accessible title and, when present, description.
- [ ] Focus enters predictably, remains contained while modal, and returns to
      the invoking control on close.
- [ ] Controlled and uncontrolled usage both follow the approved close contract.
- [ ] Overlay dismissal and Escape match the DS-0201 ordinary-dialog decision.
- [ ] Content remains within 320px and 390px viewports without page overflow.
- [ ] Appearance uses CC semantic tokens and existing theme shape roles only.
- [ ] No default Shadcn palette, hardcoded light/dark class branch, or
      page-specific selector is added.
- [ ] No production dialog is migrated in this task.

## Verification tests

- Use Testing Library for composition, title/description association,
  controlled open changes, and close actions.
- Use Playwright for Tab/Shift+Tab containment, initial focus, focus return,
  Escape, pointer overlay behavior, portal layering, and narrow bounds.
- Capture Default light/dark primitive screenshots at desktop and narrow widths.
- Run application and protected-content baselines for unintended global changes.

## Out of scope

- Domain form state, validation, mutation handling, and action ordering.
- Alert/destructive confirmation semantics.
- Migrating document, file-picker, search, image, or chat dialogs.
