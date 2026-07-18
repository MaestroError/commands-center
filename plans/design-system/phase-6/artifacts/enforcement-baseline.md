# Enforcement Baseline

## Reproducible evidence

| Boundary                                      |                       Baseline | Owner                                   |
| --------------------------------------------- | -----------------------------: | --------------------------------------- |
| Direct Radix imports outside `components/ui/` |                              0 | ESLint `no-restricted-imports`          |
| Raw palette utilities in production TS/TSX    |                              0 | repository audit                        |
| Unapproved inline-SVG files                   | 0; three exact exception paths | repository audit                        |
| Custom dialog-signature files                 |   10 exact legacy/domain paths | repository audit no-new-path ratchet    |
| xterm fixed hex values                        |                             32 | repository audit, EX-004                |
| Monaco fixed syntax foregrounds               |                             10 | repository audit, EX-005                |
| Crepe scoped variables                        |                             22 | repository audit, approved adapter path |
| Fixed-theme bridge bypasses                   |                              0 | repository audit                        |
| `resolvedColorMode` bridge consumers          |                  2 exact paths | repository audit                        |
| Retained visual `cc-*` occurrences            |              per-class maximum | repository audit                        |

Raw-palette matching covers fixed hex/RGB/HSL values and Tailwind palette roles.
The canonical token source `globals.css` and bounded exception adapters are
validated separately rather than hidden behind a blanket directory exemption.

## Exception paths

- EX-001: `components/common/AppLogo.tsx`
- EX-002: `pages/integrations/integration-icons.tsx`
- EX-003: `components/documents/MilkdownDocumentEditor.tsx`
- EX-004: `components/terminal/xterm-theme.ts`
- EX-005: `components/workspace/monaco-theme.ts` and scoped Milkdown/CodeMirror
  syntax behavior

## Rule selection

- ESLint stays the single owner for import boundaries.
- Unit/E2E tests own behavior, accessibility, responsive layout, and appearance.
- The repository audit owns cross-file path allowlists, bounded exception
  counts, bridge bypass patterns, compatibility counts, and documentation links.

The audit must report a rule ID, path, match, approved alternative, and
canonical documentation link for every violation.
