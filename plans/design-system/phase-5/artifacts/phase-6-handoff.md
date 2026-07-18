# Phase 6 Handoff

- Approved adapters: `monaco-theme.ts`, `xterm-theme.ts`,
  `theme-css-values.ts`, and the scoped Crepe block in `globals.css`.
- Appearance consumers: `MonacoFileEditor.tsx` and `TerminalInstance.tsx` use
  `resolvedColorMode`; Milkdown uses CSS inheritance only.
- Fixtures: `third-party-bridges.spec.ts`,
  `markdown-milkdown-baseline.spec.ts`, `global-terminal.spec.ts`, focused
  Monaco/xterm unit tests, and theme-contract tests.
- Exceptions: EX-003 currentColor SVG, EX-004 32 ANSI values, EX-005 10 Monaco
  syntax values.
- No-op: no third-party file-manager consumer exists.
- Enforcement source: [Phase 6 bridge ratchets](phase-6-bridge-ratchets.md).

Phase 6 should document these boundaries and automate the exact zero/bounded
checks without broadening theme IDs, persistence, or third-party adapters.
