# DS-0007 — Approve Exceptions, Enrich Later Phases, and Sign Off Phase 0

- Status: Complete
- Phase: [Phase 0](README.md)
- Foundation references:
  [confirmed scope](../../design-system-foundation.md#confirmed-scope),
  [theme completeness](../../design-system-foundation.md#6-make-theme-completeness-measurable),
  and [success criteria](../../design-system-foundation.md#success-criteria)

## Goal

Approve narrowly justified visual exceptions, verify every Phase 0 artifact,
re-evaluate Phases 1–6 using the evidence, and create the formal gate that
authorizes detailed Phase 1 planning and implementation.

## Context

Some fixed colors and specialized implementations are legitimate: provider
branding, terminal ANSI colors, syntax highlighting, third-party-required icon
formats, or domain interactions that do not fit a generic primitive. Without an
exception register, these become indistinguishable from accidental theme
bypasses.

Phase 0 is not complete merely because inventories exist. The target appearance
contract, component matrix, visual baselines, Markdown/Milkdown contracts, and
semantic HTML impact analysis must agree and pass reproducible checks. Their
findings must also be reflected in the remaining high-level phases so later work
does not proceed from the assumptions that existed before the inventory.

## Scope

Review all findings from DS-0001 through DS-0006 and decide:

- Which hardcoded colors, raw palette utilities, inline SVGs, fixed themes, or
  custom interactions are intentional exceptions.
- Which findings are Phase 1–6 work rather than exceptions.
- Whether the target `Default` theme and color-mode contract is complete enough
  to implement without reopening token architecture during component work.
- Whether the Shadcn/Radix matrix is complete and the first Phase 2 batch is
  bounded.
- Whether application, Markdown, Milkdown, and semantic HTML baselines are
  deterministic and sufficient to catch unintended changes.
- Whether any unresolved blocker prevents Phase 1.
- How each finding changes the scope, sequence, blockers, or verification of
  Phases 1–6.

## Required deliverables

Create `artifacts/exceptions-and-phase-0-signoff.md` containing:

1. An exception register with stable ID, exact location/scope, rationale,
   product meaning, theme behavior, owner layer, verification method, and phase
   for reconsideration.
2. Explicit decisions for provider branding, terminal ANSI colors, syntax
   highlighting, third-party icon/string APIs, and every other possible
   exception identified in DS-0001.
3. Links to the approved target appearance contract, component adoption matrix,
   and all baseline manifests.
4. A checklist confirming each upstream acceptance criterion and verification
   command passed.
5. Any remaining blockers. The phase cannot be signed off while a blocker is
   unresolved.
6. Create `artifacts/downstream-phase-reassessment.md`, mapping each Phase 0
   finding and artifact to affected work in Phases 1–6, including new blockers,
   removed assumptions, priority changes, and verification requirements.
7. Update the foundation plan's Phase 1–6 sections from that reassessment before
   sign-off.
8. A final approval record authorizing detailed Phase 1 planning and identifying
   its first implementation batch.

## Blockers and dependencies

- Blocked by: DS-0002, DS-0003, DS-0004, DS-0005, and DS-0006.
- Blocks: Detailed Phase 1 planning and implementation, plus final decomposition
  of Phases 2 through 6.

## Acceptance criteria

- [x] Every possible exception from DS-0001 is either approved with a narrow
      rationale or assigned to a later migration task.
- [x] Exceptions do not use the generated teal design or generated project as a
      source of truth.
- [x] The `Default` theme, color-mode preference, resolved-mode, persistence,
      migration, DOM, and token contracts are approved.
- [x] The component adoption matrix has no unresolved classifications and
      enforces the CC-owned `components/ui/` import boundary.
- [x] The first Phase 2 batch contains only concrete consumers and approved
      dependencies.
- [x] Application baselines protect current light/dark as `Default` inputs at
      narrow/wide layouts; `modern` remains removal-only.
- [x] `.cc-md` and `.cc-md--chat` are frozen by reviewed deterministic baselines.
- [x] Milkdown behavior and visuals have a scoped baseline suitable for Phase 5
      comparison.
- [x] Semantic HTML dispositions and intended future changes are explicit.
- [x] Every Phase 0 finding is assigned to a later phase, approved as an
      exception, or explicitly closed with rationale.
- [x] The foundation plan's Phases 1–6 have been reviewed and enriched with
      evidence, dependencies, and verification requirements from Phase 0.
- [x] Detailed Phase 1 planning is identified as the next gate; Phase 1 does not
      begin from the pre-inventory high-level bullets alone.
- [x] All artifact links resolve and all reproduction commands are recorded.
- [x] No unresolved blocker remains.
- [x] The sign-off record contains an explicit approval before Phase 1 begins.

## Verification tests

Run repository checks required by the project after all Phase 0 fixture and test
changes are complete:

```bash
pnpm exec prettier --check plans/design-system plans/design-system-foundation.md packages/frontend/e2e/design-system
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @cc/frontend exec playwright test e2e/design-system
```

Run the visual suites a second time without updating screenshots and confirm
there are no diffs:

```bash
pnpm --filter @cc/frontend exec playwright test e2e/design-system
```

Verify documentation links and artifact presence:

```bash
find plans/design-system/phase-0 -maxdepth 2 -type f -print | sort
```

Manually review and approve every initial screenshot, every exception, the
target appearance contract, component-adoption matrix, intended semantic HTML
change list, and downstream phase reassessment. Automated success alone does not
authorize Phase 1.

## Out of scope

- Implementing Phase 1 tokens or global element styles.
- Installing Shadcn/Radix or migrating components.
- Changing approved current visuals while creating the sign-off record.
- Treating an unresolved issue as an exception merely to unblock the phase.
