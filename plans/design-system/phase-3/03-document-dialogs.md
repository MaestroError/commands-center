# DS-0303 — Migrate the Document Dialogs to Dialog

- Status: Complete
- Phase: [Phase 3](README.md)
- Foundation reference:
  [Phase 3 dialog gate](../../design-system-foundation.md#phase-3--consolidate-common-compositions)
- Adoption row: UI-009 in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Move `DocumentCreateDialog` and `DocumentFolderDialog` onto the Phase 2 Dialog
and Button primitives while preserving their independent form, validation,
mutation, and workspace behavior.

## Context

Both dialogs duplicate a fixed overlay, modal section, title/description,
action-row, outside-click behavior, and button states. Their domain logic is
different: document creation derives/normalizes Markdown paths and optional
metadata, while folder creation enforces a non-empty final path segment. That
logic must not move into UI primitives or be consolidated merely because their
shells look alike.

## Scope

- Strengthen pre-migration tests for close behavior, pending/error states,
  callbacks, validation, and focus entry where coverage is missing.
- Compose the Phase 2 Dialog shell and Button actions in both components.
- Preserve each component's current public props and mutation inputs.
- Preserve Default-folder/parent behavior, document slug/path derivation,
  extension normalization, validation, pending labels, error messages, query
  invalidation, and success close behavior.
- Apply the approved ordinary-dialog Escape, overlay, portal, accessible naming,
  focus-entry/containment/return, and narrow-layout contract.
- Remove duplicated modal-shell code only; keep distinct domain form logic
  separate.

## Required deliverables

- Migrated `DocumentCreateDialog.tsx` and `DocumentFolderDialog.tsx`.
- Complete focused unit tests for domain behavior plus shared dialog behavior.
- Playwright coverage opening each dialog from its real Documents trigger and
  exercising keyboard close/focus return.
- Reviewed light/dark, narrow/wide document-dialog assertions.

## Blockers and dependencies

- Blocked by: DS-0301 and successful Phase 2 Dialog/Button sign-off.
- Blocks: DS-0309 and DS-0310.

## Acceptance criteria

- [ ] Both public component APIs remain compatible.
- [ ] Document path derivation, Markdown extension behavior, metadata, scope,
      owner, and mutation payloads remain unchanged.
- [ ] Folder path validation and mutation payloads remain unchanged.
- [ ] Pending/disabled/error/success states and query invalidation remain
      correct and independently tested.
- [ ] Titles/descriptions are accessible; focus enters the appropriate field,
      remains contained, and returns to the real trigger.
- [ ] Escape and overlay interaction follow the Phase 2 ordinary-dialog contract
      without submitting either form.
- [ ] Both dialogs remain usable without page overflow at 320px and 390px.
- [ ] No domain logic moves into `components/ui` and no direct Radix import is
      added outside that directory.
- [ ] Only duplicated modal/action visual states are removed.

## Verification tests

- Run focused document dialog tests for every validation and mutation branch.
- Use Playwright from the Documents UI for open, initial focus, Tab containment,
  Escape/overlay close, focus return, success, pending, and error paths.
- Run Documents page E2E and application dialog visual baselines twice.
- Confirm Markdown and Milkdown baselines remain unchanged.

## Out of scope

- Refactoring document APIs, query keys, path business rules, or sidebar state.
- Consolidating the two forms into one generic dialog.
- Migrating other Documents or file-manager overlays.
