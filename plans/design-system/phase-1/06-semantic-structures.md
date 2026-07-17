# DS-0106 — Style Tables, Code, and Remaining Semantic Elements

- Status: Planned
- Phase: [Phase 1](README.md)
- Foundation reference:
  [Phase 1 semantic HTML scope](../../design-system-foundation.md#phase-1--normalize-foundations-without-redesigning-screens)
- Evidence:
  [Semantic HTML impact inventory](../phase-0/artifacts/semantic-html-impact-inventory.md)

## Goal

Complete generic HTML coverage for structured and inline content while making
wide tables, preformatted text, and long tokens safe at narrow widths.

## Context

The Phase 0 semantic fixture measures 615px of content inside a 328px box.
Tables, `pre`, code, and long unbroken content are the principal risks. Existing
Markdown table syntax is not rendered as a table and must not be enabled as a
side effect of this task.

## Scope

- Define generic defaults for tables and their sections/cells/captions.
- Define defaults for `pre`, `code`, `kbd`, and `samp` with safe wrapping or
  intentional local scrolling.
- Complete remaining semantic coverage for blockquote and inline emphasis,
  annotation, and edit elements from the Phase 0 inventory.
- Establish an explicit overflow policy for wide tables, code blocks, images,
  links, and unbroken tokens.
- Preserve component tables, reader/chat Markdown, Milkdown, Monaco, and xterm
  ownership.

## Required deliverables

- Generic table, code/preformatted, quotation, and remaining inline semantic
  rules or explicit native/no-style decisions.
- Deterministic fixtures and tests for local scrolling, wrapping, cascade
  precedence, and page-level overflow.
- `artifacts/semantic-rollout-record.md` containing the final element coverage,
  intentional changes, protected boundaries, and updated inventory counts.

## Blockers and dependencies

- Blocked by: DS-0105.
- Blocks: DS-0108.

## Acceptance criteria

- [ ] Every semantic element in the Phase 0 coverage list has a theme-aware
      generic default or an explicit native/no-style decision.
- [ ] Bare tables are readable in both modes and remain usable at narrow widths.
- [ ] Code/preformatted content uses a defined overflow policy without expanding
      the document.
- [ ] Long links and unbroken tokens cannot expand the semantic fixture.
- [ ] Explicit utilities and component table/code styles retain precedence.
- [ ] Markdown still renders the existing table source as plain current output;
      no GFM plugin is added.
- [ ] `.cc-md`, `.cc-md--chat`, Milkdown, Monaco, and xterm baselines remain
      unchanged.
- [ ] The semantic fixture satisfies `scrollWidth <= clientWidth` at 390px.

## Verification tests

- Capture all structured/inline semantic fixtures in light/dark and
  desktop/narrow configurations.
- Assert local overflow behavior for tables and code plus page-level no-overflow.
- Add cascade assertions against existing component-owned tables and code.
- Run semantic, application, Markdown, and Milkdown visual suites twice.
- Re-run the Phase 0 semantic tag inventory and account for any markup changed
  during the phase.

## Out of scope

- Enabling GFM or changing the Markdown parsing pipeline.
- Syntax-highlighting palette changes.
- Monaco, xterm, or Milkdown bridge work.
