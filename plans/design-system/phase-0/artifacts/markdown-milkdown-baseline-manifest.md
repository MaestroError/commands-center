# Markdown and Milkdown Baseline Manifest

Execution record for [DS-0005](../05-markdown-and-milkdown-baselines.md).

## Ownership contract

| Surface            | Current owner                                               | Protected boundary                                                     | Future theme behavior                                       |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| Read-only Markdown | Shared `Markdown` component plus `.cc-md`                   | Keep renderer, selectors, and computed result unchanged                | Consume `Default` light/dark token values or aliases        |
| Chat Markdown      | Shared `Markdown` plus `.cc-md--chat`                       | Keep the reader contract and accent-heading variant unchanged          | Same resolved token contract as reader Markdown             |
| Milkdown documents | `LazyMilkdownEditor`, Crepe, and `.milkdown-editor-wrapper` | Protect editing/data behavior; review visual bridge changes explicitly | Map scoped Crepe variables to CC semantic tokens in Phase 5 |
| Generic HTML       | Future low-specificity base layer                           | Must not be used to implement Markdown or Milkdown presentation        | Adopt theme-aware defaults in Phase 1                       |

Task and activity readers call the same shared `Markdown` component as other
read-only contexts. Chat adds `cc-md--chat`; it does not own a second Markdown
renderer.

## Deterministic content

The Markdown fixture includes all heading levels used by the current reader,
paragraphs, strong/emphasis, links, inline and fenced code, blockquotes, nested
ordered/unordered lists, table syntax, a horizontal rule, a data-URI image, and
a long unbreakable token.

The Milkdown fixture includes headings, paragraphs, lists, strong/emphasis,
links, inline code, a fenced TypeScript block, a data-URI image, blockquote,
table, and trailing editable paragraph. Additional tests cover serialization,
read-only state, slash-menu state including the CC `Workspace file` command,
and a selected text range.

## Visual baselines

Current `light` and `dark` become `Default + light` and `Default + dark`.
`modern` is not protected.

| ID      | State                                                    | Viewport/modes                       | Screenshot pattern                                                                                   |
| ------- | -------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| MD-01   | Reader and chat variants side by side/stacked            | 1280 × 900 and 390 × 844; light/dark | `markdown-milkdown-baseline.spec.ts-snapshots/markdown-{mode}-{desktop\|mobile}-chromium-darwin.png` |
| MILK-01 | Editable Crepe document including code, image, and table | 1280 × 900 and 390 × 844; light/dark | `markdown-milkdown-baseline.spec.ts-snapshots/milkdown-{mode}-{desktop\|mobile}-chromium-darwin.png` |
| MILK-02 | Read-only editor                                         | 1280 × 900; light                    | `markdown-milkdown-baseline.spec.ts-snapshots/milkdown-readonly-light-desktop-chromium-darwin.png`   |
| MILK-03 | Slash menu with workspace command                        | 1280 × 900; light                    | `markdown-milkdown-baseline.spec.ts-snapshots/milkdown-slash-menu-light-desktop-chromium-darwin.png` |
| MILK-04 | Selected text range                                      | 1280 × 900; light                    | `markdown-milkdown-baseline.spec.ts-snapshots/milkdown-selection-light-desktop-chromium-darwin.png`  |

Light/dark coverage is applied to the complete stable editor surface. The
read-only, menu, and selection images protect behavior-specific deltas once;
they do not create a redundant palette matrix.

## Behavioral assertions

- The editor root becomes `contenteditable="true"` in editing mode.
- Appending `Phase zero serialization marker` updates the serialized Markdown
  output with that content.
- Read-only mode changes the ProseMirror textbox to
  `contenteditable="false"`.
- Typing `/` in the trailing paragraph exposes the `Workspace file` command.
- Narrow screenshots cover editor overflow after code, image, and table nodes
  initialize.

Cursor blinking and animations are disabled by screenshot options. The suite
runs serially because Crepe is a heavy async editor and parallel instances can
make development-mode initialization timing nondeterministic.

## Current renderer observation

The React Markdown fixture contains GitHub-style table syntax, and dormant
`.md-table` styles plus a `Table` component exist, but the current renderer has
no GFM table plugin. The syntax therefore remains paragraph text and the live
fixture contains zero rendered reader tables. This is recorded current behavior,
not changed during Phase 0. Any future decision to enable GFM tables is a
separate Markdown change and cannot be folded into global HTML work.

The data-URI images, both code blocks, both reader variants, and their
narrow-width wrapping were confirmed in the live DOM. `.cc-md` content stayed
within its 378px mobile fixture width.

## Verification

```bash
pnpm --filter @cc/frontend exec playwright test e2e/design-system/markdown-milkdown-baseline.spec.ts --project=chromium
pnpm --filter @cc/frontend exec vitest run src/components/chat/Markdown.test.tsx src/pages/DocumentsPage.test.tsx
```

No production Markdown or Milkdown style was changed while establishing these
fixtures.
