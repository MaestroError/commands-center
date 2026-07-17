# Phase 4 Exception Addendum

- EX-001 — `components/common/AppLogo.tsx`: CommandsCenter product artwork. Fixed artwork colors are intentionally not theme state. Verify logo visibility in application light/dark baselines.
- EX-002 — `pages/integrations/integration-icons.tsx`: provider-owned artwork and brand colors only. Generic card, status, focus, warning, and dialog chrome uses semantic CC roles. Verify with provider connection flows.
- EX-003 — `components/documents/MilkdownDocumentEditor.tsx`: SVG serialized as a string for editor insertion. Verify document image insertion/serialization and protected Milkdown baselines.
- EX-004 — `components/terminal/TerminalInstance.tsx`: 21 fixed xterm/ANSI color values, owned by Phase 5. Verify terminal lifecycle and ANSI fixture before/after bridge work.
- EX-005 — Milkdown/Monaco syntax/editor internals and scoped adapters, owned by Phase 5. Verify protected editor fixtures; no Phase 4 domain code was granted this exception.

No new exception was added in Phase 4. Integration metadata tags were moved to neutral semantic badges rather than registered as category-color exceptions.
