# DS-0302 — Migrate `ConfirmDialog` to AlertDialog

- Status: Planned
- Phase: [Phase 3](README.md)
- Foundation reference:
  [Phase 3 dialog gate](../../design-system-foundation.md#phase-3--consolidate-common-compositions)
- Adoption row: UI-008 in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Preserve the existing `ConfirmDialog` API and domain callbacks while replacing
its custom portal/modal implementation with the Phase 2 AlertDialog primitive.

## Context

`ConfirmDialog` currently supports primary/danger confirmation, cancellation,
an optional secondary action, disabled confirmation, and portal rendering. It
does not provide a complete focus-entry/containment/return contract. Multiple
settings, activity, and system-prompt flows rely on its current props.

## Scope

- Add pre-migration coverage for all existing props and close/action paths.
- Compose Phase 2 AlertDialog and Button through `ConfirmDialog` without exposing
  Radix to domain consumers.
- Preserve title, ReactNode description, confirm label/variant, optional
  secondary action, disabled state, cancel label/behavior, and current rendering
  contract unless DS-0301 approves an explicit change.
- Apply the Phase 2 safe-focus, Escape, overlay, portal, and focus-return
  contracts.
- Preserve consumer APIs so existing call sites require no business-logic
  refactor.
- Remove only the custom portal, overlay, dialog-role, and button-state code made
  obsolete by composition.

## Required deliverables

- Migrated `components/common/ConfirmDialog.tsx`.
- Expanded focused unit tests covering every public prop/action path.
- Real-browser coverage for safe initial focus, Escape, overlay behavior, focus
  containment/return, disabled confirmation, and optional secondary action.
- Reviewed application/dialog fixture screenshots in Default light/dark and at
  narrow/wide widths.

## Blockers and dependencies

- Blocked by: DS-0301 and successful Phase 2 AlertDialog sign-off.
- Blocks: DS-0309 and DS-0310.

## Acceptance criteria

- [ ] Existing `ConfirmDialog` props and domain callbacks remain compatible.
- [ ] Confirm, cancel, and optional secondary actions fire exactly once and
      close through the approved paths.
- [ ] Destructive confirmation initially focuses the safe action, never the
      danger action.
- [ ] Disabled confirmation is unavailable to pointer and keyboard input.
- [ ] Escape and overlay interaction follow the Phase 2 approved alert contract.
- [ ] Focus remains contained while open and returns to the invoking control.
- [ ] Title and description are correctly associated with the alert dialog.
- [ ] No direct Radix import or primitive visual-state duplication remains in
      `components/common`.
- [ ] Existing domain consumers require no unrelated refactor.

## Verification tests

- Use Testing Library/user-event for callbacks, optional secondary action,
  disabled state, accessible name/description, and prop compatibility.
- Use Playwright for real focus, keyboard, portal, overlay, and focus-return
  behavior.
- Run all current ConfirmDialog consumer tests and affected application E2E
  flows.
- Compare dialog fixture screenshots twice without unexplained updates.

## Out of scope

- Migrating other custom confirmation dialogs across domain pages.
- Changing confirmation copy or mutation behavior.
- Adding toast, alert-banner, or non-modal feedback primitives.
