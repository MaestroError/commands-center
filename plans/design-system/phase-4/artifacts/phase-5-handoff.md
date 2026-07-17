# Phase 5 Handoff

- Produced by: [DS-0412](../12-phase-4-signoff.md)
- Phase 4 palette result: 178 → 0; inline-SVG files: 16 → 3 exact exceptions.

## Recommended order

1. **xterm / EX-004** — `components/terminal/TerminalInstance.tsx`, lines containing the 21 fixed theme/ANSI values. Preserve terminal lifecycle, serialization, fit/attach behavior, and ANSI differentiation; use terminal unit/E2E fixtures.
2. **Milkdown/Crepe / EX-003 + EX-005** — `components/documents/MilkdownDocumentEditor.tsx` and its scoped styles/adapter. Preserve the serialized SVG string, selection, slash menu, readonly behavior, and document serialization; use all Milkdown baselines.
3. **Monaco / EX-005** — Monaco theme registration/options and `MonacoFileEditor.tsx` editor internals. Phase 4 already migrated surrounding dirty/warning chrome; preserve model lifecycle and syntax semantics.
4. **Third-party file-manager bridge** — scoped SVAR/file-manager variables/options. Preserve CC-owned file operations, path validation, selection, and the semantic warning chrome completed in Phase 4.

## Protected fixtures

- `e2e/design-system/markdown-milkdown-baseline.spec.ts`
- workspace/document/file-manager component suites
- `e2e/terminal/global-terminal.spec.ts`
- Monaco mocks/lifecycle tests

Phase 5 must consume semantic theme variables and resolved mode at adapter boundaries; it must not add component-local theme branches or modify portable workspace configuration.
