# Application Visual Baseline Manifest

Execution record for [DS-0004](../04-application-visual-baselines.md).

## Fixture boundary

`DesignSystemBaselinePage` is a development-only route at
`/__design-system-baseline`. It is absent from production navigation and the
production route table, and its authentication bypass is guarded by
`import.meta.env.DEV`. The surface renders current production classes and
components; it does not define the future component API.

Playwright intercepts owner status, logout, version, engine state, active task
runs, and activity polling with fixed responses. Theme and sidebar state are
fixed in local storage before navigation. Screenshot capture disables
animations and hides the caret.

## Baselines

Current `light` maps to future `Default + light`; current `dark` maps to future
`Default + dark`. `system` must resolve to one of those same images in Phase 1.
`modern` is removal-only and has no protected screenshot.

| ID     | Route/state                    | Viewport   | Modes       | Protected contract                                                                                                       | Screenshot pattern                                                                      |
| ------ | ------------------------------ | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| APP-01 | `/profile`                     | 1280 × 900 | light, dark | App shell, current theme selector, panels, fields, buttons                                                               | `application-baseline.spec.ts-snapshots/profile-{mode}-desktop-chromium-darwin.png`     |
| APP-02 | Baseline `surface=application` | 1280 × 900 | light, dark | Page header, panel, button variants, active/inactive tabs, badges, switch, fields, focus, status treatments, empty state | `application-baseline.spec.ts-snapshots/application-{mode}-desktop-chromium-darwin.png` |
| APP-03 | Baseline `surface=application` | 390 × 844  | light, dark | Narrow stacking, wrapping, current header behavior, same state coverage as APP-02                                        | `application-baseline.spec.ts-snapshots/application-{mode}-mobile-chromium-darwin.png`  |
| APP-04 | Baseline `surface=dialog`      | 1280 × 900 | light, dark | `ConfirmDialog`, overlay, portal, elevation, destructive action                                                          | `application-baseline.spec.ts-snapshots/dialog-{mode}-desktop-chromium-darwin.png`      |
| APP-05 | Baseline `surface=dialog`      | 390 × 844  | light, dark | Bottom-aligned narrow dialog and responsive padding                                                                      | `application-baseline.spec.ts-snapshots/dialog-{mode}-mobile-chromium-darwin.png`       |

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
   These images are the comparison input for the future `Default` shape roles.

## Deterministic exclusions

| Surface                      | Why it is not in this application screenshot batch                                                                               | Assigned work                                                  |
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

Initial screenshots were reviewed against the live development route at wide
and narrow widths. Two consecutive no-update runs are required by the Phase 0
sign-off record.
