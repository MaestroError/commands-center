# DS-0501 — Accept the Phase 4 Handoff and Freeze Bridge Contracts

- Status: Complete
- Phase: [Phase 5](README.md)
- Foundation reference:
  [Phase 5 scope](../../design-system-foundation.md#phase-5--complete-third-party-theming)
- Required predecessor: DS-0412 Phase 4 sign-off and Phase 5 handoff

## Goal

Turn the completed Phase 4 tree into an exact, testable contract for each real
third-party theme bridge before any bridge implementation changes.

## Context

The current known tree has a scoped Milkdown/Crepe palette in `globals.css`, a
forced Monaco `vs-dark` theme, and a hardcoded xterm theme object. It has
CC-owned file-manager UI but no installed SVAR consumer. Phase 4 may change
paths and counts, so these are planning inputs, not implementation truth.

## Scope

- Read the Phase 4 sign-off and `artifacts/phase-5-handoff.md`.
- Re-run dependency, import, fixed-theme, hardcoded-color, CSS-variable, and
  bridge-selector searches on the live tree.
- For each surface, map CC semantic roles to the exact third-party API fields or
  scoped CSS variables that consume them.
- Separate semantic base roles from bounded syntax/ANSI palettes.
- Freeze production files, fixture files, behavior tests, visual states, and
  task ownership for DS-0502 through DS-0505.
- Confirm how mounted third-party instances observe resolved appearance changes
  without independently reading or persisting user preferences.
- Reconcile EX-003, EX-004, and EX-005 with actual consumers.

## Required deliverables

- `artifacts/live-bridge-inventory.md` with dependencies, consumers, paths,
  values, selectors/APIs, current mode behavior, and task owners.
- `artifacts/bridge-contract.md` with semantic mappings, adapter boundaries,
  update mechanism, lifecycle rules, and prohibited coupling per surface.
- `artifacts/fixture-contract.md` with deterministic content, states,
  viewports, behavior assertions, and capture order per surface.
- Updated exception dispositions for EX-003 through EX-005 where the live tree
  differs from Phase 0.

## Blockers and dependencies

- Blocked by: DS-0412 and its completed sign-off/handoff artifacts.
- Blocks: DS-0502 through DS-0508.

## Acceptance criteria

- [x] Every real bridge consumer has an exact path and one task owner.
- [x] Every bridge field is classified as CC-semantic, bounded syntax/ANSI,
      third-party structural, or nonvisual.
- [x] Monaco and xterm fixture content and behavior assertions are defined
      before their fixed themes may change.
- [x] Milkdown fixture reuse names MILK-01 through MILK-04 and the relevant
      behavior assertions explicitly.
- [x] The file-manager disposition is based on real post-Phase-4 dependencies
      and consumers; absence does not authorize installing SVAR.
- [x] Mounted-instance update behavior, listener ownership, cleanup, and no-
      recreation requirements are explicit for Monaco and xterm.
- [x] No adapter reads a second preference store or persists resolved mode.
- [x] Cross-task file overlap is absent or ordered explicitly.

## Verification tests

- Re-run the Phase 4 handoff commands and compare paths/counts to its artifact.
- Search package manifests and imports for Milkdown, Monaco, xterm, SVAR, and
  assistant-ui dependencies and consumers.
- Search source and CSS for fixed editor themes, hardcoded bridge colors, Crepe
  variables, `.monaco-editor`, `.xterm`, and file-manager bridge selectors.
- Review every mapping against the approved semantic token inventory and
  current appearance provider contract.

## Out of scope

- Editing bridge source, fixtures, dependencies, or theme tokens.
- Choosing final syntax or ANSI colors without EX-004/EX-005 review.
- Creating speculative adapters for absent third-party consumers.
