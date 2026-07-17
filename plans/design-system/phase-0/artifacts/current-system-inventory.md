# Current Design-System Inventory

- Task: [DS-0001](../01-current-system-inventory.md)
- Source plan: [CC Design System Foundation](../../../design-system-foundation.md)
- Inventory date: 2026-07-17
- Scope: `packages/frontend/src`

## Summary

CC currently has one global CSS entry point, three palette selectors, 22
semantic color properties, 17 production `cc-*` visual class families, a large
Tailwind utility surface, and several custom interactive implementations. The
codebase does not currently contain Shadcn, Radix, assistant-ui, or SVAR
dependencies or application imports.

The current theme model conflates palette, color scheme, UI selection, and
persistence in one `ThemeName = "light" | "dark" | "modern"` value. Milkdown
has a scoped CC variable bridge. Monaco is fixed to `vs-dark`; xterm uses a fixed
dark palette. The file-manager UI is currently CC-owned React code rather than a
SVAR bridge.

Repository search counts at inventory time:

| Concern                                         | Matches |      Files |
| ----------------------------------------------- | ------: | ---------: |
| Raw Tailwind palette tokens                     |     179 |         25 |
| Hex/RGB/HSL literals                            |      82 |          3 |
| TSX files containing inline `<svg>`             |      16 |         16 |
| Files importing `lucide-react`                  |      52 |         52 |
| Unique `cc-*` names, including storage/test IDs |      38 |          — |
| Production visual `cc-*` class families         |      17 | 1 CSS file |

Counts include tests and CSS definitions unless a row says otherwise. They are
reproducibility signals, not runtime consumer counts.

## Theme and token inventory

Source: `packages/frontend/src/styles/globals.css`.

| Semantic property    | Purpose                      | Tailwind mapping       | Light                 | Dark                    | Modern                  |
| -------------------- | ---------------------------- | ---------------------- | --------------------- | ----------------------- | ----------------------- |
| `--app-bg`           | Application canvas           | `background`, `app-bg` | `#eef2f7`             | `#020817`               | `#07111f`               |
| `--surface`          | Primary surface              | `surface`              | `#ffffff`             | `#0f172a`               | `#101a2b`               |
| `--surface-elevated` | Raised/alternate surface     | `surface-elevated`     | `#f8fafc`             | `#111c33`               | `#162338`               |
| `--sidebar-bg`       | Sidebar surface              | `sidebar`              | `#f6f8fb`             | `#08111f`               | `#0b1627`               |
| `--border`           | Default border               | `border`               | `rgba(15,23,42,.1)`   | `rgba(148,163,184,.18)` | `rgba(167,139,250,.18)` |
| `--text-primary`     | Primary content              | `text-primary`         | `#0f172a`             | `#e2e8f0`               | `#eef2ff`               |
| `--text-secondary`   | Secondary content            | `text-secondary`       | `#475569`             | `#94a3b8`               | `#b8c2df`               |
| `--accent`           | Primary accent               | `accent`               | `#2563eb`             | `#38bdf8`               | `#8b5cf6`               |
| `--accent-hover`     | Accent hover                 | `accent-hover`         | `#1d4ed8`             | `#67e8f9`               | `#a78bfa`               |
| `--accent-active`    | Accent active                | `accent-active`        | `#1e40af`             | `#0ea5e9`               | `#7c3aed`               |
| `--selection`        | Text/row selection           | `selection`            | `rgba(37,99,235,.16)` | `rgba(56,189,248,.18)`  | `rgba(139,92,246,.18)`  |
| `--focus-ring`       | Focus indicator              | `focus-ring`           | `rgba(37,99,235,.3)`  | `rgba(56,189,248,.28)`  | `rgba(168,85,247,.28)`  |
| `--success`          | Success foreground/accent    | `success`              | `#15803d`             | `#10b981`               | `#34d399`               |
| `--success-contrast` | Success contrast             | `success-contrast`     | `#ecfdf5`             | `#ecfdf5`               | `#ecfdf5`               |
| `--warning`          | Warning foreground/accent    | `warning`              | `#b45309`             | `#f59e0b`               | `#fb7185`               |
| `--danger`           | Danger foreground/accent     | `danger`               | `#be123c`             | `#f43f5e`               | `#f43f5e`               |
| `--danger-contrast`  | Danger contrast              | `danger-contrast`      | `#fff1f2`             | `#fff1f2`               | `#fff1f2`               |
| `--info`             | Informational foreground     | `info`                 | `#0f766e`             | `#22d3ee`               | `#38bdf8`               |
| `--chat-user`        | User-message surface         | `chat-user`            | `#dbeafe`             | `#082f49`               | `#312e81`               |
| `--chat-agent`       | Agent-message surface        | `chat-agent`           | `#eff6ff`             | `#172554`               | `#1e293b`               |
| `--terminal-bg`      | Reader code/terminal surface | `terminal-bg`          | `#e2e8f0`             | `#020617`               | `#0b1120`               |
| `--terminal-fg`      | Reader code/terminal text    | `terminal-fg`          | `#0f172a`             | `#cbd5e1`               | `#e2e8f0`               |

