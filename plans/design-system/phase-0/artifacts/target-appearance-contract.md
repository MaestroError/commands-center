# Target Appearance Contract

- Task: [DS-0002](../02-target-appearance-contract.md)
- Source inventory: [Current design-system inventory](current-system-inventory.md)
- Decision date: 2026-07-17
- Status: Approved for Phase 1 planning

## Vocabulary and type model

```ts
type ThemeId = "default";
type ColorModePreference = "light" | "dark" | "system";
type ResolvedColorMode = "light" | "dark";
```

- **Theme** is the high-level visual declaration. It owns a complete light
  palette, a complete dark palette, and mode-independent visual-character
  tokens.
- **Color-mode preference** is the operator's display choice. It is explicit
  light/dark or follows the operating system.
- **Resolved color mode** is the only mode applied to CSS. `system` is never a
  palette.
- **Default** is the only initial theme. Components must not branch on its name.

## Resolution state table

| Preference | OS mode | Resolved mode |
| ---------- | ------- | ------------- |
| `light`    | light   | light         |
| `light`    | dark    | light         |
| `dark`     | light   | dark          |
| `dark`     | dark    | dark          |
| `system`   | light   | light         |
| `system`   | dark    | dark          |

When `system` is selected, a `prefers-color-scheme: dark` media-query change
must update the resolved mode immediately. Explicit light/dark preferences must
ignore operating-system changes.

## DOM contract

The root element exposes independent attributes:

```html
<html data-theme="default" data-color-mode="dark" style="color-scheme: dark"></html>
```

- `data-theme` contains a high-level theme ID.
- `data-color-mode` contains only a resolved `light` or `dark` value.
- `color-scheme` matches the resolved mode for native controls.
- The persisted preference remains application state and is not encoded as a
  CSS selector.

Default CSS selector structure:

```css
:root,
[data-theme="default"][data-color-mode="light"] {
  /* Default light tokens */
}

[data-theme="default"][data-color-mode="dark"] {
  /* Default dark tokens */
}
```

`data-theme="light"`, `data-theme="dark"`, and `data-theme="modern"` are legacy
selectors and must not remain after migration.

## Initialization lifecycle

Phase 1 should apply appearance before React mounts and before the page becomes
visible:

1. Read `cc.color-mode`.
2. If absent, inspect and migrate the legacy `cc.theme` value.
3. If neither exists, use `system`.
4. Resolve `system` through `matchMedia("(prefers-color-scheme: dark)")`.
5. Set `data-theme="default"`, `data-color-mode`, and `color-scheme` before the
   application module runs.
6. ThemeProvider adopts the initialized values without rewriting the first
   frame to another mode.
7. Subscribe to media-query changes while the preference is `system`; clean up
   the listener when it changes or the provider unmounts.

The implementation may use a small pre-React bootstrap in `index.html` or an
equally early external script. The observable requirement is no avoidable
wrong-mode flash, not a particular script shape.

## Persistence decision

| State                                         | Initial persistence                             | Rationale                                                               |
| --------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Color-mode preference                         | Device-local `localStorage` key `cc.color-mode` | `system` and display preference are device/browser specific and UI-only |
| Resolved mode                                 | Not persisted                                   | Derived from preference and current OS state                            |
| Selected theme                                | Constant `default` initially                    | Persisting a one-option value adds no useful state                      |
| Future selected theme                         | Workspace-portable configuration file           | Profile-level configured state must survive moving the workspace        |
| Future user-provided theme definitions/assets | Workspace files                                 | Required by the Portable Workspace Rule                                 |

SQLite must not become the only source of truth for future theme definitions or
selection. Browser storage must not become the only source of truth for a future
Profile-level theme choice. Phase 1 does not need a backend or filesystem setting
for `ThemeId` while `default` is the only valid value.

## Legacy migration

Run migration only when `cc.color-mode` does not already contain a valid value.

| Legacy `cc.theme` | New theme | New preference | Reason                                           |
| ----------------- | --------- | -------------- | ------------------------------------------------ |
| `light`           | `default` | `light`        | Preserve current appearance                      |
| `dark`            | `default` | `dark`         | Preserve current appearance                      |
| `modern`          | `default` | `dark`         | Modern is dark-like and is intentionally removed |
| Missing/invalid   | `default` | `system`       | New default follows the device                   |

After successful migration, remove `cc.theme`. Invalid `cc.color-mode` values
fall back to `system` without throwing.

Removal includes:

- `modern` from the current union and UI choices.
- `[data-theme="modern"]` and its palette.
- Test fixtures and assertions that present modern as supported.
- Header/Profile wording that calls light/dark "themes".
- Current `ThemeContextValue` shape that exposes one conflated value.

## Token schema

### Mode-specific semantic color roles

Every theme must provide light and dark values for:

- Application canvas, primary surface, elevated surface, sidebar surface, and
  overlay/backdrop.
- Primary, secondary, muted, disabled, inverse, and link text.
- Border, strong border, divider, focus ring, selection, and disabled surface.
- Accent foreground/surface/border plus hover, active, and on-accent values.
- Success, warning, danger, and information foreground/surface/border/on-color
  sets.
- Note/callout foreground/surface/border roles.
- Badge/status neutral and semantic roles.
- Chat user/agent surfaces and appropriate foreground/border values.
- Reader code and terminal base foreground/background/cursor/selection roles.

