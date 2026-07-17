# DS-0604 — Update AGENTS.md and Contributor Entry Points

- Status: Planned
- Phase: [Phase 6](README.md)
- Foundation reference:
  [Success criteria](../../design-system-foundation.md#success-criteria)
- Upstream gates: DS-0602 canonical guide and DS-0603 runbook

## Goal

Make `AGENTS.md`, `CONTRIBUTING.md`, and README direct humans and agents to the
same accurate, enforceable design-system practices and installed frontend stack.

## Context

`AGENTS.md` currently contains only a broad instruction to use theme-influenced
classes and its stack table may describe planned dependencies such as
assistant-ui or SVAR as installed. Phase 6 must replace ambiguity with concise
rules derived from the live implementation while keeping detailed explanations
in `docs/design-system/`.

## Scope

- Update `AGENTS.md` with a focused CC design-system section and links to the
  canonical contributor and theme/exception guides.
- State the mandatory layer/selection rules: Tailwind default, semantic theme
  tokens, unclassed HTML, protected Markdown, CC-owned primitive/common imports,
  Radix boundary, native controls, Lucide icons, scoped bridges, exceptions, and
  compatibility no-new-use policy.
- State that theme additions must not require component implementation changes.
- Audit and correct frontend stack rows against manifests and real consumers;
  do not present assistant-ui, SVAR, or another absent dependency as installed.
- Update `CONTRIBUTING.md` with design-system audit/gallery commands and docs
  entry points.
- Update root README only where its stack summary or documentation index is
  inaccurate/incomplete.
- Remove contradictory or superseded design-system guidance from these entry
  points instead of keeping multiple rules.

## Required deliverables

- Updated `AGENTS.md` design-system rules and accurate frontend stack table.
- Updated `CONTRIBUTING.md` workflow/commands and canonical documentation link.
- Minimal root `README.md` corrections and design-system docs link if required.
- `artifacts/guidance-consistency-review.md` mapping each entry-point statement
  to the live source, canonical docs, or enforcement rule.

## Blockers and dependencies

- Blocked by: DS-0602 and DS-0603.
- Blocks: DS-0608 and DS-0609.

## Acceptance criteria

- [ ] `AGENTS.md` explicitly tells agents how to choose Tailwind, semantic
      tokens, native HTML, CC-owned primitives, compositions, and scoped CSS.
- [ ] `AGENTS.md` explicitly protects `.cc-md`/`.cc-md--chat`, Milkdown scoping,
      and the direct-Radix boundary.
- [ ] `AGENTS.md` forbids new theme-dependent raw palette roles, unapproved
      inline SVG, speculative bridges, and new legacy compatibility consumers.
- [ ] Theme and exception changes point to the verified DS-0603 workflow.
- [ ] Every stack claim matches package manifests and at least one real consumer;
      planned-but-absent assistant-ui/SVAR technologies are corrected.
- [ ] Detailed guidance is linked rather than duplicated inconsistently across
      AGENTS, CONTRIBUTING, and README.
- [ ] Contributor commands exactly match package scripts introduced by DS-0606/
      DS-0608 or use an explicit sequencing placeholder until those tasks land.
- [ ] Existing unrelated coding, testing, portability, and migration rules in
      `AGENTS.md` are preserved.

## Verification tests

- Run formatting and Markdown link checks across all changed entry points.
- Compare every named package/tool against manifests, lockfile, and live imports.
- Run a contradiction search for theme/color-mode, Radix/Shadcn, Markdown,
  assistant-ui, SVAR, compatibility, and audit-command terms.
- Have the DS-0609 contributor exercise begin from `AGENTS.md` and
  `CONTRIBUTING.md`, not from phase plans.

## Out of scope

- Rewriting unrelated sections of `AGENTS.md`, CONTRIBUTING, or README.
- Adding missing aspirational dependencies to make the old stack table true.
- Copying the entire canonical guide into `AGENTS.md`.