Gaps visible from current usage:

- Status roles generally expose one color plus occasional contrast text, not
  complete foreground/surface/border/on-color pairs.
- Radius, typography emphasis, disabled treatment, overlay, note, badge, and
  component-role values are embedded in classes rather than theme tokens.
- `--font-sans` is mapped in Tailwind but is global and not part of the current
  theme selector.
- `:root` aliases the light palette, which participates in the current initial
  render behavior.

## Current appearance-state flow

1. `themeNames` declares `light`, `dark`, and `modern` in
   `packages/frontend/src/stores/ui-store.ts`.
2. `readStoredTheme()` reads `localStorage["cc.theme"]` and falls back to
   `light`.
3. Zustand exposes `theme` and `setTheme`; `setTheme` writes the same key.
4. `ThemeProvider` writes the value directly to `html[data-theme]`.
5. `ThemeProvider` sets `style.colorScheme` to light only for `light`; `dark`
   and `modern` both use dark.
6. `ThemeMenu` in the application header and `ProfilePage` both list and update
   the same theme value.
7. There is no `prefers-color-scheme` listener, separate high-level theme ID,
   resolved mode, or pre-React initialization path.

Relevant tests:

- `stores/ui-store.test.ts`
- `context/ThemeProvider.test.tsx`
- `context/use-theme.test.tsx`
- `components/shell/ThemeMenu.test.tsx`
- `pages/ProfilePage.test.tsx`

## `cc-*` compatibility classes

Source selectors are in `packages/frontend/src/styles/globals.css`. Repository
match counts include definitions and tests.

| Family                  | Repository matches | Current contract                                                    | Representative consumers/tests                                          |
| ----------------------- | -----------------: | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `cc-panel`              |                 79 | Rounded bordered surface with fixed shadow                          | Page sections throughout `pages/`; workspace chat test asserts presence |
| `cc-button`             |                240 | Accent pill button                                                  | Nearly every page and domain component                                  |
| `cc-button-primary`     |                  5 | Call-site alias used with base button; no dedicated global selector | Profile and form actions                                                |
| `cc-button-secondary`   |                151 | Bordered surface button                                             | Header, pages, dialogs                                                  |
| `cc-button-danger`      |                 14 | Danger button                                                       | Confirmations and destructive actions                                   |
| `cc-input`              |                 94 | Elevated rounded field; special select padding                      | Forms, searchable select, dialogs                                       |
| `cc-alert`              |                  5 | Danger-tinted alert                                                 | Error states                                                            |
| `cc-success`            |                  3 | Success-tinted alert                                                | Success states                                                          |
| `cc-badge`              |                  8 | Uppercase pill label                                                | Integrations and statuses                                               |
| `cc-badge-connected`    |                  3 | Success badge state                                                 | Provider/integration state                                              |
| `cc-badge-muted`        |                  4 | Neutral badge state                                                 | Inactive/secondary state                                                |
| `cc-nav-item`           |                  1 | Sidebar/navigation item                                             | Selector currently has little/no literal class use                      |
| `cc-nav-item-active`    |                  5 | Selected navigation state                                           | Shell/navigation                                                        |
| `cc-tab`                |                  5 | Pill tab/control                                                    | Profile theme choices and tab-like controls                             |
| `cc-tab-active`         |                 11 | Gradient selected tab                                               | Profile and tab states                                                  |
| `cc-empty-state`        |                  2 | Dashed empty panel                                                  | Empty pages                                                             |
| `cc-eyebrow`            |                 10 | Accent uppercase label                                              | `PageHeader` and page headings                                          |
| `cc-md` / `cc-md--chat` |             47 / 5 | Protected reader Markdown and chat variant                          | Shared `Markdown` component and tests                                   |

