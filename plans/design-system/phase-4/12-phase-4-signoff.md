# DS-0412 — Verify and Sign Off Phase 4

- Status: Planned
- Phase: [Phase 4](README.md)
- Foundation reference:
  [Phase 4 verification](../../design-system-foundation.md#phase-4--migrate-domain-ui-incrementally)
- Upstream gate: DS-0310 Phase 3 sign-off

## Goal

Prove that domain UI now follows the CC design-system path without business,
accessibility, theme, responsive, protected-content, or portability regressions,
and hand exact remaining third-party work to Phase 5.

## Context

Phase 4 touches broad production surfaces in small batches. Final sign-off must
combine user-flow verification, semantic appearance, inventory closure,
exception discipline, protected surfaces, source ownership, and workspace
portability rather than relying on isolated screenshots or count reduction.

## Scope

- Verify every DS-0401 through DS-0411 acceptance criterion.
- Audit domain source/API changes for visual-only scope and business stability.
- Review final inventories, exceptions, compatibility consumers, support APIs,
  and Radix boundaries.
- Run representative critical flows across every migrated domain.
- Review integrated Default light/dark narrow/wide baselines and protected
  Markdown/Milkdown/editor/terminal exclusions.
- Confirm production fixture exclusion and portable workspace behavior.
- Produce exact Phase 5 bridge locations, current fixed-theme behavior, and
  required fixtures/tests.

## Required deliverables

- `artifacts/phase-4-signoff.md` with task acceptance, exact command results,
  domain behavior results, final inventory, exceptions, visual differences,
  remaining issues, portability review, and Phase 5 readiness.
- Updated Phase 4 task/index statuses and foundation-plan checkboxes.
- `artifacts/phase-5-handoff.md` naming Milkdown, Monaco, xterm, and file-manager
  bridge files, current/final inventory counts, protected behavior fixtures,
  EX-004/EX-005 ownership, and recommended task order.

## Blockers and dependencies

- Blocked by: DS-0401 through DS-0411.
- Blocks: Detailed Phase 5 planning and implementation.

## Acceptance criteria

- [ ] Every prior Phase 4 task is complete with no unresolved blocker.
- [ ] All domain critical flows retain their data, API, persistence, navigation,
      mutation, keyboard, and error behavior.
- [ ] Every live raw palette, hardcoded color, inline SVG, direct Radix import,
      and compatibility-class result has an exact disposition.
- [ ] Changed domain appearance uses semantic tokens and approved CC-owned APIs
      without a parallel visual contract or theme branch.
- [ ] Provider/product/third-party exceptions remain narrow and verified.
- [ ] Markdown, Milkdown, composer suggestions, terminal/editor tabs, Monaco,
      xterm, and other protected/deferred behavior has no unintended regression.
- [ ] Default light/dark and narrow/wide domain reviews pass, including status,
      focus, disabled, selected, modal, menu, popup, and overflow states.
- [ ] Two consecutive no-update integrated visual runs pass.
- [ ] Formatting, lint, typecheck, unit/integration tests, E2E tests, and
      production build pass.
- [ ] Development fixtures are absent from production assets.
- [ ] Portable workspace state remains recoverable and no visual migration moved
      portable configuration into device-only state.
- [ ] Phase 5 handoff accounts for every deferred bridge value and fixture.

## Verification tests

Run, at minimum:

```bash
pnpm exec prettier --check plans/design-system plans/design-system-foundation.md packages/frontend/e2e/design-system
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium
pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium
```

Also run DS-0401/DS-0410 inventory commands, direct-Radix and theme-branch audits,
production fixture searches, representative domain flows, protected-content
suites, and the portable workspace review.

## Out of scope

- Implementing Phase 5 bridge changes.
- Removing compatibility classes without complete consumer evidence.
- Treating count reduction or unexplained snapshots as sufficient sign-off.
