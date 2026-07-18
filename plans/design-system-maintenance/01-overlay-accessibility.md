# DSM-001 — Close Retained Custom-Overlay Accessibility Debt

- Status: Complete
- Program: [Design-System Maintenance](README.md)
- Foundation reference:
  [React primitives](../design-system-foundation.md#react-primitives)
- Canonical guidance:
  [Components and interaction ownership](../../docs/design-system/components.md)

## Goal

Move modal behavior for every retained hand-rolled overlay to the existing
CC-owned `Dialog`, `AlertDialog`, and `Command` foundations while preserving
domain content, application behavior, and current appearance.

This is refactoring work. Domain functionality and each existing dismissal
contract remain unchanged. Visual structure may become more consistent with CC
where the shared primitive replaces hand-authored surface/backdrop styling.

## Context

The repository audit currently permits ten exact paths containing custom dialog
signatures:

- `components/chat/ConversationHistoryModal.tsx`
- `components/chat/ImageLightbox.tsx`
- `components/chat/SystemPromptsModal.tsx`
- `components/documents/DocumentsSidebarSection.tsx`
- `components/documents/WorkspaceFilePickerDialog.tsx`
- `components/search/GlobalSearchPalette.tsx`
- `components/shell/AppShell.tsx`
- `components/tasks/RunTaskContextDialog.tsx`
- `pages/WorkspaceChatPage.tsx`
- `pages/file-manager/file-manager-dialogs.tsx`

These surfaces implement some combination of backdrop dismissal, Escape
handling, focus placement, portal layering, or dialog semantics themselves.
Their product content remains domain-owned; only reusable modal behavior moves
to the primitive layer.

## Scope

- Reproduce the ten-path audit baseline and inventory each overlay's trigger,
  open-state owner, initial focus, close paths, destructive actions, nesting,
  scroll behavior, responsive geometry, and state-preservation requirements.
- Capture focused tests for behavior that exists before changing a surface.
- Classify each surface as ordinary `Dialog`, destructive `AlertDialog`,
  `Dialog` + `Command`, or domain content composed inside an ordinary dialog.
- Migrate one surface at a time through controlled `open`/`onOpenChange` state so
  the current owner retains domain lifecycle control.
- Remove manual window key listeners, backdrop propagation guards, focus code,
  and `aria-modal`/`role="dialog"` declarations made redundant by the primitive.
- Extend a CC-owned primitive only when a concrete migrated surface requires a
  reusable variant. Keep top-aligned, full-viewport, or nested behavior narrow
  and evidence-backed.
- Remove migrated paths from the audit allowlist immediately. Do not replace the
  allowlist with another suppressing category.
- Update the development gallery only for genuinely reusable overlay variants;
  keep domain-only fixtures in their focused tests.

## Required deliverables

- `artifacts/overlay-migration-matrix.md` recording the before/after contract,
  selected primitive, risks, tests, and final disposition for all ten paths.
- Migrated overlay implementations using only CC-owned primitive imports.
- Focused unit/integration/E2E coverage for each behavior category.
- Updated audit rule and negative tests with zero retained custom-dialog paths.
- Updated canonical component guidance if a new approved reusable variant is
  introduced.

## Blockers and dependencies

- Blocked by: None; the completed foundation supplies the primitives and audit.
- Blocks: DSM-002, because overlay migration changes some button/input consumer
  counts and should land before the adoption baseline is frozen.

## Acceptance criteria

- [x] All ten paths have a recorded before/after behavior contract and selected
      CC-owned primitive.
- [x] No production file outside `components/ui/` hand-writes modal semantics,
      backdrop dismissal, focus trapping, or global Escape handling for these
      surfaces.
- [x] The design-system audit's custom-dialog allowlist is empty and a new
      domain `role="dialog"`/`aria-modal="true"` signature fails with actionable
      guidance.
- [x] Every migrated overlay exposes an accessible name; descriptions are
      present or intentionally omitted without runtime accessibility warnings.
- [x] Opening places focus intentionally, Tab/Shift+Tab remain contained when
      modal, closing restores focus to the trigger/owner, and background content
      is not interactable.
- [x] Escape and outside interaction match the documented product contract;
      destructive confirmation cannot be dismissed through an unsafe path.
- [x] Nested overlays, asynchronous content, selection, uploads, search state,
      and navigation callbacks retain their existing lifecycle behavior.
- [x] Light/dark appearance, z-index ordering, scrolling, and 320px/390px
      containment remain correct without a visual redesign.
- [x] Domain code imports no Radix package directly and no duplicate overlay
      primitive is introduced.
- [x] Existing protected Markdown, Milkdown, Monaco, terminal, and file-manager
      behavior is unaffected.

## Completion evidence

- All ten retained paths now compose CC-owned `Dialog` or `AlertDialog`; global
  search remains domain search UI inside `Dialog` so this refactor does not add
  command-palette keyboard behavior.
- The shared dialog gained only an evidence-backed `overlayClassName` seam to
  preserve the first-run notice and workspace-picker stacking contracts.
- The audit reports zero retained custom-dialog paths and keeps its negative
  custom-dialog fixture.
- Focused overlay and primitive tests pass, the complete unit/integration suite
  passes, the design-system Playwright selection passes twice, and full E2E
  passes.

## Verification tests

- Run the design-system audit before the first migration and after each batch;
  verify the allowed path count only decreases.
- For every surface, test role/name, initial focus, Tab containment, focus
  return, Escape, outside interaction, and its primary domain action.
- Add focused cases for nested confirmation, command keyboard navigation,
  async loading, uploads, or file-manager behavior where the surface owns it.
- Exercise all migrated overlays in Default light/dark and at 320px/390px.
- Run `pnpm exec eslint . --fix`, `pnpm lint`, `pnpm typecheck`, affected unit
  tests, the design-system Playwright project twice, full E2E, and
  `pnpm design-system:audit`.
- Build production and confirm no development-only fixture becomes reachable.

## Out of scope

- Redesigning overlay content, navigation, data fetching, or information
  architecture.
- Replacing domain result lists with a generic abstraction solely for reuse.
- Adding Tooltip, Select, or another deferred primitive without an immediate
  need from a migrated overlay.