Names such as `cc.theme`, `cc-sidebar-collapsed`, `cc-prompt-history`, and
`cc-first-run-env-notice-dismissed` are storage keys, test IDs, or state keys;
they are not visual compatibility classes. `cc-logo-*` is a small logo-specific
SVG style family and is recorded in the icon inventory.

## Repeated component and interaction inventory

| Pattern family             | Implementations                                                                                                            | Consumers/shape                                        | Existing coverage                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| Buttons and fields         | Repeated native elements with `cc-button*` and `cc-input`; `PasswordInput`                                                 | Broad application use                                  | Page/component tests; no single primitive contract              |
| Page framing/states        | `PageHeader`, `PageStates`                                                                                                 | Shared common compositions                             | Indirect page coverage                                          |
| Confirmations              | `ConfirmDialog` plus page/domain-specific delete/revoke dialogs                                                            | Portaled and inline custom modal shells                | `ConfirmDialog.test.tsx` plus domain tests                      |
| General dialogs/modals     | Chat history/prompts/lightbox, document dialogs, file-manager dialogs, integration dialogs, task context, quick file modal | Multiple custom focus/closing/portal implementations   | Mixed focused tests; no shared dialog contract                  |
| Searchable select/combobox | `SearchableSelect`, `ModelSelector`, global search                                                                         | Custom listbox/menu keyboard logic                     | Focused tests for common/model components                       |
| Composer suggestions       | `FileMentionPopover`, `SlashCommandPopover`, specialist mention implementation                                             | Focus is coordinated with textarea and insertion state | File mention tests and composer/task tests                      |
| Menus                      | `ThemeMenu`, header/shell menus                                                                                            | Custom outside-click and Escape handling               | Theme menu tests; mixed shell coverage                          |
| Tabs                       | `TabBar`, system-prompt tabs, terminal/editor tab bars, inspector tabs                                                     | Ordinary tabs plus behavior-rich close/select surfaces | Common, terminal, editor, layout tests                          |
| Switches/checks            | `Switch`, numerous native checkbox/select controls, API tri-state checkbox                                                 | Custom switch uses raw emerald/muted colors            | No focused `Switch` test; page tests cover many native controls |
| Cards/surfaces/statuses    | `cc-panel`, badges, task/status helpers, inline palette utilities                                                          | Repeated visual roles without typed primitives         | Broad snapshot-free component tests                             |
| Tooltips                   | Mostly `title` attributes and ad hoc labels                                                                                | No shared tooltip primitive                            | No unified contract                                             |

Interactive-role search found custom implementations across 39 files. The
highest-density locations are `TaskTemplateFormPage`, `ApiPage`, `SettingsPage`,
integration dialogs, specialist forms, and document dialogs.

## Hardcoded style inventory

### Raw Tailwind palette utilities

There are 179 raw palette token matches across 25 files. Dominant roles:

| Role                      | Representative locations                                                          | Initial concern                      |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ |
| Warning/modified state    | `CustomToolsPage`, `IntegrationsPage`, file manager, Monaco wrapper, task helpers | Likely semantic warning tokens       |
| Success/connected state   | Settings, task helpers, Switch, AppShell, specialist form                         | Likely semantic success tokens       |
| Error/danger state        | Task helpers, specialist form                                                     | Likely semantic danger tokens        |
| Category/mention identity | Integration helper categories, chat/task mention chips                            | May need intentional category tokens |
| Domain progress/state     | Task board and task UI                                                            | Needs role-level classification      |

No raw teal palette utility appears in the generated count; current teal-like
information color comes from semantic variables. The generated teal design is
not current-state evidence.

### Hardcoded literals

There are 82 hex/RGB/HSL matches across three files:

