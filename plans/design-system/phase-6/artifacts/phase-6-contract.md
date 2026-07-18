# Phase 6 Enforcement Contract

- Reproduced from the live tree after Phase 5 commit `e0dc907b`.
- Canonical contributor documentation: `docs/design-system/`.
- Historical phase artifacts remain evidence, not contributor instructions.

## Approved implementation boundaries

- Theme and color-mode state: `packages/frontend/src/lib/appearance.ts`,
  `stores/ui-store.ts`, `context/ThemeProvider.tsx`, and
  `styles/globals.css`.
- Generic semantic HTML and protected `.cc-md`/`.cc-md--chat` rules:
  `styles/globals.css`.
- CC-owned primitives: the twelve modules in
  `packages/frontend/src/components/ui/`. Radix imports remain confined there
  by ESLint.
- Common compositions: `components/common/` plus the two document dialogs.
- Bridge adapters: `theme-css-values.ts`, `monaco-theme.ts`, `xterm-theme.ts`,
  and the scoped `.milkdown-editor-wrapper` CSS block.
- Development gallery: `/__design-system-baseline`, registered only behind
  `import.meta.env.DEV`.

## Frozen enforcement baseline

- Direct Radix imports outside `components/ui/`: zero; ESLint owns this rule.
- Raw Tailwind palette utilities in production TS/TSX: zero.
- Inline SVG source files: exactly AppLogo (EX-001), integration icons
  (EX-002), and Milkdown's serialized SVG (EX-003).
- xterm fixed ANSI values: 32 (EX-004).
- Monaco fixed syntax values: 10 (EX-005).
- Crepe semantic variables: 22, scoped below `.milkdown-editor-wrapper`.
- `resolvedColorMode` bridge consumers: only `MonacoFileEditor.tsx` and
  `TerminalInstance.tsx`.
- `assistant-ui` and SVAR: absent from the manifest, lockfile consumer graph,
  and live imports.

## Task ownership and order

| Task    | Primary files                                                              | Sequence             |
| ------- | -------------------------------------------------------------------------- | -------------------- |
| DS-0602 | `docs/design-system/README.md`, `components.md`, `content-and-styling.md`  | after 0601           |
| DS-0603 | `docs/design-system/themes.md`, `exceptions.md`, theme dry-run artifact    | after 0601           |
| DS-0604 | `AGENTS.md`, `CONTRIBUTING.md`, root `README.md`, consistency artifact     | after 0602/0603      |
| DS-0605 | gallery source/tests and fixture manifest                                  | after 0601           |
| DS-0606 | `scripts/design-system-audit*`, root package scripts, audit register       | after 0601           |
| DS-0607 | `globals.css`, five `cc-button-primary` consumers, compatibility artifacts | after 0606           |
| DS-0608 | `.github/workflows/ci.yml`, aggregate command, workflow artifact           | after 0604/0606/0607 |
| DS-0609 | sign-off and maintenance artifacts plus plan statuses                      | last                 |

## Completion evidence

Each task must update its own status only after its documented acceptance and
verification checks pass. DS-0609 owns the final cross-repository commands and
foundation-plan closure.
