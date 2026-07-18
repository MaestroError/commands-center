# Final Phase 5 Exception Register

- **EX-003:** `MilkdownDocumentEditor.tsx` retains the Crepe-required SVG
  string with `currentColor`. No fixed artwork color was added.
- **EX-004:** `xterm-theme.ts` owns exactly 16 normal/bright ANSI roles for
  each resolved mode (32 values). Base background, foreground, cursor, cursor
  accent, and selection are not exceptions; they read CC semantic variables.
  Unit tests enforce 4.5:1 contrast and desktop/mobile browser assertions cover
  every rendered ANSI role in light and dark.
- **EX-005:** `monaco-theme.ts` owns five syntax token rules per resolved mode
  (10 values). Milkdown/CodeMirror retains only third-party syntax behavior;
  its chrome is fully semantic. Monaco background, text, selection, focus,
  borders, widgets, line numbers, and diagnostics are not exceptions.

No Phase 5 exception was added. Each retained palette is bounded to a protocol
or syntax role and verified in Default light and dark.
