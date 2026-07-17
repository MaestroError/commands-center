# DS-0006 — Inventory Semantic HTML Impact

- Status: Complete
- Phase: [Phase 0](README.md)
- Foundation reference:
  [Give unclassed HTML a global CC appearance](../../design-system-foundation.md#2-give-unclassed-html-a-global-cc-appearance)

## Goal

Identify every current application context that could change when low-specificity
global CC styles are added for unclassed semantic HTML, and define which changes
will be intentional in Phase 1.

## Context

The design system will style ordinary `h1`–`h6`, `p`, lists, links, tables,
rules, code, quotations, and related tags globally through `@layer base`.
Existing JSX may rely on browser defaults, explicit Tailwind utilities,
component selectors, Markdown selectors, or third-party editor CSS. A global
rollout without an impact inventory could alter spacing, markers, overflow, or
component layout unexpectedly.

The base layer is a fallback only. Explicit utilities, component styles,
`.cc-md`, and scoped third-party bridges must continue to win.

## Scope

Audit current uses of:

- `h1` through `h6`, `p`, `ul`, `ol`, `li`, and `a`.
- `blockquote`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, and `caption`.
- `hr`, `pre`, `code`, `kbd`, `samp`, `strong`, `em`, `small`, `mark`, `del`,
  and `ins`.
- Semantic elements emitted by React Markdown, Milkdown, and known third-party
  surfaces.

For each occurrence or bounded family, record whether it is unclassed, partially
styled, fully owned by a component, protected by `.cc-md`, or scoped to a
third-party bridge.

## Required deliverables

Create `artifacts/semantic-html-impact-inventory.md` with:

1. A table containing element/family, locations, current owner, current classes
   or selectors, inherited styles, layout sensitivity, and responsive risk.
2. A Phase 1 disposition for each row: adopt global fallback, preserve current
   computed result, explicitly override in the component layer, or isolate as a
   third-party surface.
3. An intended-change list that clearly distinguishes approved future changes
   from regressions.
4. A cascade contract documenting the expected precedence of base styles,
   `.cc-md`, Milkdown/third-party styles, component classes, and Tailwind
   utilities.
5. The exact searches and match counts used to reproduce the audit.
6. A recommended order for Phase 1 rollout: inheritance/colors, headings and
   paragraphs, lists, then tables/code/remaining elements.

## Blockers and dependencies

- Blocked by: DS-0001 and DS-0002.
- Blocks: DS-0007 and all Phase 1 global-element implementation tasks.

## Acceptance criteria

- [x] Every semantic element in the foundation coverage list is represented,
      even when no current application match exists.
- [x] Every current JSX match is mapped directly or through a clearly bounded
      component/renderer family.
- [x] Unclassed and partially styled occurrences are distinguishable from
      component-owned occurrences.
- [x] `.cc-md`, `.cc-md--chat`, Milkdown, and third-party surfaces have explicit
      isolation requirements.
- [x] Each current occurrence has one Phase 1 disposition.
- [x] Every intended future visual change is listed explicitly; unlisted visual
      differences remain regressions.
- [x] Utility and component overrides are required to beat the base layer
      without `!important`.
- [x] Narrow-width list, table, code, link, and long-token risks are recorded.
- [x] The rollout order is small enough for separate reviewable changes.

## Verification tests

Record and rerun searches covering direct JSX and renderer-owned semantic HTML:

```bash
rg -n --glob '*.tsx' '<(h[1-6]|p|ul|ol|li|a|blockquote|table|thead|tbody|tr|th|td|caption|hr|pre|code|kbd|samp|strong|em|small|mark|del|ins)(\s|>)' packages/frontend/src
rg -n --glob '*.{css,tsx}' 'cc-md|milkdown-editor-wrapper|\.milkdown|\.editor' packages/frontend/src
```

Add a deterministic comparison fixture in the DS-0005 visual test or a focused
Phase 0 test that renders the same semantic content as unclassed HTML and as
`.cc-md`. Before Phase 1 it records the starting point; after Phase 1 it must
prove that only the generic case adopts the fallback.

Run:

```bash
pnpm exec prettier --check plans/design-system/phase-0/artifacts/semantic-html-impact-inventory.md
pnpm --filter @cc/frontend typecheck
pnpm --filter @cc/frontend lint
```

Manually inspect at least one occurrence of each matched element family at
narrow and wide widths.

## Out of scope

- Adding the global base styles.
- Changing `.cc-md`, Milkdown, or third-party CSS.
- Refactoring page markup solely to simplify the inventory.
- Defining optional document/prose container APIs.
