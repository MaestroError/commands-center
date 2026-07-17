# Phase 6 Ratchet Recommendation

- Task: [DS-0410](../10-inventory-ratchet.md)

Recommended contributor checks:

- Raw palette occurrences outside tests: **0**, no increase allowed.
- Direct `radix-ui`, `@radix-ui`, or `cmdk` imports outside `components/ui/`: **0**, no increase allowed.
- Inline SVG files: exact allowlist of EX-001, EX-002, and EX-003 only.
- Hardcoded colors outside `styles/globals.css` and the exact EX-004 xterm block: **0**.
- Component-local `dark:` classes: **0**; exclude plain label strings such as `{ dark: "Dark" }`.
- `data-theme` / `data-color-mode` writes: exact allowlist of `lib/appearance.ts`.

Do not enforce a blind total on `cc-*`: the expression matches protected selectors, live compatibility classes, storage keys, and test IDs. Phase 6 should classify exact visual class names, remove only definitions with zero production consumers, and then add a named-class allowlist or per-class no-increase budget. This avoids false positives and unsafe cleanup.