ANSI colors and syntax-highlight token colors are separate controlled palettes.
They may be theme-provided but are not substitutes for semantic application
roles.

### Mode-independent theme roles

The initial bounded set may include:

- `--radius-surface`
- `--radius-control`
- `--radius-field`
- `--radius-badge`
- `--radius-pill`
- `--radius-code`
- `--font-weight-heading`
- `--font-weight-control`
- `--font-weight-badge`
- `--font-weight-note`

Component-role treatments may combine those tokens with semantic color roles.
For example, badges may use `--radius-badge` and `--font-weight-badge`, while
their state color comes from the resolved palette.

Theme tokens must not encode page layout, feature behavior, arbitrary spacing
scales, z-index ownership, or selector trees. Tailwind remains the source for
ordinary spacing, sizing, breakpoints, and layout.

## Current-token mapping

| Current token        | Default target                       | Decision                                                      |
| -------------------- | ------------------------------------ | ------------------------------------------------------------- |
| `--app-bg`           | Application canvas                   | Keep values for light/dark                                    |
| `--surface`          | Primary surface                      | Keep values for light/dark                                    |
| `--surface-elevated` | Elevated surface                     | Keep values for light/dark                                    |
| `--sidebar-bg`       | Sidebar surface                      | Keep values for light/dark                                    |
| `--border`           | Default border                       | Keep; add strong/divider roles only where evidence requires   |
| `--text-primary`     | Primary text                         | Keep                                                          |
| `--text-secondary`   | Secondary text                       | Keep; add muted/disabled/inverse roles                        |
| `--accent*`          | Accent base/hover/active             | Keep; add surface/border/on-accent completeness               |
| `--selection`        | Selection                            | Keep                                                          |
| `--focus-ring`       | Focus ring                           | Keep                                                          |
| `--success*`         | Success roles                        | Expand to foreground/surface/border/on-color                  |
| `--warning`          | Warning roles                        | Expand to foreground/surface/border/on-color                  |
| `--danger*`          | Danger roles                         | Expand to foreground/surface/border/on-color                  |
| `--info`             | Information roles                    | Expand to foreground/surface/border/on-color                  |
| `--chat-user`        | Chat user surface                    | Keep; add foreground/border if needed                         |
| `--chat-agent`       | Chat agent surface                   | Keep; add foreground/border if needed                         |
| `--terminal-bg`      | Reader code/terminal base background | Keep current reader contract; split terminal bridge if needed |
| `--terminal-fg`      | Reader code/terminal base foreground | Keep current reader contract; split terminal bridge if needed |

No current light/dark value is removed without a documented alias or deliberate
reviewed replacement. Current modern values are not mapped because modern is not
a protected target.

## UI responsibility

### Header

- Presents `Light`, `Dark`, and `System` as a single-choice menu.
- Describes the control as color mode or appearance, not theme.
- Shows the selected preference; resolved mode may be available to assistive
  text when `system` is selected.
- Uses an accessible menu/radio pattern from the approved component matrix.

### Profile

- Owns high-level theme selection.
- Initially shows `Default` as the selected and only available theme without
  implying that light/dark are themes.
- Does not duplicate the header's color-mode control.
- Future options select complete validated themes only.

## Consumer boundary

- Tailwind semantic utilities resolve through the active CSS variables.
- CC-owned UI primitives consume semantic utilities/tokens.
- Shadcn source is adapted to the same contract; it does not introduce a second
  palette or radius system.
- Generic HTML consumes low-specificity semantic base rules.
- `.cc-md` keeps its protected component-layer contract and current computed
  output.
- Milkdown, Monaco, xterm, and file-manager surfaces use scoped adapters.
- No component checks `theme === "default"`, `mode === "dark"`, or equivalent to
  choose its visual classes. The root contract performs that selection.

## Future-theme registration

A future theme is selectable only when it provides:

1. A stable ID and display metadata.
2. Complete light and dark semantic color roles.
3. Complete required shared theme roles.
4. Validation proving no required token is missing.
5. Contrast, focus, responsive, Markdown isolation, and third-party bridge
   verification.
6. Workspace-portable definitions/assets if it is user-configured.

Adding a theme must not require editing component implementations.

## Phase 1 verification scenarios

- Legacy light, dark, modern, missing, invalid, and already-migrated storage.
- All six preference/OS combinations in the state table.
- Live system-light to system-dark and system-dark to system-light transitions.
- Explicit light/dark ignoring OS transitions.
- Root attributes and `color-scheme` matching the resolved mode.
- No avoidable wrong-mode flash on initial load.
- Header preference selection and persistence.
- Profile showing only `Default` as the high-level theme.
- `modern` absent from selectors, choices, and supported types.
- Token-completeness checks for Default light/dark/shared roles.
- Existing Markdown computed visuals unchanged in both modes.

## Approval record

- Product requirements incorporated: Default-only theme, separate
  light/dark/system control, Profile theme ownership, modern removal.
- Portable Workspace decision incorporated: future theme configuration is
  workspace-backed; device color mode remains local UI state.
- Approved default for a new/no-legacy installation: `system`.
- Approved legacy modern mapping: `Default + dark`.