- `globals.css`: current palettes and a fixed `cc-panel` shadow.
- `TerminalInstance.tsx`: fixed xterm foreground/background, cursor, selection,
  and ANSI colors.
- Character entity values in `TodoDock` are glyphs, not colors.

The xterm ANSI set is a possible intentional exception; its base background,
foreground, cursor, and selection colors are theme-bridge candidates.

## Icon inventory

- 52 files import `lucide-react`.
- 16 TSX files contain inline `<svg>`.
- Inline SVG appears in chat controls, the logo, Markdown copy glyph, media,
  workspace files, integrations, and layout controls.
- `MilkdownDocumentEditor` contains an SVG string because Crepe's menu API
  requires string markup; this is a likely third-party-format exception.
- `AppLogo` is product identity and not automatically replaceable by Lucide.
- `pages/integrations/integration-icons.tsx` contains integration-specific icon
  artwork and requires brand/meaning review.

## Third-party appearance bridges

| Surface        | Current implementation                                                                 | Theme behavior                                                         | Existing tests/gaps                                                                |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Milkdown/Crepe | Scoped variables under `.milkdown-editor-wrapper .milkdown`, plus code/table overrides | Reads CC semantic variables and therefore changes with current palette | Documents page tests mock the editor; no committed visual/editor behavior baseline |
| Monaco         | `theme="vs-dark"` in `MonacoFileEditor`                                                | Fixed dark regardless of CC theme                                      | Component tests mock Monaco; no theme behavior test                                |
| xterm          | Options object with fixed dark base and ANSI palette                                   | Fixed dark regardless of CC theme                                      | Strong lifecycle tests; no CC theme response test                                  |
| File manager   | CC-owned page/components                                                               | Uses many semantic utilities plus warning raw palettes                 | No active SVAR dependency or bridge                                                |
| assistant-ui   | Not present in frontend dependencies or imports                                        | No active surface to bridge                                            | Intended stack differs from current implementation                                 |
| SVAR           | Not present in frontend dependencies or imports                                        | No active surface to bridge                                            | Intended stack differs from current implementation                                 |

## Test coverage observations

- Unit/component tests are extensive, but there are no committed visual
  regression snapshots.
- `Markdown.test.tsx` verifies sanitized rendering and custom code/table
  behavior but not computed visual output.
- Theme store/provider/menu tests cover the current enum and persistence but not
  operating-system resolution.
- Dialogs and menus have uneven focus-trap, focus-return, and keyboard coverage.
- Milkdown behavior is mostly reached through `DocumentsPage` with the lazy
  editor mocked.
- Monaco is mocked in tests; xterm is replaced by a detailed test harness.

## Reproduction commands

```bash
rg -n --glob '*.{css,ts,tsx}' 'data-theme|@theme|--[a-zA-Z0-9-]+:' packages/frontend/src
rg -n --glob '*.{css,ts,tsx}' 'cc-[a-zA-Z0-9_-]+' packages/frontend/src
rg -n --glob '*.{css,ts,tsx}' '(slate|gray|zinc|red|orange|amber|yellow|green|emerald|teal|cyan|blue|indigo|violet|purple|pink|rose)-[0-9]+' packages/frontend/src
rg -n --glob '*.{css,ts,tsx}' '#[0-9a-fA-F]{3,8}|rgb\(|hsl\(' packages/frontend/src
rg -n --glob '*.tsx' '<svg|lucide-react' packages/frontend/src
rg -n --glob '*.tsx' 'role="(dialog|menu|listbox|tablist|switch)"|aria-modal|<select|type="checkbox"' packages/frontend/src
find packages/frontend/src/components -type f \( -iname '*Dialog*.tsx' -o -iname '*Modal*.tsx' -o -iname '*Popover*.tsx' -o -iname '*Select*.tsx' -o -iname '*Tabs*.tsx' -o -iname '*Switch*.tsx' -o -iname '*Checkbox*.tsx' \)
```

## DS-0001 completion record

- Inventory tables completed: Yes.
- Current appearance state traced end to end: Yes.
- Generated design excluded as implementation evidence: Yes.
- Downstream gaps identified without choosing migrations: Yes.
