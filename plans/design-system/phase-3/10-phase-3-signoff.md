# DS-0310 — Verify and Sign Off Phase 3

- Status: Complete
- Phase: [Phase 3](README.md)
- Foundation reference:
  [Phase 3 verification](../../design-system-foundation.md#phase-3--consolidate-common-compositions)
- Upstream gate: DS-0207 Phase 2 sign-off

## Goal

Prove that common compositions now reuse the CC primitive layer without API,
behavior, accessibility, theme, protected-content, or domain regressions, and
produce a precise Phase 4 migration handoff.

## Context

Phase 3 changes highly reused common components, so isolated unit tests are not
enough. The sign-off must audit all consumers, support primitives, dependencies,
Radix boundaries, real-browser focus behavior, visual baselines, and excluded
domain surfaces together.

## Scope

- Verify every DS-0301 through DS-0309 acceptance criterion.
- Audit added support primitives and dependencies against the DS-0301 contract.
- Compare common public APIs and consumers before/after migration.
- Enforce Radix ownership, named exports, semantic tokens, and compatibility
  class policy.
- Review common gallery and representative application surfaces in Default
  light/dark at wide/narrow widths.
- Re-run protected Markdown/Milkdown and excluded terminal/editor/composer
  behavior checks.
- Inventory remaining domain call sites using compatibility classes and common
  adapters so Phase 4 starts from current evidence.

## Required deliverables

- `artifacts/phase-3-signoff.md` containing task acceptance, exact verification
  commands/results, files/dependencies, public API compatibility, consumer audit,
  visual differences, remaining issues, and Phase 4 readiness.
- Updated Phase 3 task/index statuses and foundation-plan checkboxes.
- `artifacts/phase-4-handoff.md` listing remaining high-repetition domain
  surfaces, retained common adapters, excluded high-risk components, raw-palette
  and inline-icon counts affected by Phase 3, and recommended first Phase 4
  batches.

## Blockers and dependencies

- Blocked by: DS-0301 through DS-0309.
- Blocks: Detailed Phase 4 planning and implementation.

## Acceptance criteria

- [x] Every prior Phase 3 task is complete with no unresolved blocker.
- [x] Support files and dependencies match the approved DS-0301 batches.
- [x] Direct Radix imports exist only in `components/ui/`; no undocumented
      exception exists.
- [x] Common public APIs and all consumers are compatible or have an approved,
      atomic migration record.
- [x] Dialog, switch, tab, combobox, password, page-state, and action behavior
      passes focused unit and real-browser coverage.
- [x] Focus entry/containment/return, safe destructive focus, Escape, outside
      interaction, arrow navigation, disabled states, and narrow overflow pass.
- [x] Changed appearance uses semantic tokens with no parallel Shadcn palette or
      theme/mode branch.
- [x] Existing `cc-*` compatibility consumers remain functional for Phase 4.
- [x] Markdown, Milkdown, terminal/editor tabs, composer suggestions, and other
      exclusions have no unintended behavior or visual change.
- [x] Two consecutive no-update design-system visual runs pass.
- [x] Formatting, lint, typecheck, unit/integration tests, E2E tests, and
      production build pass.
- [x] Development fixture/gallery code is absent from production assets.
- [x] Phase 4 handoff accounts for remaining domain migration scope and current
      inventory deltas.

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

Also audit unapproved dependencies/files, direct Radix imports, generic Shadcn
palette variables, theme branches, remaining common-component visual-state
duplication, protected/excluded surfaces, and production gallery exclusion.

## Out of scope

- Broad Phase 4 domain migration.
- Refactoring business logic while closing composition tasks.
- Treating unexplained snapshot or API changes as approved.
