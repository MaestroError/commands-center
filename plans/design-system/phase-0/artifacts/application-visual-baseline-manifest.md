# Application Appearance Contract Manifest

Execution record for [DS-0004](../04-application-visual-baselines.md).

## Fixture boundary

`DesignSystemBaselinePage` is a development-only route at
`/__design-system-baseline`. It is absent from production navigation and the
production route table, and its authentication bypass is guarded by
`import.meta.env.DEV`. The surface renders current production classes and
components; it does not define the future component API.

Playwright intercepts owner status, logout, version, engine state, active task
runs, and activity polling with fixed responses. Theme and sidebar state are
fixed in local storage before navigation. Tests assert semantic theme values,
surface roles, focus, overlay semantics, and horizontal containment.

## Contracts

Current `light` maps to `Default + light`; current `dark` maps to
`Default + dark`. `system` resolves to one of those same contracts. `modern` is
removal-only and has no protected contract.

| ID     | Route/state                    | Viewport   | Modes       | Protected contract                                                                                                       | Assertion owner                    |
| ------ | ------------------------------ | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| APP-01 | `/profile`                     | 1280 × 900 | light, dark | App shell, Default theme selector, panels, fields, buttons                                                               | profile surface browser test       |
| APP-02 | Baseline `surface=application` | 1280 × 900 | light, dark | Page header, panel, button variants, active/inactive tabs, badges, switch, fields, focus, status treatments, empty state | application component browser test |
| APP-03 | Baseline `surface=application` | 390 × 844  | light, dark | Narrow stacking, wrapping, current header behavior, same state coverage as APP-02                                        | application containment assertion  |
| APP-04 | Baseline `surface=dialog`      | 1280 × 900 | light, dark | `ConfirmDialog`, overlay, portal, semantic surface, destructive action                                                   | confirmation dialog browser test   |
| APP-05 | Baseline `surface=dialog`      | 390 × 844  | light, dark | Narrow dialog containment and responsive padding                                                                         | dialog containment assertion       |

## Represented states

- Normal: panels, ordinary fields, secondary actions, inactive tabs.
- Selected: active tab, connected badge, checked switch.
- Disabled: disabled primary button.
- Focus: text input is focused before APP-02/APP-03 capture.
- Empty: `cc-empty-state` with a primary action.
- Loading: the deterministic engine `restarting` badge in the app header.
- Success: `cc-success` treatment.
- Warning/error: the current danger-backed `cc-alert` treatment.
- Modal/destructive: `ConfirmDialog` using its danger action.

## Current findings retained as evidence

1. At 390px the application fixture itself remains 378px wide, but the existing
   header action row expands the document from 390px to 512px. The overflowing
   controls are Activity and Profile after Search. This is Phase 1 responsive
   shell work, not a baseline-harness defect.
2. `cc-alert` uses `danger-contrast` as text against a translucent danger
   surface; its light-mode result needs contrast review during token repair.
3. `Switch` uses raw `emerald-500` and white rather than the complete semantic
   state contract.
4. Current controls mix pills, rounded rectangles, and hardcoded radius values.
   These fixture states remain manual-review inputs for future shape roles.

## Deterministic exclusions

| Surface                      | Why it is not in this application contract batch                                                                                 | Assigned work                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| File manager                 | Depends on a real workspace tree and SVAR internals; a synthetic tree here would protect a fabricated state                      | Phase 5 bridge baseline with a purpose-built workspace fixture |
| Terminal                     | Requires a PTY and WebSocket lifecycle; terminal content, cursor, and ANSI timing are not deterministic in the app-shell fixture | Phase 5 xterm bridge tests                                     |
| Monaco                       | Current editor forces `vs-dark`; a useful baseline needs a stable document and editor-ready signal                               | Phase 5 Monaco bridge tests                                    |
| Integrations/provider brands | Provider data and logos need a separate branded exception fixture                                                                | Phase 4 migration batches and the exception register           |

These exclusions are explicit and are not permission to change those surfaces
without their own before/after evidence.

## Verification

```bash
pnpm --filter @cc/frontend exec playwright test e2e/design-system/application-baseline.spec.ts --project=chromium
```

The live development route is covered at wide and narrow widths through
platform-independent assertions. Two consecutive passes are required.
