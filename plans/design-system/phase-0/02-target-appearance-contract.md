# DS-0002 — Define the Target Appearance Contract

- Status: Complete
- Phase: [Phase 0](README.md)
- Foundation references:
  [confirmed scope](../../design-system-foundation.md#confirmed-scope) and
  [theme contract](../../design-system-foundation.md#theme-contract)

## Goal

Approve the appearance architecture that the design system will implement:
one high-level `Default` theme, an independent `light`/`dark`/`system`
color-mode preference, resolved light/dark output, and a bounded semantic token
contract covering color, shape, typography emphasis, and component roles.

## Context

CC currently treats `light`, `dark`, and `modern` as mutually exclusive themes.
The same value selects a CSS palette, sets the browser color scheme, appears in
the header, appears on Profile, and persists in local storage. That conflates two
different concepts:

- A high-level theme defines the visual character of CC and contains both light
  and dark palettes plus mode-independent design decisions.
- A color-mode preference determines whether the selected theme resolves to its
  light or dark palette, either explicitly or from the operating system.

The design-system token architecture, Shadcn-derived components, global HTML
styles, visual baselines, and third-party bridges all depend on this distinction.
It must be settled before implementation planning is finalized.

## Scope

Define the target contract for:

- `ThemeId`, initially containing only `default`.
- `ColorModePreference`: `light`, `dark`, or `system`.
- `ResolvedColorMode`: `light` or `dark`.
- DOM state, expected to separate `data-theme="default"` from
  `data-color-mode="light|dark"`.
- Light/dark semantic color tokens owned by the selected theme.
- Shared theme tokens for surface/control/badge/pill radii, typography emphasis,
  and component-role treatments such as notes, badges, and statuses.
- The boundary between reusable theme tokens and component-specific styling.
- Header ownership of color-mode selection and Profile ownership of high-level
  theme selection.
- Resolution and live updates for `system` through `prefers-color-scheme`.
- Initial document setup that avoids rendering the wrong color mode before React
  mounts.
- Persistence of theme selection and color-mode preference, including the
  Portable Workspace Rule and device-local operating-system behavior.
- Migration from the existing `cc.theme` values.
- Registration and validation requirements for future high-level themes.
- How Tailwind mappings, Shadcn-derived components, generic HTML, Markdown, and
  third-party bridges consume the resolved token contract without branching on
  theme names.

## Required deliverables

Create `artifacts/target-appearance-contract.md` containing:

1. A vocabulary and type model for theme ID, color-mode preference, and resolved
   color mode.
2. A complete state table covering every preference against light and dark
   operating-system states.
3. The DOM attribute contract and ownership of `color-scheme`.
4. A token schema divided into mode-specific semantic colors and shared
   theme-level design tokens.
5. A mapping from every current light/dark token to the corresponding
   `Default` theme token.
6. A boundary rule preventing themes from becoming arbitrary stylesheets or
   forcing components to branch on a theme name.
7. A UI responsibility table: header controls color mode; Profile controls the
   high-level theme; only `Default` is initially available.
8. A persistence decision for both settings with explicit Portable Workspace
   reasoning.
9. A flash-free initialization and `matchMedia` subscription lifecycle.
10. A legacy migration table. Unless evidence requires a different reviewed
    choice, map `light` to `Default + light`, `dark` to `Default + dark`, and
    `modern` to `Default + dark`.
11. A removal checklist for the `modern` selector, option, tests, stored value,
    and any modern-specific assumptions.
12. A future-theme registration contract that requires complete light/dark and
    shared token sets without changing component implementations.
13. The unit, integration, and E2E scenarios required when Phase 1 implements
    the contract.

## Blockers and dependencies

- Blocked by: DS-0001.
- Blocks: DS-0003, DS-0004, DS-0005, DS-0006, DS-0007, and the first Phase 1
  appearance implementation task.

## Acceptance criteria

- [x] `Default` is the only approved high-level theme for the initial system.
- [x] The current light and dark visual directions are mapped into `Default` as
      resolved color modes rather than themes.
- [x] `modern` is removal-only and has an explicit stored-value migration.
- [x] `system` is modeled as a preference and never as a third token palette.
- [x] The state table produces exactly one resolved mode for every input state.
- [x] The contract handles operating-system changes while `system` is active and
      ignores them while an explicit preference is active.
- [x] The initialization design prevents an avoidable wrong-mode flash.
- [x] Header and Profile responsibilities are unambiguous.
- [x] Every current light/dark token has a target mapping or a documented reason
      to retire.
- [x] Shared theme tokens cover the approved shape, typography/emphasis, note,
      badge, status, and related component-role needs without encoding layout or
      behavior.
- [x] Components consume semantic tokens and never branch on `default`, `light`,
      or `dark` names.
- [x] Persistence decisions comply with the Portable Workspace Rule and account
      for device-local system preference behavior.
- [x] A future theme must provide a complete validated contract before it can be
      selected.
- [x] Implementation test scenarios cover migration, initialization, live system
      changes, header selection, Profile selection, and token completeness.
- [x] The target appearance contract has recorded approval before dependent
      tasks begin.

## Verification tests

### Current-state reconciliation

Confirm the contract accounts for every current theme state and selector:

```bash
rg -n --glob '*.{css,ts,tsx}' 'themeNames|ThemeName|cc\.theme|data-theme|colorScheme|prefers-color-scheme|modern' packages/frontend/src
rg -n --glob '*.css' '^\[data-theme=|^:root|--[a-zA-Z0-9-]+:' packages/frontend/src/styles
```

Compare every light and dark token found by DS-0001 with the target mapping and
confirm no token disappears without a retirement rationale.

### State-table review

Manually verify these six combinations in the contract:

| Preference | OS mode | Resolved mode |
| ---------- | ------- | ------------- |
| `light`    | light   | light         |
| `light`    | dark    | light         |
| `dark`     | light   | dark          |
| `dark`     | dark    | dark          |
| `system`   | light   | light         |
| `system`   | dark    | dark          |

Verify that the Phase 1 test plan includes a transition from system-light to
system-dark and proves explicit preferences do not follow that transition.

### Document checks

```bash
pnpm exec prettier --check plans/design-system/phase-0/artifacts/target-appearance-contract.md
```

## Out of scope

- Changing the current Zustand store, ThemeProvider, CSS selectors, header, or
  Profile page.
- Removing `modern` from production code.
- Implementing preference persistence or a pre-render initialization script.
- Creating additional high-level themes.
- Defining arbitrary per-component CSS inside a theme.
