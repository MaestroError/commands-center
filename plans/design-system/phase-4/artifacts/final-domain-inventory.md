# Final Domain Inventory (DS-0410)

- Task: [DS-0410](../10-inventory-ratchet.md)
- Source scope: `packages/frontend/src`, excluding `.test.` files
- Entry commit: `08e83c7`

## Reproduction commands

```bash
rg -o --no-filename --glob '*.{css,ts,tsx}' --glob '!*.test.*' '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}' packages/frontend/src
rg -o -P --no-filename --glob '*.{css,ts,tsx}' --glob '!*.test.*' '(?<!&)#[0-9A-Fa-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(' packages/frontend/src
rg -l --glob '*.tsx' --glob '!*.test.tsx' '<svg' packages/frontend/src
rg -l --glob '*.{ts,tsx}' --glob '!*.test.*' --glob '!**/components/ui/**' 'from "radix-ui"|from "cmdk"|@radix-ui' packages/frontend/src
rg -o --no-filename --glob '*.{css,ts,tsx}' --glob '!*.test.*' 'cc-[a-z0-9-]+' packages/frontend/src
```

## Closure

| Metric                                       | Phase 4 entry | Final | Disposition                                                                    |
| -------------------------------------------- | ------------: | ----: | ------------------------------------------------------------------------------ |
| Raw palette occurrences                      |           178 |     0 | All domain appearance uses semantic theme roles.                               |
| Files with raw palette                       |            23 |     0 | No category/brand search exclusion was added.                                  |
| TSX files with inline `<svg>`                |            16 |     3 | EX-001 AppLogo, EX-002 provider artwork, EX-003 Milkdown serialized SVG.       |
| Direct Radix/`cmdk` outside `components/ui/` |             0 |     0 | Boundary retained.                                                             |
| Hardcoded color occurrences                  |           136 |   136 | 115 in theme definitions; 21 in the xterm Phase 5 bridge.                      |
| `lucide-react` importers                     |            53 |    66 | Expected increase from equivalent glyph migration.                             |
| `cc-*` occurrences                           |           776 |   778 | +2 development-only `cc-panel` gallery wrappers for DropdownMenu and Checkbox. |

## Residual ownership

- `styles/globals.css`: semantic Default light/dark token definitions and scoped compatibility/protected contracts. These values are the theme source of truth, not component bypasses.
- `components/terminal/TerminalInstance.tsx`: 21 fixed xterm/ANSI values, EX-004 and Phase 5.
- `components/common/AppLogo.tsx`: EX-001 product artwork.
- `pages/integrations/integration-icons.tsx`: EX-002 provider artwork and brand colors.
- `components/documents/MilkdownDocumentEditor.tsx`: EX-003 serialized SVG required by the editor integration; the surrounding Milkdown/Crepe appearance bridge is EX-005/Phase 5.

No production component branches on theme ID or resolved mode. `lib/appearance.ts` is the single DOM attribute writer. Metadata categories were neutralized instead of becoming a parallel palette.

## Compatibility classes

The 778 `cc-*` occurrences contain three groups:

1. Protected Markdown: `cc-md` and `cc-md--chat`; frozen and retained.
2. Live visual compatibility APIs: `cc-button*`, `cc-input`, `cc-panel`, `cc-alert`, `cc-tab*`, `cc-badge*`, page-state/logo/navigation helpers. They remain consumed and are deferred to the Phase 6 evidence-based removal review.
3. Nonvisual identifiers/storage keys: chat model, prompt history, recent models, sidebar state, task/specialist keys, and test IDs. These are not CSS debt and must not be counted as removable classes.

No compatibility definition was deleted as a count shortcut.
