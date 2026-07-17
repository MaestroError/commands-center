# DS-0411 — Add Integrated Domain Migration Baselines

- Status: Planned
- Phase: [Phase 4](README.md)
- Foundation reference:
  [gallery and focused tests](../../design-system-foundation.md#7-verify-through-a-component-gallery-and-focused-tests)
- Inventory gate: [DS-0410](10-inventory-ratchet.md)

## Goal

Create a bounded integration review of migrated domain flows in Default light/
dark and narrow/wide states without turning every page into a permanent snapshot.

## Context

Each domain task owns focused tests and screenshots. Phase 4 still needs an
integrated view of shell plus representative domain surfaces, error/status/
disabled/focus states, and protected content. Phase 0 explicitly says baseline
screenshots are migration inputs, not a blanket permanent suite.

## Scope

- Extend or reuse the development-only fixture only for deterministic states
  that cannot be reached reliably through focused domain E2E.
- Select one or more representative critical surfaces from each DS-0402 through
  DS-0409 batch based on risk, not page count.
- Cover normal, loading, empty, error, warning, success, disabled, selected,
  focused, dialog/menu/popup, and narrow-overflow states where relevant.
- Capture Default light/dark at desktop and 390px, plus 320px for shell/overlay
  boundaries.
- Re-run protected Markdown/Milkdown and excluded editor/terminal fixtures.
- Record which Phase 0/1 snapshots remain valuable, are superseded, or can be
  retired in Phase 6 after migration.

## Required deliverables

- `artifacts/domain-baseline-manifest.md` mapping each screenshot/interaction to
  domain task, risk, viewport, mode, fixture/E2E owner, and retention decision.
- Deterministic integrated screenshots and interaction tests.
- Production exclusion verification for any new fixture code.
- A reviewed visual-difference register tied to semantic/primitive migration.

## Blockers and dependencies

- Blocked by: DS-0402 through DS-0410.
- Blocks: DS-0412.

## Acceptance criteria

- [ ] Every domain batch has representative visual/interaction evidence without
      snapshotting every page indiscriminately.
- [ ] Status, focus, disabled, selected, modal, menu, and popup states are
      reviewed where each domain uses them.
- [ ] Default light/dark and narrow/wide behavior is intentional and no page
      hides overflow defects globally.
- [ ] Markdown/Milkdown and excluded editor/terminal behavior remain protected.
- [ ] Every snapshot difference has an owning migration rationale.
- [ ] Fixture code remains development-only and absent from production assets.
- [ ] Two consecutive no-update runs pass after approved updates.

## Verification tests

- Run selected domain E2E and design-system fixture suites twice without
  updates.
- Assert narrow document/overlay/popup bounds in all representative flows.
- Manually review keyboard focus order and contrast in both modes.
- Build production and search non-map assets for all fixture markers.

## Out of scope

- Storybook or a public domain component catalogue.
- Permanent blanket screenshots for every page/state.
- Phase 5 third-party visual convergence.
