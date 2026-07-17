# DS-0401 — Accept the Phase 3 Handoff and Refresh Migration Inventories

- Status: Complete (artifacts: [live inventory](artifacts/live-migration-inventory.md), [domain-batch contract](artifacts/domain-batch-contract.md), [ratchets](artifacts/phase-4-ratchets.md))
- Phase: [Phase 4](README.md)
- Foundation reference:
  [Phase 4 scope](../../design-system-foundation.md#phase-4--migrate-domain-ui-incrementally)
- Required predecessor: DS-0310 Phase 3 sign-off and Phase 4 handoff

## Goal

Turn the completed Phase 3 repository into a current, domain-owned migration
map with reproducible baselines and ratchets before any domain UI changes.

## Context

Phase 0's 179 raw-palette matches, 25 affected files, 16 inline-SVG files, and
compatibility-class counts are historical. Phases 1–3 intentionally change
tokens, primitives, common compositions, and some consumers. Phase 4 must not
plan from stale counts or assume the Phase 3 support APIs match their plans.

## Scope

- Read the Phase 3 sign-off and Phase 4 handoff; inspect actual UI/common APIs.
- Re-run raw palette, hardcoded color, inline SVG, Lucide, `cc-*`, modal/role,
  direct Radix, and primitive-import searches.
- Classify every live result by semantic role, domain, task owner, approved
  exception, Phase 5 bridge, or separate category/brand decision.
- Record current domain critical flows and existing unit/E2E/visual coverage.
- Freeze per-task file/consumer scopes and identify overlapping shared helpers.
- Define count ratchets that cannot increase during Phase 4 without an approved
  exception update.
- Confirm protected/excluded surfaces and the no-business-refactor rule.

## Required deliverables

- `artifacts/live-migration-inventory.md` with commands, exact counts, files,
  semantic dispositions, domain owners, and comparison to Phase 0.
- `artifacts/domain-batch-contract.md` with task file boundaries, critical user
  flows, support APIs, test owners, overlap rules, and execution order.
- `artifacts/phase-4-ratchets.md` with raw palette, inline SVG, direct Radix,
  hardcoded color, and remaining compatibility-class baselines.
- Focused pre-migration tests for uncovered domain behavior only; no
  expected-failing tests.

## Blockers and dependencies

- Blocked by: DS-0310 and completed Phase 3 artifacts.
- Blocks: DS-0402 through DS-0412.

## Acceptance criteria

- [ ] Inventories are generated from the post-Phase-3 tree and retain Phase 0
      counts only as historical comparison.
- [ ] Every live raw palette and inline SVG match has exactly one disposition
      and task owner.
- [ ] Category/mention/progress colors are classified by product meaning before
      new tokens are proposed.
- [ ] Every retained exception has a stable ID, exact path, owner, theme
      behavior, and verification method.
- [ ] EX-001 through EX-005 and Phase 5 bridge boundaries are reconciled rather
      than silently reclassified.
- [ ] Domain batches have non-overlapping primary file ownership or an explicit
      shared-helper sequence.
- [ ] Critical behavior tests exist before visual migration begins.
- [ ] No domain task is authorized with unresolved business-versus-visual scope.

## Verification tests

- Re-run all Phase 0 reproduction searches plus current primitive/Radix/import
  searches.
- Compare current counts to Phase 0 and Phase 3 handoff artifacts.
- Run representative current E2E flows for every authorized domain batch.
- Review each inventory disposition against the adoption matrix and exception
  register.

## Out of scope

- Editing UI source, dependencies, tokens, or exceptions.
- Choosing a generic category palette without demonstrated product semantics.
- Pulling Phase 5 third-party bridges into domain migration.
