# DS-0609 — Verify and Sign Off Phase 6

- Status: Planned
- Phase: [Phase 6](README.md)
- Foundation reference:
  [Success criteria](../../design-system-foundation.md#success-criteria)
- Upstream gates: DS-0601 through DS-0608

## Goal

Prove that the CC design system is accurately documented, visually inspectable,
automatically guarded, and usable by a contributor without implementation archaeology,
then close the phased foundation work with an ongoing maintenance contract.

## Context

Phase 6 succeeds only if guidance and automation agree with the live repository.
Final sign-off must test a contributor's decisions, documentation accuracy,
gallery coverage, audit positive/negative behavior, compatibility dispositions,
full application quality, and production/portability boundaries.

## Scope

- Verify every DS-0601 through DS-0608 acceptance criterion and artifact.
- Run a structured contributor exercise beginning at `AGENTS.md` or
  `CONTRIBUTING.md`, not the phase plans.
- Cover representative choices: layout, theme-dependent color, unclassed HTML,
  protected Markdown, form/action primitive, dialog/menu behavior, domain-
  specific interaction, third-party bridge, icon, new theme, and exception.
- Mechanically verify documentation links, commands, imports, token/API names,
  manifests, and stack claims.
- Run audit positive/negative cases, gallery visual/accessibility checks, and
  full repository quality gates.
- Confirm compatibility removals/retentions, production fixture exclusion,
  appearance portability, and final exception ownership.
- Produce the ongoing ownership/maintenance record and mark the foundation plan
  complete only when all criteria pass.

## Required deliverables

- `artifacts/phase-6-signoff.md` with task acceptance, contributor exercise,
  docs/stack validation, audit results/runtime, compatibility final state,
  gallery/visual results, quality commands, exceptions, production exclusion,
  portability, and remaining issues.
- `artifacts/design-system-maintenance-contract.md` with docs owners, audit rule
  owners, exception review, gallery update triggers, theme-change checklist, and
  compatibility policy.
- Updated Phase 6 task/index statuses and foundation-plan/success checkboxes.

## Blockers and dependencies

- Blocked by: DS-0601 through DS-0608.
- Blocks: None; this closes the current design-system foundation program.

## Acceptance criteria

- [ ] Every prior Phase 6 task is complete with no unresolved blocker.
- [ ] The contributor exercise selects the approved layer/API and verification
      path for every representative scenario using only canonical entry points.
- [ ] `AGENTS.md`, CONTRIBUTING, README, manifests, source, and canonical docs
      contain no contradictory design-system or frontend-stack claim.
- [ ] A theme-authoring dry run requires no component implementation changes.
- [ ] The gallery covers approved reusable APIs and important states, and two
      consecutive no-update light/dark wide/narrow visual runs pass.
- [ ] The design-system audit passes the live tree and every negative fixture
      fails with the intended actionable rule.
- [ ] Local and CI commands are identical/deterministic and remain within the
      accepted runtime budget.
- [ ] Removed compatibility classes have zero consumers; retained ones have
      owners and no-growth ratchets.
- [ ] `.cc-md`/`.cc-md--chat`, Milkdown, semantic HTML, third-party bridges,
      accessibility, and responsive behavior retain their final contracts.
- [ ] Formatting, lint, typecheck, tests, E2E, production build, knip, and audit
      checks pass.
- [ ] Gallery/test fixtures are absent from production and appearance state
      continues to respect the Portable Workspace Rule.
- [ ] The maintenance contract identifies how future tokens, components,
      themes, exceptions, and audit baselines are reviewed.

## Verification tests

Run, at minimum:

```bash
pnpm format
pnpm lint
pnpm lint:root
pnpm typecheck
pnpm test
pnpm knip
pnpm build
pnpm test:e2e
pnpm design-system:audit
pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium
pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium
```

Also run documentation link/example/stack validation, every audit negative
fixture, production gallery-marker searches, the theme-authoring dry run, the
contributor exercise, compatibility searches, and the portability review.

The command name `design-system:audit` is provisional until DS-0601/DS-0606
confirm it does not conflict with existing scripts; DS-0609 must use the final
committed name everywhere.

## Out of scope

- Adding a second theme, documentation framework, or new component family.
- Treating successful checks as permission for unrelated cleanup.
- Closing the plan with stale examples, skipped negative tests, or undocumented
  retained compatibility consumers.
