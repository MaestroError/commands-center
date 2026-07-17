# DS-0005 — Capture Markdown and Milkdown Baselines

- Status: Complete
- Phase: [Phase 0](README.md)
- Foundation reference:
  [Protect the existing Markdown styles](../../design-system-foundation.md#3-protect-the-existing-markdown-styles)

## Goal

Freeze the current read-only Markdown visual contract and record Milkdown's
current editing behavior and appearance before generic HTML styles or theme
bridges change.

## Context

All current React Markdown output passes through the shared `Markdown` component
and receives `.cc-md`; chat adds `.cc-md--chat`. These reader styles must not
change incidentally.

Milkdown is an editable Crepe surface with its own DOM, focus, selection, menus,
code editing, and scoped theme variables. It should later use CC semantic tokens,
but it must not inherit `.cc-md` or generic base-element styling. Milkdown's
preservation contract protects content and editing behavior while allowing only
reviewed visual convergence with the design system.

## Scope

Create deterministic fixtures covering:

- Reader and chat Markdown headings, paragraphs, nested ordered/unordered lists,
  links, strong/emphasis, inline code, fenced code, blockquotes, tables,
  horizontal rules, images, and long unbreakable content.
- `.cc-md` and `.cc-md--chat` at narrow and wide widths in the current light and
  dark modes that will become the `Default` theme's protected palettes.
- Milkdown paragraphs, headings, lists, links, inline and fenced code, tables,
  images, cursor and selection states, slash/block menus, readonly mode, and
  narrow-width overflow.
- Milkdown Markdown serialization before and after representative edits.

Prefer existing product routes with deterministic API fixtures. Add the smallest
development/test-only fixture surface only if existing routes cannot expose the
required states reliably; do not build the full component gallery in this task.

## Required deliverables

1. Create `artifacts/markdown-milkdown-baseline-manifest.md` describing fixture
   content, current source mode, future `Default` mapping, viewports, expected
   behaviors, screenshot paths, and serialization assertions.
2. Add focused Playwright tests under
   `packages/frontend/e2e/design-system/markdown-milkdown-baseline.spec.ts`.
3. Commit reviewed screenshots for reader Markdown, chat Markdown, and Milkdown.
4. Add or extend focused tests that assert Milkdown edits preserve the expected
   Markdown data and that read-only mode rejects editing.
5. Record the current scoped selectors and theme variables that distinguish
   `.cc-md`, `.cc-md--chat`, and `.milkdown-editor-wrapper`.

## Blockers and dependencies

- Blocked by: DS-0001 and DS-0002.
- Blocks: DS-0007, Phase 1 global semantic styles, and Phase 5 Milkdown theming.

## Acceptance criteria

- [x] Every required Markdown element appears in the deterministic fixture.
- [x] Reader and chat variants are separately captured in current light and dark
      modes at narrow and wide widths and mapped to `Default`.
- [x] Task/activity reader output and chat output are confirmed to use the
      shared `.cc-md` contract.
- [x] Milkdown is captured in current light and dark modes with representative
      editing, selection, menu, readonly, table, code, image, and overflow
      states.
- [x] `modern` is not treated as a protected Markdown or Milkdown contract.
- [x] Milkdown serialization assertions prove representative edits preserve the
      expected Markdown data.
- [x] The fixture proves that reader selectors and Milkdown selectors remain
      separate.
- [x] Nondeterministic cursor blinking, selection timing, and editor startup are
      controlled.
- [x] Two consecutive visual verification runs produce no screenshot diffs.
- [x] No existing Markdown or Milkdown visual change is introduced while
      establishing the baseline.

## Verification tests

Generate the reviewed baselines once:

```bash
pnpm --filter @cc/frontend exec playwright test e2e/design-system/markdown-milkdown-baseline.spec.ts --update-snapshots
```

Then run twice without updating:

```bash
pnpm --filter @cc/frontend exec playwright test e2e/design-system/markdown-milkdown-baseline.spec.ts
pnpm --filter @cc/frontend exec playwright test e2e/design-system/markdown-milkdown-baseline.spec.ts
```

Run focused and full frontend checks:

```bash
pnpm --filter @cc/frontend exec vitest run src/components/chat/Markdown.test.tsx src/pages/DocumentsPage.test.tsx
pnpm --filter @cc/frontend typecheck
pnpm --filter @cc/frontend lint
pnpm exec prettier --check plans/design-system/phase-0/artifacts/markdown-milkdown-baseline-manifest.md packages/frontend/e2e/design-system/markdown-milkdown-baseline.spec.ts
```

Manually compare reader and chat screenshots with the current application and
exercise Milkdown keyboard input, selection, slash-menu opening, and readonly
mode before approval.

## Out of scope

- Restyling `.cc-md` or `.cc-md--chat`.
- Applying generic base-element styles.
- Migrating Milkdown to new semantic tokens.
- Replacing Milkdown controls with Shadcn components.
