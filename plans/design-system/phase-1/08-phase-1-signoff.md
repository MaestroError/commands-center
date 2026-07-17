# DS-0108 — Verify and Sign Off Phase 1

- Status: Complete
- Phase: [Phase 1](README.md)
- Foundation reference:
  [Phase 1 verification](../../design-system-foundation.md#phase-1--normalize-foundations-without-redesigning-screens)
- Phase 0 gate:
  [Exceptions and Phase 0 sign-off](../phase-0/artifacts/exceptions-and-phase-0-signoff.md)

## Goal

Prove that the normalized foundation is behaviorally correct, visually
reviewed, isolated from protected content, and stable enough to unblock detailed
Phase 2 planning and primitive implementation.

## Context

Passing isolated task tests is not sufficient. Appearance initialization,
semantic tokens, the CSS cascade, global HTML defaults, responsive layout, and
protected rich-content surfaces interact at runtime. Phase 1 needs an explicit
integration gate and a record of every approved visual difference from Phase 0.

## Scope

- Verify every DS-0101 through DS-0107 acceptance criterion and reproduction
  command.
- Create `artifacts/phase-1-signoff.md` with command results, visual-difference
  register, remaining issues, and the Phase 2 readiness decision.
- Compare application, semantic, Markdown, and Milkdown screenshots with Phase 0
  and explain every accepted update.
- Re-run theme/token/semantic inventories and record updated counts.
- Confirm no Phase 2 Shadcn/Radix code or dependency entered Phase 1.
- Reassess the first Phase 2 batch against the stabilized token and appearance
  APIs before authorizing implementation.

## Required deliverables

- `artifacts/phase-1-signoff.md` with acceptance status, exact verification
  results, approved screenshot changes, inventory deltas, remaining issues, and
  Phase 2 readiness.
- Updated Phase 1 task/index statuses and foundation-plan checkboxes.
- A recorded decision confirming or revising the bounded Phase 2 first batch.

## Blockers and dependencies

- Blocked by: DS-0102, DS-0103, DS-0104, DS-0105, DS-0106, and DS-0107.
- Blocks: Detailed Phase 2 planning and implementation.

## Acceptance criteria

- [ ] Every prior task is complete and has no unresolved blocker.
- [ ] Default light/dark/system behavior, legacy migration, and first-paint
      behavior pass automated and manual verification.
- [ ] Token completeness and cascade-precedence checks pass.
- [ ] Generic HTML is reviewed in both modes and at narrow/wide widths.
- [ ] Application changes are either visually stable or listed with an approved
      rationale.
- [ ] `.cc-md`, `.cc-md--chat`, and Milkdown have no unintended computed or
      screenshot changes.
- [ ] Shell and semantic fixtures satisfy their no-horizontal-overflow
      assertions.
- [ ] Two consecutive no-update visual runs pass.
- [ ] Formatting, lint, typecheck, unit/integration tests, E2E tests, and
      production build pass.
- [ ] Development baseline code is absent from emitted production assets.
- [ ] Phase 2 remains limited to the approved Button, Dialog, AlertDialog, and
      justified support dependencies unless a new decision is recorded.

## Verification tests

Run, at minimum:

```bash
pnpm exec prettier --check plans/design-system plans/design-system-foundation.md packages/frontend/e2e/design-system
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @cc/frontend exec playwright test e2e/design-system
pnpm --filter @cc/frontend exec playwright test e2e/design-system
```

Also inspect production assets for the development-only baseline route and
manually verify first paint, live System changes, keyboard focus, contrast,
responsive menus, semantic overflow, Markdown, and Milkdown.

## Out of scope

- Installing Shadcn/Radix or implementing Phase 2 primitives.
- Treating unexplained snapshot updates as approval.
- Deferring a Phase 1 regression to a later phase solely to close the gate.
