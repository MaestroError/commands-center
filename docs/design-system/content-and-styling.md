# Content and Styling Boundaries

## Tailwind and semantic tokens

Tailwind is the default styling tool. Use its layout and responsive utilities
directly. Theme-dependent values must use the semantic roles exported from
`styles/globals.css`, for example:

```tsx
export function StatusNote() {
  return (
    <aside className="rounded-lg border border-warning-border bg-warning-surface p-4 text-warning-foreground">
      Review the pending change.
    </aside>
  );
}
```

The role families cover application/surface, text, border/divider, accent,
focus/selection, success, warning, danger, info, note, badge, chat, and terminal
base colors. Theme-controlled shape and emphasis use the CSS variables
`--radius-*` and `--font-weight-*`. Tailwind remains responsible for ordinary
spacing, sizing, layout, and breakpoints.

Do not add component-local hex/RGB/HSL values or raw Tailwind palette utilities
for application roles. If no semantic role fits, first determine whether the
value is a missing reusable role, a product-semantic category, or a registered
exception.

## Unclassed semantic HTML

Generic `h1`–`h6`, `p`, `ul`, `ol`, `li`, `dl`, `blockquote`, `pre`, `code`,
`kbd`, `table`, `hr`, `small`, `mark`, `ins`, `del`, links, and images receive
low-specificity CC defaults. Explicit Tailwind utilities and component classes
continue to win. Use unclassed content when markup should naturally look like
CC-authored document content.

Keep each generic element target, its `[class]` guard, and protected-surface
exclusions inside the same `:where(...)` wrapper. Multi-element targets use
`:is(...)` inside `:where(...)` so the shared exclusions still apply to every
element. Combinators may connect zero-specificity wrappers; only behavior
pseudo-classes such as `:focus-visible` and pseudo-elements such as `::marker`
remain outside. The design-system audit enforces this source contract.

These rules live in the `cc-semantic` cascade layer, explicitly ordered after
Tailwind's `base`/Preflight layer and before `components` and `utilities`. This
lets zero-specificity CC defaults replace Preflight while keeping every
component class and explicit utility authoritative.

## Protected Markdown

Rendered chat, task, and activity Markdown uses the shared `Markdown`
component and `.cc-md`; chat adds `.cc-md--chat`. These are protected visual
contracts. Generic element rules explicitly exclude them. Do not restyle them
through page-level generic selectors or replace them with unclassed HTML.

## Milkdown

Milkdown/Crepe is a separate editable document surface. It is scoped below
`.milkdown-editor-wrapper`, consumes CC semantic CSS variables, and preserves
its editor behavior and serialization. Never approximate Milkdown with generic
HTML in a regression fixture, and do not let global element selectors enter its
scope.

## Third-party bridges

- Monaco receives `cc-default-light` or `cc-default-dark` through
  `monaco-theme.ts`.
- xterm receives semantic base colors plus the bounded EX-004 ANSI palette
  through `xterm-theme.ts`.
- Milkdown receives scoped Crepe variables from `globals.css`.
- The file manager is currently CC-owned React UI and needs no third-party
  adapter.

Only the mounted Monaco and xterm owners consume `resolvedColorMode`. Bridge
modules do not read browser storage, media queries, or root attributes.

## Authored CSS boundary

CSS outside Tailwind is appropriate only for:

- theme declarations and Tailwind semantic mappings;
- low-specificity generic element rules;
- complex selector/state behavior Tailwind cannot express clearly;
- protected Markdown/Milkdown contracts;
- approved third-party bridges; or
- retained compatibility definitions with an audit ratchet.

Page-specific CSS trees and new `cc-*` compatibility consumers are not part of
the supported direction.
