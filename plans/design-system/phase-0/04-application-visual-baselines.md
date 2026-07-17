# DS-0004 — Capture Application Visual Baselines

- Status: Complete
- Phase: [Phase 0](README.md)
- Foundation references:
  [theme completeness](../../design-system-foundation.md#6-make-theme-completeness-measurable)
  and
  [visual verification](../../design-system-foundation.md#7-verify-through-a-component-gallery-and-focused-tests)

## Goal

Create deterministic screenshots of representative existing CC screens and UI
states so later design-system work can distinguish intentional changes from
regressions.

## Context

Global element defaults, token normalization, component wrappers, and theme
bridges can affect many screens at once. CC currently has no committed
`toHaveScreenshot` baseline suite. Phase 0 must establish a focused suite before
foundation styles change.

The baseline records the current application, not the generated design project.
The current `light` and `dark` visuals are the protected source inputs for the
future `Default` theme's resolved modes. `modern` is scheduled for removal and
must be inventoried for safe migration, not frozen as a long-term visual
contract. `system` will resolve to the same light or dark output and therefore
does not require a third screenshot palette.

## Scope

Select deterministic screens and states from the DS-0001 inventory under the
approved DS-0002 baseline policy, including:

- Application shell, navigation, page header, and representative panels.
- Forms with text fields, native selects, validation, disabled controls, and
  primary/secondary/danger actions.
- Tabs, status indicators, loading, empty, warning, success, and error states.
- At least one ordinary dialog and one destructive confirmation dialog.
- Chat shell and composer without changing or duplicating the dedicated
  Markdown fixture from DS-0005.
- Representative file-manager, terminal, editor, and integration surfaces where
  stable fixture data is practical.
- Focus-visible and selected states where a static screenshot can represent
  them reliably.

Use stable API interception and fixed fixture data. Disable or normalize
animations, timestamps, random IDs, caret blinking, and other nondeterministic
output within the baseline tests.

## Required deliverables

1. Create `artifacts/application-visual-baseline-manifest.md` containing each
   baseline ID, route, fixture state, viewport, current source mode, future
   `Default` mapping, covered contracts, known nondeterminism controls, and
   screenshot path.
2. Add focused Playwright visual tests under
   `packages/frontend/e2e/design-system/application-baseline.spec.ts`.
3. Commit the corresponding Playwright snapshot files for current light and dark
   modes at the agreed narrow and wide viewports.
4. Record any screen that cannot be made deterministic and the exact blocker;
   do not silently omit it.
5. Record `modern` matches and migration-sensitive differences in the manifest.
   A minimal removal reference may be captured when useful, but it is not a
   protected visual baseline and must not multiply the screenshot matrix.

## Blockers and dependencies

- Blocked by: DS-0001 and DS-0002.
- Blocks: DS-0007 and the visual comparisons required by Phases 1 through 5.

## Acceptance criteria

- [x] The manifest maps every screenshot to one or more contracts from DS-0001.
- [x] Current `light` and `dark` are covered by every mode-sensitive fixture and
      map explicitly to `Default + light` and `Default + dark`.
- [x] `modern` is documented as removal-only and is not treated as a protected
      visual variant.
- [x] `system` is verified by behavior in Phase 1 and reuses the resolved
      light/dark baselines rather than creating a third palette.
- [x] Both narrow and wide layouts are represented for responsive contracts.
- [x] Fixture APIs and data are deterministic and do not depend on a developer's
      workspace contents.
- [x] Animations, clocks, random values, cursors, and volatile network output do
      not produce repeat-run differences.
- [x] Baselines cover representative normal, selected, disabled, focus, empty,
      loading, warning, success, error, modal, and destructive states.
- [x] The suite records current CC visuals without importing assets or styling
      from the generated design project.
- [x] Two consecutive verification runs produce no screenshot diffs.

## Verification tests

Generate the initial reviewed baselines once:

```bash
pnpm --filter @cc/frontend exec playwright test e2e/design-system/application-baseline.spec.ts --update-snapshots
```

Then run the suite twice without updating snapshots:

```bash
pnpm --filter @cc/frontend exec playwright test e2e/design-system/application-baseline.spec.ts
pnpm --filter @cc/frontend exec playwright test e2e/design-system/application-baseline.spec.ts
```

Also run:

```bash
pnpm --filter @cc/frontend typecheck
pnpm --filter @cc/frontend lint
pnpm exec prettier --check plans/design-system/phase-0/artifacts/application-visual-baseline-manifest.md packages/frontend/e2e/design-system/application-baseline.spec.ts
```

Manually review each initial screenshot against the running current application
before accepting it. Snapshot generation alone is not approval.

## Out of scope

- Approving a new visual direction.
- Building the full Phase 2 component gallery.
- Testing every page or every responsive breakpoint.
- Updating baselines to hide unexplained differences.
- Preserving `modern` as a selectable or protected theme.
