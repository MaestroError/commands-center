# Semantic HTML Impact Inventory

Execution record for [DS-0006](../06-semantic-html-impact-inventory.md).

## Reproduction summary

Excluding the Phase 0 fixture itself, direct JSX contains 600 covered semantic
tag matches across 83 files: 57 component files and 26 page files. Counts are
based on literal JSX tags; renderer-generated React Markdown and Milkdown nodes
are recorded separately.

| Family                              |                 Direct match count | Representative current locations                                         | Current ownership                                                                                               | Phase 1 disposition                                                                        |
| ----------------------------------- | ---------------------------------: | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `h1`–`h4`                           |                                110 | `PageHeader`, `AppShell`, auth pages, task/integration pages, `ToolsTab` | Nearly all have explicit utilities; shared headings are component-owned                                         | Add low-specificity defaults, preserve explicit computed results through utilities         |
| `h5`, `h6`                          |                                  0 | Renderer output and Phase 0 fixture only                                 | Browser default when generic                                                                                    | Adopt global fallback                                                                      |
| `p`                                 |                                389 | Broadly across pages/common/domain components                            | 368 carry props/classes; 21 literal bare paragraphs rely on inheritance/default margins                         | Add base typography/rhythm; audit bare occurrences first, preserve component-owned spacing |
| `ul`, `li`                          |                             14 / 8 | API, skills, settings, document picker/view, search select, todo dock    | Explicit layout utilities often suppress or replace ordinary list behavior                                      | Base markers/indentation only when not overridden; verify nested/listbox-like structures   |
| `ol`                                |                                  0 | Renderer output and fixture only                                         | Browser default when generic                                                                                    | Adopt global fallback                                                                      |
| `a`                                 |                                  1 | `QuickInspectorSurface`; most navigation uses `NavLink`                  | Explicit component styling                                                                                      | Add fallback link style; preserve navigation/components                                    |
| `blockquote`                        |                                  0 | React Markdown and Milkdown output                                       | Protected/scoped renderers                                                                                      | Isolate `.cc-md` and Milkdown; generic blockquotes adopt fallback                          |
| Table family                        | 2 tables, 28 section/row/cell tags | Task run detail; `Markdown` wrapper                                      | Task table has explicit utilities; Markdown table path is renderer-owned but currently not produced without GFM | Generic tables adopt fallback; task table utilities and `.cc-md` remain stronger           |
| `hr`                                |                                  0 | React Markdown and fixture                                               | Protected reader or browser default                                                                             | Generic rules adopt fallback; `.cc-md hr` unchanged                                        |
| `pre`, `code`                       |                            18 / 26 | API/settings/task/activity code surfaces; `Markdown`                     | Mix of explicit utilities, one bare `pre`, 11 literal bare `code` children, protected reader                    | Add safe inherited mono/overflow fallback; preserve specialized code blocks and `.cc-md`   |
| `kbd`, `samp`                       |                              2 / 0 | Search palette and app header shortcuts                                  | `kbd` explicitly styled; `samp` absent                                                                          | Preserve `kbd` utilities; generic fallback for both                                        |
| `strong`                            |                                  2 | Endpoint and search UI                                                   | One bare, one explicitly composed; renderer output separate                                                     | Adopt fallback weight/color without changing component layout                              |
| `em`, `small`, `mark`, `del`, `ins` |                                  0 | Renderer output and fixture only                                         | Browser defaults when generic                                                                                   | Adopt restrained CC fallback where useful                                                  |
| React Markdown nodes                |                            Dynamic | Shared `Markdown` component                                              | `.cc-md` and `.cc-md--chat` component layer                                                                     | Preserve current computed result; base must lose in cascade                                |
| Milkdown/Crepe nodes                |                            Dynamic | `MilkdownDocumentEditor`                                                 | Crepe styles plus `.milkdown-editor-wrapper` bridge                                                             | Isolate from base and migrate only through Phase 5 bridge                                  |

`h1`–`h4` total is 6/70/31/3. The literal JSX search found no production
`h5`, `h6`, `ol`, `blockquote`, `caption`, `hr`, `samp`, `em`, `small`, `mark`,
`del`, or `ins`; they still belong in the fallback contract because generic
HTML and renderers can emit them.

## Intended Phase 1 changes

Only these generic fallback changes are pre-approved:

1. Unclassed headings gain a visible hierarchy, theme color, line-height, and
   predictable vertical rhythm.
2. Unclassed paragraphs gain readable line-height and adjacent-block spacing.
3. Ordinary lists gain indentation, visible markers, nested rhythm, and
   narrow-width wrapping.
4. Generic links gain accent color, underline/focus treatment, and wrapping.
5. Generic blockquotes, rules, code/preformatted text, keyboard/sample output,
   emphasis, and edit/highlight tags gain restrained CC treatments.
6. Generic tables gain caption, header, cell border/surface, alignment, and a
   deliberate narrow-width strategy.
7. Long tokens and preformatted content no longer expand a generic content
   surface beyond the viewport.

Changes to explicit component utilities, page layout, `.cc-md`, Milkdown,
Monaco, xterm, provider branding, or domain interaction visuals are regressions
unless separately reviewed.

## Current comparison baseline

The `surface=semantic` fixture renders all covered tags with no classes inside
one layout wrapper. At 390px its content has a 328px client width and a 615px
scroll width; the containing panel grows to 639px. The long token is the primary
content overflow signal. Headings currently share almost identical size/weight,
lists lose clear indentation/markers, and the table has minimal browser-default
structure. These are intended Phase 1 improvements.

The same fixture suite separately captures `.cc-md` at the same viewports.
Markdown itself remains 378px wide with no fixture-level overflow. The app
header has a separate existing 512px overflow recorded in the application
manifest and must not be mistaken for semantic-content overflow.

Assertion owner:
`e2e/design-system/markdown-milkdown-baseline.spec.ts` verifies semantic
surfaces, representative elements, theme roles, and desktop/mobile containment.

## Cascade contract

Lowest to highest intended authority:

1. Tailwind `@layer base` reset and semantic fallbacks, using low-specificity
   `:where(...)` selectors where useful.
2. `.cc-md` component-layer selectors and scoped third-party bridge selectors.
3. CC component classes such as `cc-panel`, `cc-button`, and future
   `components/ui` styles.
4. Explicit Tailwind utilities at component/call-site level.

No layer uses `!important` to win routine precedence. Milkdown, Monaco, xterm,
and other third-party surfaces require explicit isolation or bridge selectors;
their internal DOM is not a generic-HTML styling target.

## Rollout order

1. Inherited font/color/background, selection, focus, and safe reset behavior.
2. Headings and paragraphs, with assertions for the 21 literal bare paragraphs
   plus representative component-owned headings.
3. Lists and links, separating document lists from menu/listbox structures.
4. Tables, pre/code, quotations, rules, and the remaining inline elements, with
   explicit overflow tests.

Each step must compare generic semantic snapshots, protected Markdown, and the
application baselines before the next step begins.

## Exact searches

```bash
rg -n --glob '*.tsx' --glob '!**/DesignSystemBaselinePage.tsx' '<(h[1-6]|p|ul|ol|li|a|blockquote|table|thead|tbody|tr|th|td|caption|hr|pre|code|kbd|samp|strong|em|small|mark|del|ins)(\s|>)' packages/frontend/src
rg -n --glob '*.{css,tsx}' 'cc-md|milkdown-editor-wrapper|\.milkdown|\.editor' packages/frontend/src
```

The first command currently returns 600 matches in 83 files. The second returns
66 bridge/selector references including the Phase 0 fixture.
