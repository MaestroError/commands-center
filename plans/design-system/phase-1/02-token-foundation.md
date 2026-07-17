# DS-0102 — Complete Semantic Tokens and Normalize Compatibility Styles

- Status: Planned
- Phase: [Phase 1](README.md)
- Foundation reference:
  [Phase 1 token scope](../../design-system-foundation.md#phase-1--normalize-foundations-without-redesigning-screens)
- Evidence:
  [Current-system inventory](../phase-0/artifacts/current-system-inventory.md) and
  [target appearance contract](../phase-0/artifacts/target-appearance-contract.md)

## Goal

Create one complete, theme-controlled semantic token contract for existing CC
styles while preserving the current Default light/dark direction.

## Context

The current 22 color tokens cover basic surfaces and states but do not provide
complete foreground/surface/border/on-color roles. Shape and emphasis are
embedded in classes. Some `cc-*` states use raw palette utilities or ambiguous
contrast values. Phase 2 primitives and generic HTML must not build on that
incomplete vocabulary.

## Scope

- Add only the demonstrated semantic color, shape, and emphasis roles approved
  in the appearance contract.
- Consolidate CSS variables and Tailwind v4 `@theme` mappings into one canonical
  naming contract.
- Preserve current values or provide explicit compatibility aliases before
  changing consumers.
- Normalize existing `cc-*` foundation classes to semantic utilities/tokens.
- Correct documented focus-ring, disabled-state, status on-color, and contrast
  gaps without redesigning component composition.
- Keep Tailwind responsible for spacing, layout, breakpoints, and ordinary
  sizing.
- Record any unavoidable visual adjustment with its affected baseline and
  accessibility rationale.

## Required deliverables

- The complete Default token definitions and Tailwind v4 semantic mappings.
- Updated foundation-level `cc-*` compatibility styles.
- A machine-checked required-token manifest or equivalent completeness test.
- `artifacts/token-foundation-record.md` mapping old roles to canonical roles,
  listing retained aliases, and recording approved visual/accessibility changes.

## Blockers and dependencies

- Blocked by: DS-0101.
- Blocks: DS-0103, DS-0104, DS-0105, DS-0106, and DS-0108.

## Acceptance criteria

- [ ] Every approved semantic role has complete Default light and dark values.
- [ ] Shared radius and font-weight roles stay within the bounded Phase 0 list.
- [ ] Every CSS variable consumed by Tailwind has one traceable canonical
      definition or compatibility alias.
- [ ] Existing `cc-*` classes no longer require raw Tailwind palette colors for
      foundation-level states.
- [ ] Focus-visible treatments are clear in both modes and do not depend on
      mouse-only interaction.
- [ ] Status and accent combinations use appropriate foreground/on-color roles
      in both modes.
- [ ] No token encodes page layout, feature state, arbitrary spacing, or z-index
      ownership.
- [ ] `.cc-md`, `.cc-md--chat`, Milkdown, Monaco, xterm, and registered
      exceptions are not silently remapped.
- [ ] Every reviewed visual difference is recorded; all other Phase 0
      application baselines remain stable.

## Verification tests

- Add a token-completeness test that fails when a required Default role is
  missing from either resolved mode.
- Search for undefined CSS-variable consumers and duplicate canonical token
  definitions.
- Exercise normal, hover, active, disabled, focus-visible, success, warning,
  danger, and information states in the application baseline.
- Manually review focus and contrast in light and dark; use automated contrast
  checks where the rendered state can be measured reliably.
- Run frontend unit tests plus the application, Markdown, and Milkdown visual
  baselines twice without unexplained updates.

## Out of scope

- Migrating every domain raw-palette call site; Phase 4 owns the 179-match
  ratchet.
- Adding speculative tokens without a current consumer.
- Component API changes or Shadcn/Radix primitives.
- Third-party syntax, ANSI, Monaco, xterm, or Milkdown palette work.
