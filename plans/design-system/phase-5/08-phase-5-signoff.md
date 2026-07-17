# DS-0508 — Verify and Sign Off Phase 5

- Status: Planned
- Phase: [Phase 5](README.md)
- Foundation reference:
  [Phase 5 verification](../../design-system-foundation.md#phase-5--complete-third-party-theming)
- Upstream gates: DS-0501 through DS-0507

## Goal

Prove that every real third-party surface is integrated with the CC appearance
contract without behavior, accessibility, lifecycle, performance, protected-
content, production-fixture, or portability regressions, then hand enforceable
facts to Phase 6.

## Context

Phase 5 completes theme coverage for behavior-rich third-party surfaces. Final
sign-off must combine focused bridge evidence, live switching, exception
discipline, lazy-loading/performance checks, protected Markdown isolation, and
full repository quality gates.

## Scope

- Verify every DS-0501 through DS-0507 acceptance criterion and artifact.
- Run focused Milkdown, Monaco, xterm, and file-manager behavior/visual suites.
- Run the integrated light/dark/system switching and lifecycle suite.
- Review final bridge inventory, semantic mappings, adapter ownership, and
  exception register.
- Confirm `.cc-md`/`.cc-md--chat` are unchanged and generic HTML rules remain
  excluded from third-party internals.
- Confirm lazy loading, production fixture exclusion, and portable appearance
  persistence boundaries.
- Produce the exact bridge API, fixture, and ratchet handoff for Phase 6.

## Required deliverables

- `artifacts/phase-5-signoff.md` with task acceptance, command results, visual
  differences, behavior/lifecycle results, exceptions, performance/build
  evidence, production exclusion, portability review, and remaining issues.
- `artifacts/phase-6-handoff.md` naming approved bridge modules/selectors,
  fixture paths, semantic mappings, exception IDs, ratchet commands, and
  documentation/test owners.
- Updated Phase 5 task/index statuses and foundation-plan checkboxes.

## Blockers and dependencies

- Blocked by: DS-0501 through DS-0507.
- Blocks: Detailed Phase 6 planning and implementation.

## Acceptance criteria

- [ ] Every prior Phase 5 task is complete with no unresolved blocker.
- [ ] Every real third-party bridge consumes the documented CC appearance
      contract or has a verified no-consumer/no-op disposition.
- [ ] Explicit light/dark and reactive system-mode updates pass without reload,
      fixed islands, content/state loss, editor recreation, or socket reconnect.
- [ ] Milkdown data/editing behavior and isolation pass; `.cc-md` and
      `.cc-md--chat` have no intentional visual change.
- [ ] Monaco editing/save/read-only behavior and xterm lifecycle/buffer/ANSI
      behavior pass in both resolved modes.
- [ ] EX-003 through EX-005 have exact final ownership and verification.
- [ ] Two consecutive no-update focused and integrated visual runs pass.
- [ ] Formatting, lint, typecheck, tests, E2E, and production build pass.
- [ ] Monaco/xterm remain lazy-loaded and initial bundle behavior is acceptable.
- [ ] Development fixtures are absent from production routes/assets.
- [ ] No bridge output or resolved mode became portable workspace state; the
      approved appearance preference remains the only persisted input.
- [ ] Phase 6 handoff contains reproducible, currently passing ratchets.

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

Also run all DS-0501/DS-0507 inventory commands, focused real-surface fixtures,
live system-mode simulation, editor/terminal lifecycle assertions, protected
Markdown checks, production fixture searches, lazy-load comparison, and the
portable appearance-state review.

## Out of scope

- Implementing Phase 6 documentation, CI ratchets, or compatibility removal.
- Adding themes beyond `Default`.
- Treating screenshots alone as sufficient sign-off.
