# Theme Authoring and Verification

## Theme and color mode are separate

A theme owns complete light and dark semantic values plus shared shape and
emphasis. A color-mode preference is `light`, `dark`, or `system`; the resolved
mode applied to the DOM is only `light` or `dark`.

The current root contract is:

```html
<html data-theme="default" data-color-mode="dark" style="color-scheme: dark"></html>
```

`Default` is the only registered theme. `cc.color-mode` is device-local UI
state. Resolved mode is derived and never persisted. A future selected theme
and user-authored theme assets must live in portable workspace files, not only
SQLite or browser storage.

## Required theme declaration

Each theme must provide complete light and dark values for:

- application, primary/elevated/disabled/sidebar surfaces;
- primary/secondary/muted/disabled/inverse/link text;
- border, strong border, divider, focus ring, and selection;
- accent base/hover/active/surface/border/on-accent;
- success, warning, danger, and info base/surface/border/foreground/on-color;
- note and neutral badge roles;
- chat user/agent foreground/surface/border;
- terminal base foreground/background; and
- shared `--radius-*`, `--font-weight-*`, and surface shadow roles.

ANSI and syntax palettes are controlled exception categories, not semantic
application roles.

## Hypothetical second-theme dry run

Do not add the theme during Phase 6. When product work authorizes it, the theme
touches only these architecture locations:

1. Add the stable ID and display metadata to the appearance registration module
   derived from `packages/frontend/src/lib/appearance.ts`.
2. Add complete `[data-theme="<id>"][data-color-mode="light|dark"]`
   declarations to `packages/frontend/src/styles/globals.css`.
3. Add portable workspace schema/storage for the selected theme and any
   user-provided declarations/assets. This is required before Profile can offer
   more than `Default`.
4. Add token-completeness, migration, provider, gallery, bridge, and E2E tests.

Component implementations, common compositions, generic content rules,
Markdown, Milkdown, Monaco, xterm, and file-manager components do not change.
The current one-option theme selection is intentionally constant until the
portable selection feature is implemented; CSS alone must not expose a partial
production theme.

## Verification checklist

- Run `pnpm design-system:audit` and token-contract unit tests.
- Exercise explicit light/dark and both `system` transitions.
- Review unclassed HTML and protected `.cc-md`/`.cc-md--chat` separately.
- Verify Milkdown editing/serialization and Monaco/xterm live switching.
- Review semantic states, focus, contrast, and 320px/390px containment in the
  development gallery.
- Build production and confirm the gallery route/data are absent.
- Confirm selected-theme configuration and custom assets survive copying the
  workspace to a fresh installation.

No component may branch on a theme ID or resolved mode to choose visual
classes. Bridge consumers may use resolved mode only through their approved
adapters.
