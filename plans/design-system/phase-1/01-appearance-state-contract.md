# DS-0101 — Implement the Appearance State Contract

- Status: Planned
- Phase: [Phase 1](README.md)
- Foundation reference:
  [Phase 1 appearance scope](../../design-system-foundation.md#phase-1--normalize-foundations-without-redesigning-screens)
- Approved contract:
  [Target appearance contract](../phase-0/artifacts/target-appearance-contract.md)

## Goal

Atomically replace the current `light | dark | modern` theme model with the
approved `Default` theme plus a persisted `light | dark | system` color-mode
preference and a derived light/dark resolved mode.

## Context

CC currently stores `cc.theme`, uses the stored theme name as a CSS selector,
and applies it after React mounts. That conflates theme identity with display
mode, cannot follow the operating system, and may paint the wrong mode before
the provider effect runs. Header and Profile also present the same three values
as themes.

This is the first implementation batch. It must leave the application in one
coherent state; do not land a half-migrated provider, DOM contract, or UI.

## Scope

- Add the approved `ThemeId`, `ColorModePreference`, and `ResolvedColorMode`
  types plus pure validation, resolution, and legacy-migration functions.
- Persist only `cc.color-mode`; resolve `system` with
  `prefers-color-scheme: dark`.
- Apply `data-theme="default"`, `data-color-mode="light|dark"`, and matching
  `color-scheme` before React mounts.
- Make the store/provider adopt the initialized state, subscribe only while
  `system` is active, and clean up subscriptions correctly.
- Migrate legacy `cc.theme` values exactly as approved and remove that key after
  successful migration.
- Replace legacy theme selectors with `Default` light/dark selectors while
  preserving current token values for existing consumers.
- Change the header control to Light, Dark, and System color-mode choices.
- Make Profile show Default as the selected and only high-level theme without a
  duplicate color-mode selector.
- Remove Modern from types, CSS, UI, tests, and supported stored state.

## Required deliverables

- Pure appearance types, validation, resolution, and migration modules with
  focused unit tests.
- A pre-React bootstrap and integrated store/provider using the approved DOM
  contract.
- Updated header and Profile appearance controls with component/integration
  tests.
- Updated application E2E coverage and an implementation record of legacy
  migration and first-paint verification.

## Blockers and dependencies

- Blocked by: Completed Phase 0 contract and baselines.
- Blocks: DS-0102, DS-0103, DS-0104, DS-0105, DS-0106, and DS-0107.

## Acceptance criteria

- [ ] `ThemeId` permits only `default`; preference and resolved-mode types are
      distinct.
- [ ] All six preference/OS combinations resolve according to the approved
      state table.
- [ ] A live OS-mode change updates the DOM only while preference is `system`.
- [ ] Initialization applies the correct root attributes before React renders
      and the provider does not change the first resolved frame.
- [ ] Valid `cc.color-mode` wins over any legacy value.
- [ ] Legacy light, dark, modern, missing, invalid, and inaccessible-storage
      cases follow the approved migration table without throwing.
- [ ] `cc.theme`, legacy types, legacy selectors, and Modern UI choices are
      removed after migration support is established.
- [ ] Header exposes one accessible single-choice Light/Dark/System control and
      identifies System as the selected preference even when its resolved mode
      changes.
- [ ] Profile presents Default as the only theme and does not present light or
      dark as theme names.
- [ ] Existing application and protected Markdown light/dark baselines have no
      unexplained differences.
- [ ] No component branches on `default` or resolved dark/light to select visual
      classes.

## Verification tests

- Unit-test pure preference validation, six resolution combinations, and every
  migration input.
- Test provider initialization, listener registration/cleanup, live system
  changes, explicit-mode stability, storage writes, and root attributes.
- Test keyboard, focus, selected-state, outside-click, and Escape behavior of
  the header control.
- Update Profile and application integration tests for Default-only theme
  presentation and persistence behavior.
- Add Playwright coverage for first load, reload, Light, Dark, System under both
  emulated OS modes, and no observable wrong-mode frame.
- Run application, Markdown, and Milkdown Phase 0 visual suites twice without
  updating unexplained screenshots.

## Out of scope

- Additional themes or workspace theme persistence while Default is the only
  theme.
- New semantic HTML styling.
- Shadcn/Radix installation or replacing the current menu implementation.
- Third-party editor and terminal theme bridges.
