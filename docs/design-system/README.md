# CC Design System

This is the contributor source of truth for styling CommandsCenter. The design
system is the live CC implementation—not the generated reference project and
not the historical phase plans.

## Choose the smallest correct layer

1. Use semantic HTML first when browser behavior is sufficient. Unclassed
   headings, paragraphs, lists, tables, code, and separators already inherit CC
   theme styling.
2. Use Tailwind for layout, spacing, sizing, breakpoints, typography placement,
   and ordinary states.
3. Use semantic utilities such as `bg-surface`, `text-text-primary`,
   `border-border`, and `text-danger` for theme-dependent roles. Do not use a
   raw palette value as an application role.
4. Use an existing module from `@/components/ui/*` when accessible behavior or
   a shared visual API already exists.
5. Use an existing `@/components/common/*` composition when several primitives
   form one repeated product interaction.
6. Keep behavior-rich domain UI in its domain unless the same shape has at
   least two real consumers.
7. Author CSS only for tokens, generic base rules, complex selectors/states,
   protected content, third-party bridges, or temporary compatibility rules.

## Common decisions

| Need                                                       | Use                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| Page/grid/flex spacing                                     | Tailwind utilities                                         |
| Theme-aware color, border, radius, or emphasis             | CC semantic token or semantic Tailwind utility             |
| Plain prose/list/table supplied as HTML                    | Unclassed semantic HTML                                    |
| Rendered chat/task/activity Markdown                       | Protected `Markdown` / `.cc-md` API                        |
| Editable document content                                  | `LazyMilkdownEditor` and its scoped bridge                 |
| Button, input, dialog, menu, tabs, switch, checkbox        | Existing CC-owned UI primitive                             |
| Confirm, password, searchable selection, page state/header | Existing common composition                                |
| Monaco or xterm appearance                                 | Existing scoped adapter; never component-local theme logic |
| Product/brand/syntax/ANSI exception                        | Follow [the exception workflow](exceptions.md)             |

## Theme ownership

`Default` is the only supported theme. `light`, `dark`, and `system` are
color-mode preferences, not themes. Components consume semantic roles and must
not branch on theme ID or resolved mode to choose visual classes. See
[themes.md](themes.md).

## Required checks

```bash
pnpm design-system:audit
pnpm lint
pnpm typecheck
pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium
```

The audit is a debt ratchet, not a replacement for interaction, accessibility,
responsive, or visual inspection tests.

## Detailed guidance

- [Components and interaction ownership](components.md)
- [Content and styling boundaries](content-and-styling.md)
- [Theme authoring and verification](themes.md)
- [Exception request and retirement workflow](exceptions.md)
