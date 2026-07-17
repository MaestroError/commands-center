# DS-0104 — Style Headings, Paragraphs, and Document Separators

- Status: Planned
- Phase: [Phase 1](README.md)
- Foundation reference:
  [Phase 1 semantic HTML scope](../../design-system-foundation.md#phase-1--normalize-foundations-without-redesigning-screens)
- Evidence:
  [Semantic HTML impact inventory](../phase-0/artifacts/semantic-html-impact-inventory.md)

## Goal

Give unclassed headings, paragraphs, and horizontal rules a recognizable CC
hierarchy while preserving explicit page and component typography.

## Context

Current production JSX contains many headings and paragraphs, most already
styled by utilities or component classes. Low-specificity defaults must improve
truly bare content without changing those owned contexts.

## Scope

- Define theme-controlled defaults for `h1` through `h6`, `p`, and `hr`.
- Use a compact CC type hierarchy based on the approved font-weight roles and
  Tailwind's existing typography/spacing scales.
- Avoid automatic first/last-child margin tricks that make component layout
  unpredictable.
- Review every currently matched heading/paragraph family identified in Phase 0
  and record intentional changes.

## Required deliverables

- Low-specificity `h1`–`h6`, `p`, and `hr` base rules.
- Expanded semantic fixture and computed-style precedence assertions.
- Reviewed light/dark, desktop/narrow screenshots and an affected-consumer
  sampling record.

## Blockers and dependencies

- Blocked by: DS-0103.
- Blocks: DS-0105 and DS-0108.

## Acceptance criteria

- [ ] Bare `h1`–`h6`, `p`, and `hr` form a coherent hierarchy in both modes.
- [ ] Explicit Tailwind typography and spacing utilities retain precedence.
- [ ] Existing `PageHeader`, panels, forms, empty states, dialogs, and page
      layouts have no unexplained spacing or size changes.
- [ ] Zero-match `h5`, `h6`, and `hr` tags remain represented in the fixture so
      their contract is testable before future use.
- [ ] Markdown and Milkdown baselines remain unchanged.
- [ ] Narrow content wraps without creating new horizontal overflow.

## Verification tests

- Capture semantic typography screenshots in Default light/dark at desktop and
  narrow viewports.
- Assert utility-styled headings and paragraphs retain their expected computed
  size, weight, margin, and color.
- Sample the Phase 0 heading/paragraph consumers across shell, forms, dialogs,
  and domain pages.
- Run application, semantic, Markdown, and Milkdown visual suites twice.

## Out of scope

- A prose plugin or generic rich-text class.
- Markdown typography changes.
- Component-level typography refactors.
