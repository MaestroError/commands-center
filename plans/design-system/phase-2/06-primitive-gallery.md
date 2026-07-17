# DS-0206 — Add the Primitive Gallery and Visual Baselines

- Status: Planned
- Phase: [Phase 2](README.md)
- Foundation reference:
  [gallery and focused tests](../../design-system-foundation.md#7-verify-through-a-component-gallery-and-focused-tests)
- Baseline fixture:
  [Phase 1 fixture contract](../phase-1/README.md#verification-fixture)

## Goal

Turn the existing development-only baseline route into a deterministic proving
surface for every first-batch primitive state and interaction.

## Context

`/__design-system-baseline` already supplies development-only application,
dialog, semantic, Markdown, and Milkdown surfaces and is excluded from
production builds. Phase 2 should extend that infrastructure rather than add
Storybook or a second gallery stack.

## Scope

- Add a `primitives` surface to the existing development fixture.
- Render Button primary/secondary/danger, disabled, and representative focus
  states without synthetic implementation-only hooks.
- Render trigger-driven and controlled Dialog examples with real title,
  description, actions, long content, and narrow-width stress content.
- Render ordinary and destructive AlertDialog examples, including disabled
  confirmation and safe initial focus.
- Exercise Default light/dark through the application appearance contract; do
  not create gallery-only theme switches or palettes.
- Add Playwright interaction and screenshot coverage at desktop, 390px, and the
  320px overflow boundary where behavior differs.
- Keep existing application, Markdown, Milkdown, and semantic fixture surfaces
  intact.

## Required deliverables

- The primitive fixture surface and deterministic interaction controls.
- Light/dark desktop/narrow primitive screenshots.
- Playwright tests covering keyboard and pointer flows through real portals.
- `artifacts/primitive-gallery-manifest.md` listing examples, viewport/mode
  coverage, expected interactions, and approved visual differences.

## Blockers and dependencies

- Blocked by: DS-0203, DS-0204, and DS-0205.
- Blocks: DS-0207.

## Acceptance criteria

- [ ] Every approved Button variant and Dialog/AlertDialog state appears in the
      fixture with a named test owner.
- [ ] Gallery examples consume public primitive APIs only.
- [ ] Light/dark screenshots demonstrate semantic token response without a
      component-level mode branch.
- [ ] Keyboard focus is visible and testable in open overlays.
- [ ] Dialogs and overlays remain contained at 320px and 390px without document
      overflow or clipped actions.
- [ ] Portal content is deterministic and cannot collide with parallel tests.
- [ ] Existing fixture surfaces and protected Markdown/Milkdown screenshots
      have no unexplained differences.
- [ ] Gallery code remains development-only and absent from production assets.

## Verification tests

- Screenshot the closed gallery and each open overlay state in both modes.
- Exercise Tab, Shift+Tab, Enter, Space, Escape, overlay pointer interaction,
  controlled close, and focus return.
- Assert `scrollWidth <= clientWidth` at 320px and 390px.
- Run all design-system visual suites twice without updates after approving any
  first-run primitive snapshots.
- Build production and search emitted assets for fixture/gallery markers.

## Out of scope

- Storybook or another documentation runtime.
- A permanent public component catalogue.
- Phase 3 compositions or broad page screenshots solely to demonstrate new
  primitives that pages do not yet consume.
