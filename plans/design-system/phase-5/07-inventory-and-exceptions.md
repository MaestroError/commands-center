# DS-0507 — Close Bridge Inventories and Exception Ownership

- Status: Complete
- Phase: [Phase 5](README.md)
- Foundation reference:
  [Phase 5 scope](../../design-system-foundation.md#phase-5--complete-third-party-theming)
- Upstream gates: DS-0502 through DS-0506

## Goal

Account for every third-party theme value, adapter, selector, dependency, and
exception after implementation, and produce enforceable boundaries for Phase 6.

## Context

A visually passing bridge can still leave duplicate fixed themes, obsolete
selectors, undocumented syntax/ANSI values, direct preference reads, or unused
adapters. Phase 6 needs exact searches and approved paths, not prose-only rules.

## Scope

- Re-run DS-0501's bridge inventory and compare all changes.
- Classify every remaining hardcoded bridge color, fixed theme ID, third-party
  selector, and theme API assignment.
- Reconcile EX-003, EX-004, and EX-005 with exact paths, owners, values/roles,
  rationale, mode behavior, and verification.
- Confirm no speculative SVAR or assistant-ui dependency/adapter was added.
- Identify approved bridge modules/selectors and formulate Phase 6 ratchets for
  new direct values, imports, preference reads, and unscoped selectors.
- Remove only obsolete bridge code made unused by Phase 5.

## Required deliverables

- `artifacts/final-bridge-inventory.md` with before/after counts and exact
  dispositions.
- `artifacts/final-exception-register.md` with EX-003 through EX-005 status and
  any newly approved exception.
- `artifacts/phase-6-bridge-ratchets.md` with reproducible commands, approved
  paths/patterns, expected counts, and false-positive handling.
- Updated dependency/consumer and adapter ownership documentation.

## Blockers and dependencies

- Blocked by: DS-0502 through DS-0506.
- Blocks: DS-0508 and Phase 6 enforcement work.

## Acceptance criteria

- [x] Every residual hardcoded third-party color or fixed theme ID has one exact
      semantic, syntax/ANSI, structural, or exception disposition.
- [x] EX-004 lists the complete retained xterm ANSI palette and verification for
      both resolved modes.
- [x] EX-005 separates bounded Monaco/Milkdown syntax colors from semantic
      editor chrome and owns every retained syntax-specific value.
- [x] EX-003 remains limited to the Crepe-required SVG-string format using
      `currentColor`.
- [x] No unused bridge, duplicate preference read, theme persistence path, or
      obsolete fixed-theme value remains.
- [x] No SVAR/assistant-ui dependency or bridge exists without a real consumer.
- [x] Proposed Phase 6 ratchets pass on the final tree and fail against a small
      documented forbidden-value/import fixture or equivalent proof.
- [x] Counts are not reduced by hiding values behind vague CSS variables.

## Verification tests

- Run all DS-0501 inventory commands and compare before/after artifacts.
- Search for hardcoded colors, fixed Monaco/xterm themes, Crepe variables,
  direct appearance-store reads, third-party selectors, and bridge imports.
- Run dependency and unused-code checks relevant to affected packages.
- Execute each proposed Phase 6 ratchet and verify its documented negative case.

## Out of scope

- Broad Phase 6 documentation or CI implementation.
- Removing approved syntax/ANSI palettes merely to reach zero matches.
- Cleaning unrelated pre-existing styles or dependencies.
