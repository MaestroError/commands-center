# DS-0309 — Add Common-Composition Gallery Coverage

- Status: Planned
- Phase: [Phase 3](README.md)
- Foundation reference:
  [gallery and focused tests](../../design-system-foundation.md#7-verify-through-a-component-gallery-and-focused-tests)
- Fixture contract: [Phase 2 primitive gallery](../phase-2/06-primitive-gallery.md)

## Goal

Extend the development-only design-system fixture with deterministic common
composition examples and integrated keyboard/visual coverage for every Phase 3
migration.

## Context

Phase 2 proves primitives in isolation. Phase 3 must prove that common APIs and
real compositions preserve their behavior when those primitives are assembled.
The existing fixture remains test infrastructure and production-excluded; no
Storybook or second gallery runtime is needed.

## Scope

- Add a `common` surface or an equivalent clearly separated section to the
  existing development fixture.
- Cover ConfirmDialog, both document dialogs with deterministic mocked domain
  state, PageHeader, all page states, PasswordInput, Switch, ordinary TabBar,
  and SearchableSelect.
- Render normal, focused, disabled, error/empty/loading, selected, open, narrow,
  long-content, and destructive states relevant to each composition.
- Exercise real triggers and portals rather than invoking internal state hooks.
- Use the Default appearance contract for light/dark; do not add gallery-only
  palettes or theme branches.
- Keep Phase 2 primitive, application, semantic, Markdown, and Milkdown fixture
  surfaces intact.

## Required deliverables

- Deterministic common-composition fixture coverage.
- Default light/dark screenshots at desktop and 390px, plus 320px for overlay or
  popup overflow contracts.
- Playwright keyboard/pointer tests across integrated compositions.
- `artifacts/common-gallery-manifest.md` mapping every state, interaction,
  viewport, screenshot, and expected visual difference to its owning task.

## Blockers and dependencies

- Blocked by: DS-0302 through DS-0308.
- Blocks: DS-0310.

## Acceptance criteria

- [ ] Every Phase 3 composition and newly authorized support primitive has a
      deterministic gallery/test state.
- [ ] Gallery examples use only public primitive/common APIs.
- [ ] Focus-visible, disabled, selected, error, open, safe-destructive, and
      overflow states are reviewable in both resolved modes.
- [ ] Portals/popups do not collide across tests and remain within narrow
      viewports.
- [ ] Existing Phase 2 and protected-content baselines have no unexplained
      differences.
- [ ] Production assets contain neither the fixture nor common gallery code.
- [ ] Screenshot updates are tied to a recorded Phase 3 migration rationale.

## Verification tests

- Exercise Tab/Shift+Tab, arrows, Home/End, Enter, Space, Escape, overlay/outside
  pointer behavior, focus return, filtering, selection, and password toggling.
- Assert document/application `scrollWidth <= clientWidth` at relevant 320px and
  390px states.
- Run all design-system visual suites twice without updates after approving the
  first common-composition snapshots.
- Build production and search emitted assets for fixture/common-gallery markers.

## Out of scope

- A public component documentation site or Storybook.
- Broad Phase 4 domain-page galleries.
- Replacing the protected Markdown/Milkdown fixture contracts.
