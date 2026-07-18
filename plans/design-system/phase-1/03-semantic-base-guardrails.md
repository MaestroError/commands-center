# DS-0103 — Add Semantic Base Guardrails and Inherited Defaults

- Status: Complete
- Phase: [Phase 1](README.md)
- Foundation reference:
  [Phase 1 semantic HTML scope](../../design-system-foundation.md#phase-1--normalize-foundations-without-redesigning-screens)
- Evidence:
  [Semantic HTML impact inventory](../phase-0/artifacts/semantic-html-impact-inventory.md)

## Goal

Establish a low-specificity, theme-aware base layer and prove its boundaries
before adding visible element-specific typography.

## Context

Global element selectors can accidentally outrank utilities, alter component
internals, or leak into Markdown and third-party editors. This first semantic
batch establishes ownership and cascade behavior with the smallest visible
change possible.

## Scope

- Put generic defaults in Tailwind's `@layer base` with deliberately low
  specificity.
- Normalize inherited font, primary text color, link color/decoration,
  selection, and form-font behavior for ordinary application HTML.
- Define explicit isolation or component-layer precedence for `.cc-md`,
  `.cc-md--chat`, Milkdown, Monaco, xterm, and other scoped surfaces.
- Prove explicit Tailwind utilities and component classes override base rules.
- Update the semantic fixture and affected assertions only for intentional
  differences.

## Required deliverables

- The initial low-specificity semantic base layer and documented protected
  boundaries.
- Cascade fixtures/tests covering base, utility, component, Markdown, and
  editor contexts.
- Updated semantic assertions plus an execution note in the Phase 1 artifacts
  recording intentional computed-style differences.

## Blockers and dependencies

- Blocked by: DS-0102.
- Blocks: DS-0104 and DS-0108.

## Acceptance criteria

- [ ] Base selectors consume only semantic tokens and live in `@layer base`.
- [ ] Unclassed text and links respond to Default light/dark modes.
- [ ] Explicit utilities and `cc-*` component styles win without `!important`.
- [ ] Reader/chat Markdown computed styles and behavior remain unchanged.
- [ ] Milkdown behavior and reviewed computed output remain unchanged.
- [ ] Monaco, xterm, native controls, and third-party surfaces show no accidental
      inherited color or typography regressions.
- [ ] No blanket descendant reset is introduced inside application components.

## Verification tests

- Add a cascade fixture containing unclassed elements beside utility-styled and
  component-styled equivalents.
- Assert representative computed font and color values for base, utility, and
  protected contexts in both modes.
- Run semantic, Markdown, and Milkdown appearance tests at desktop and narrow widths
  twice without unexplained diffs.
- Manually inspect link focus, visited-state policy, native controls, and
  protected editor surfaces.

## Out of scope

- Heading, paragraph, list, table, code, and quote spacing or typography.
- GFM Markdown support.
- Rewriting component markup to use different semantic tags.
