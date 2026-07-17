# DS-0201 — Freeze the First Primitive-Batch Contract

- Status: Planned
- Phase: [Phase 2](README.md)
- Foundation reference:
  [Phase 2 scope](../../design-system-foundation.md#phase-2--establish-typed-ui-primitives)
- Evidence:
  [adoption matrix](../phase-0/artifacts/component-adoption-matrix.md),
  [downstream reassessment](../phase-0/artifacts/downstream-phase-reassessment.md),
  and [Phase 1 sign-off](../phase-1/artifacts/phase-1-signoff.md)

## Goal

Revalidate the approved first batch against the post-Phase-1 repository and
freeze exact APIs, behavior, dependencies, and Phase 3 consumer expectations
before adding Shadcn or Radix code.

## Context

Phase 0 approved Button, Dialog, AlertDialog, and `cn`. Phase 1 stabilized the
appearance and token contract. The repository still has no `components/ui`
boundary, direct Radix dependency, Shadcn configuration, or local `cn` utility.
`ConfirmDialog`, `DocumentCreateDialog`, and `DocumentFolderDialog` remain the
first planned production consumers, but their migration belongs to Phase 3.

The current dialogs have incomplete focus and keyboard behavior. Their domain
callbacks, validation, loading, dismissal, and visual behavior must be recorded
separately from the accessibility gaps the new primitives are expected to fix.

## Scope

- Re-run the adoption-matrix searches for Button and dialog families.
- Confirm no existing local utility or dependency already satisfies `cn`, CVA,
  Dialog, or AlertDialog requirements.
- Record the exact public API and deliberately excluded API for each primitive.
- Define ordinary-dialog and destructive-alert behavior for focus entry/return,
  Escape, overlay interaction, controlled/uncontrolled state, accessible naming,
  disabled actions, and safe initial focus.
- Record existing public props and domain behavior for the three Phase 3
  consumers without refactoring them.
- Decide which behavior belongs in unit tests and which requires Playwright.
- Confirm the direct-dependency allowlist and the Shadcn Radix-base setup.

## Required deliverables

- `artifacts/batch-1-contract.md` containing the current inventory, approved
  exports, variant/state table, interaction contract, dependency allowlist,
  excluded APIs, and Phase 3 consumer compatibility checklist.
- Focused pre-migration tests only where an existing consumer behavior is not
  currently protected; no expected-failing tests.
- A recorded decision for overlay dismissal in ordinary versus destructive
  dialogs.

## Blockers and dependencies

- Blocked by: Completed Phase 1 and its sign-off.
- Blocks: DS-0202, DS-0203, DS-0204, DS-0205, and DS-0207.

## Acceptance criteria

- [ ] Every proposed export maps to the approved first batch or a demonstrated
      first-batch state.
- [ ] Button variants are limited to current primary, secondary, and danger
      needs; polymorphic `asChild`, loading APIs, and speculative sizes are
      either excluded or justified by a named consumer.
- [ ] Dialog and AlertDialog structural exports are sufficient for the three
      named Phase 3 consumers without embedding domain behavior.
- [ ] Ordinary and destructive overlay/Escape behavior is explicit and
      testable.
- [ ] Existing callback, validation, pending, error, and close behavior for the
      three future consumers is recorded and covered where necessary.
- [ ] `radix-ui`, `class-variance-authority`, `clsx`, and `tailwind-merge` are the
      complete direct-dependency allowlist; any change requires matrix approval.
- [ ] No Phase 2 decision expands into Input, Select, DropdownMenu, Tooltip,
      Switch, Tabs, domain surfaces, Markdown, or editor internals.
- [ ] Phase 3 remains the owner of production consumer migration.

## Verification tests

- Reproduce current `components/ui`, `cn`, Radix, CVA, clsx, and tailwind-merge
  searches.
- Enumerate `cc-button` variants and the three future dialog consumer APIs.
- Run focused existing tests for `ConfirmDialog`, `DocumentCreateDialog`, and
  `DocumentFolderDialog` after any test-only additions.
- Review the contract against every UI-001, UI-008, and UI-009 adoption-matrix
  requirement.

## Out of scope

- Adding dependencies or primitive source files.
- Migrating any production consumer.
- Designing Phase 2 batch 2 or adding a new component family.
