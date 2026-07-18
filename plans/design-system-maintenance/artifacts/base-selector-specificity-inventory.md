# Semantic Base-Selector Specificity Inventory

Status: Complete. Frozen from `packages/frontend/src/styles/globals.css` on
2026-07-19 and verified against the normalized implementation.

## Contract and notation

The inventory uses CSS specificity tuples `(IDs, classes/attributes/pseudo-
classes, elements/pseudo-elements)` and the following exact abbreviations:

- `E` = `:not([class])`
- `P` = `:not(.cc-md *):not(.milkdown-editor-wrapper *):not(.monaco-editor *):not(.xterm *)`
- `L` = `:not(ul[class] *):not(ol[class] *)`
- `D` = `:not(dl[class] *)`

`P`, `L`, and `D` remain match exclusions; only their position changes. The
mechanical mapping is `:where(T) E P X` to `:where(T E P X)`. This preserves the
same rightmost subject and ancestry conditions while reducing the element-
targeting compound to `(0,0,0)`. `::marker` remains `(0,0,1)`. The global focus
rule is unchanged: its element list is zero-specificity and `:focus-visible`
contributes `(0,1,0)`.

For comma-separated `T`, the implementation writes `:where(:is(T) E P X)` so
the shared exclusions apply to every target. `:is(...)` remains zero-specificity
because it is contained by `:where(...)`.

## Selector map

|   # | Category          | Target `T` and extra exclusion `X`                             | Old form                                   | New form                                   | Old specificity | New specificity | Verification owner                                |
| --: | ----------------- | -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | --------------- | --------------- | ------------------------------------------------- |
|   1 | Link              | `a`, with `E` already inside the old `:where`                  | `:where(a E) P`                            | `:where(a E P)`                            | `(0,4,4)`       | `(0,0,0)`       | Phase 1 semantic cascade and Markdown-link checks |
|   2 | Heading family    | `h1, h2, h3, h4, h5, h6`                                       | `:where(T) E P`                            | `:where(T E P)`                            | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|   3 | Heading size      | `h1`                                                           | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|   4 | Heading size      | `h2`                                                           | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|   5 | Heading size      | `h3`                                                           | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|   6 | Heading size      | `h4`                                                           | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|   7 | Heading size      | `h5, h6`                                                       | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|   8 | Paragraph         | `p`                                                            | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|   9 | Paragraph rhythm  | adjacent `p` subjects                                          | two canonical compounds                    | two zero-specificity compounds             | `(0,10,8)`      | `(0,0,0)`       | Semantic computed-style matrix                    |
|  10 | Separator         | `hr`                                                           | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  11 | List layout       | `ul, ol`                                                       | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix and containment    |
|  12 | List marker style | `ul`                                                           | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  13 | List marker style | `ol`                                                           | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  14 | List item         | `li`, `X = L`                                                  | `:where(T) E P L`                          | `:where(T E P L)`                          | `(0,7,6)`       | `(0,0,0)`       | Semantic and classed-list exclusion checks        |
|  15 | List marker       | `li`, `X = L`, plus `::marker`                                 | old list-item compound plus pseudo-element | new list-item compound plus pseudo-element | `(0,7,7)`       | `(0,0,1)`       | Semantic marker-color check                       |
|  16 | Description list  | `dl`                                                           | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  17 | Description term  | `dt`, `X = D`                                                  | `:where(T) E P D`                          | `:where(T E P D)`                          | `(0,6,5)`       | `(0,0,0)`       | Semantic and classed-description-list checks      |
|  18 | Description value | `dd`, `X = D`                                                  | `:where(T) E P D`                          | `:where(T E P D)`                          | `(0,6,5)`       | `(0,0,0)`       | Semantic and classed-description-list checks      |
|  19 | Quote             | `blockquote`                                                   | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  20 | Code block        | `pre`                                                          | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic style and containment checks             |
|  21 | Monospace family  | `code, kbd, samp`                                              | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  22 | Inline code       | `:not(pre) > code`; the parent condition stays inside `:where` | `:where(:not(pre) > code) E P`             | `:where(:not(pre) > code E P)`             | `(0,5,4)`       | `(0,0,0)`       | Inline-versus-block code checks                   |
|  23 | Keyboard input    | `kbd`                                                          | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  24 | Table             | `table`                                                        | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic style and containment checks             |
|  25 | Caption           | `caption`                                                      | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  26 | Header cell       | `th`                                                           | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  27 | Table cells       | `th, td`                                                       | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  28 | Table footer      | `tfoot`                                                        | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  29 | Small text        | `small`                                                        | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  30 | Highlight         | `mark`                                                         | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  31 | Insertion         | `ins`                                                          | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  32 | Deletion          | `del`                                                          | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic computed-style matrix                    |
|  33 | Image             | `img`                                                          | canonical                                  | canonical                                  | `(0,5,4)`       | `(0,0,0)`       | Semantic style and containment checks             |

## Protected and precedence owners

- `.cc-md` and `.cc-md--chat`: protected-content Playwright reader/chat
  variants plus the Phase 1 Markdown-link cascade assertion.
- Milkdown/Crepe: mounted light/dark, edit/read-only, serialization, selection,
  slash-menu, and narrow-containment checks.
- Monaco and xterm: mounted bridge and terminal suites; `P` excludes their
  internal descendants before declarations are considered.
- Explicit utilities and component classes: Phase 1 cascade controls plus new
  classed list/table/description-list controls.
- Narrow layouts: semantic surfaces at 320px and 390px, with table, code,
  image, long-word, and page containment assertions.

No declaration, token, existing Tailwind layer order, combinator,
pseudo-element, or protected scope is approved to change in DSM-004. The
implementation finding below records the one required interposed semantic
layer.

## Implementation finding

The first computed-style run proved that pure zero-specificity rules cannot
replace Tailwind Preflight type selectors inside the same `base` layer:
Preflight's `h1`, `a`, `ul`, `ol`, and `small` rules have `(0,0,1)` specificity.
The implementation therefore declares the explicit order `theme, base,
cc-semantic, components, utilities` and owns these defaults in `cc-semantic`.
This preserves existing Tailwind layer order, places CC defaults immediately
after Preflight, keeps components/utilities authoritative, and allows the
semantic selectors themselves to remain `(0,0,0)`.
