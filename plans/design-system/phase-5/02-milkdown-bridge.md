# DS-0502 — Migrate the Milkdown and Crepe Theme Bridge

- Status: Complete
- Phase: [Phase 5](README.md)
- Foundation reference:
  [Milkdown preservation contract](../../design-system-foundation.md#3-protect-existing-markdown-styles)
- Upstream gate: DS-0501 bridge and fixture contracts

## Goal

Make Milkdown's editable and read-only document surfaces use a deliberate,
scoped CC semantic theme adapter while preserving document data, editor
behavior, and isolation from generic HTML and read-only Markdown styles.

## Context

Milkdown already maps Crepe variables to CC variables beneath
`.milkdown-editor-wrapper`, with additional code and table overrides. This task
normalizes that bridge rather than replacing Milkdown internals with Shadcn,
global typography rules, or `.cc-md`.

## Scope

- Re-run the frozen MILK-01 through MILK-04 fixtures before visual changes.
- Inventory every consumed Crepe variable and editor-specific override.
- Map background, surface, foreground, secondary text, primary action, outline,
  hover, selected, inline code, code area, table, focus, and shape roles to the
  approved CC semantic contract.
- Keep all authored editor CSS scoped beneath `.milkdown-editor-wrapper`.
- Preserve EX-003's `currentColor` SVG-string format for the Crepe menu icon.
- Keep any syntax-specific palette bounded and documented under EX-005.
- Remove redundant or accidental palette values only when the fixture proves
  the semantic replacement.

## Required deliverables

- Updated scoped Milkdown/Crepe theme bridge.
- Focused automated assertions for the bridge variables and generic-style
  isolation where current coverage is insufficient.
- Deterministic MILK-01 through MILK-04 computed-style, containment, and
  behavior assertions for intentional semantic convergence.
- A Milkdown mapping table in the Phase 5 artifacts linking each Crepe role to
  its CC semantic source.

## Blockers and dependencies

- Blocked by: DS-0501.
- Blocks: DS-0506 through DS-0508.

## Acceptance criteria

- [x] MILK-01 through MILK-04 pass before and after the migration, with every
      accepted appearance difference documented.
- [x] Editable and read-only presentation responds to resolved light/dark mode
      through CC semantic values.
- [x] Document serialization, edits, readonly state, cursor/selection, slash
      menu, Workspace file action, code, tables, links, and images remain stable.
- [x] Narrow-width code, table, link, image, menu, and long-token behavior does
      not regress.
- [x] Generic base-element and `.cc-md` rules do not style Milkdown internals.
- [x] No unscoped third-party selector tree is added to global CSS.
- [x] EX-003 remains exact and EX-005 owns every retained syntax-specific value.
- [x] The task changes no chat or read-only Markdown styling.

## Verification tests

- Run the Milkdown appearance suite for MILK-01 through MILK-04 in Default
  light and dark at the frozen wide/narrow viewports.
- Run focused Milkdown component/document tests for editing, readonly,
  serialization, menu insertion, selection, code, image, and table behavior.
- Inspect computed Crepe variables and focus/selection states in both modes.
- Search for `.milkdown` rules outside the approved wrapper and for accidental
  `.cc-md` coupling.
- Run two consecutive deterministic Milkdown appearance passes.

## Out of scope

- Changing `.cc-md` or `.cc-md--chat`.
- Replacing Crepe features, editor nodes, menu behavior, or document storage.
- Applying generic semantic HTML styles inside the editor.
