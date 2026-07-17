# DS-0207 — Verify and Sign Off Phase 2

- Status: Complete (sign-off: [phase-2-signoff.md](artifacts/phase-2-signoff.md))
- Phase: [Phase 2](README.md)
- Foundation reference:
  [Phase 2 verification](../../design-system-foundation.md#phase-2--establish-typed-ui-primitives)
- Upstream gate: [Phase 1 sign-off](../phase-1/artifacts/phase-1-signoff.md)

## Goal

Prove that CC owns a minimal, accessible, theme-integrated primitive layer and
that it is safe to begin the first Phase 3 consumer migrations.

## Context

Individual primitive tests do not prove dependency discipline, import
boundaries, portal interaction, theme coverage, compatibility styles, protected
content, production exclusion, or the absence of speculative Shadcn output.
Phase 2 therefore ends with an explicit integration and architecture gate.

## Scope

- Verify every DS-0201 through DS-0206 acceptance criterion.
- Audit changed files and direct/transitive dependencies against the approved
  batch.
- Enforce the Radix import boundary and named-export/file-ownership rules.
- Review primitive visual states in Default light/dark at wide/narrow widths.
- Compare existing application, Markdown, Milkdown, and semantic baselines.
- Confirm current class-only consumers still work and no production dialog was
  migrated early.
- Confirm the development fixture/gallery is absent from production output.
- Reassess and authorize or revise Phase 3's first consumer sequence.

## Required deliverables

- `artifacts/phase-2-signoff.md` with task acceptance, exact command results,
  dependency/file audit, import-boundary result, visual-difference register,
  remaining issues, and Phase 3 readiness.
- Updated Phase 2 task/index statuses and foundation-plan checkboxes.
- A Phase 3 gate that names `ConfirmDialog`, `DocumentCreateDialog`, and
  `DocumentFolderDialog`, their order, preserved APIs, and any blocker discovered
  during primitive implementation.

## Blockers and dependencies

- Blocked by: DS-0201 through DS-0206.
- Blocks: Detailed Phase 3 planning and implementation.

## Acceptance criteria

- [ ] Every prior Phase 2 task is complete with no unresolved blocker.
- [ ] Added source/config/dependencies exactly match the approved batch.
- [ ] Direct Radix imports exist only in `components/ui/`; no exception is
      silently introduced.
- [ ] Button, Dialog, and AlertDialog public behavior and accessibility tests
      pass in unit and real-browser layers.
- [ ] Safe destructive focus, focus containment/return, Escape, overlay,
      disabled, and narrow-overflow contracts pass.
- [ ] All primitive states are reviewed in Default light and dark without a
      Shadcn palette or component theme branch.
- [ ] Existing `cc-*` consumers and application baselines have no unexplained
      regression.
- [ ] `.cc-md`, `.cc-md--chat`, Milkdown, generic HTML, and third-party surfaces
      remain outside Shadcn/Radix ownership and visually protected.
- [ ] Two consecutive no-update design-system visual runs pass.
- [ ] Formatting, lint, typecheck, unit/integration tests, E2E tests, and
      production build pass.
- [ ] Development fixture/gallery code is absent from emitted production
      assets.
- [ ] Phase 3's first consumer migration is explicitly approved or blocked with
      a concrete reason.

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

Also search for unapproved Shadcn files/dependencies, direct Radix imports
outside `components/ui`, generic Shadcn palette variables, theme/mode class
branches, and development-gallery markers in production assets.

## Out of scope

- Migrating production dialogs or buttons.
- Adding a second primitive batch.
- Treating generated Shadcn output or unexplained snapshots as approved.
