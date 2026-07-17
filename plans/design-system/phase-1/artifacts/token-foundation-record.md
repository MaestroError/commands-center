# Phase 1 Token Foundation Record

Implements [DS-0102](../02-token-foundation.md).

## Canonical contract

`Default` now supplies each semantic role for both resolved color modes. The
contract retains the existing application, panel, and control roles and adds
the missing disabled, inverse, accent, status, note, chat, terminal, shape,
shadow, and emphasis roles required by the current CC foundation.

| Prior use                     | Canonical role                                 | Decision                                                               |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Application and panel colors  | `surface-*`, `border-*`, `text-*`              | Retained and completed with disabled and inverse roles.                |
| Primary actions               | `accent-*`                                     | Completed with surface, border, and on-accent roles.                   |
| Status messages               | `success-*`, `warning-*`, `danger-*`, `info-*` | Completed as foreground, surface, border, and on-color families.       |
| Shape and emphasis in classes | `radius-*`, `font-weight-*`, `shadow-*`        | Moved to bounded theme roles.                                          |
| Existing contrast consumers   | compatibility aliases                          | Retained where necessary while resolving to canonical semantic values. |

Tailwind v4 maps the semantic variables through `@theme`; layout, spacing,
breakpoints, sizing, and raw type scales remain Tailwind-owned.

## Intentional visual adjustments

- Focus-visible rings now use the semantic focus-ring token in both modes.
- Alert, success, badge, and primary-action foreground contrast now uses
  explicit on-color roles.
- Shared control, surface, badge, and pill radii plus surface shadows are token
  driven instead of being embedded in foundation compatibility classes.

These are foundation-state corrections, not a screen redesign. Raw-palette
domain call sites remain deferred to Phase 4. Markdown, Milkdown, Monaco,
xterm, terminal syntax, and other third-party bridges were not remapped.

## Verification

`src/styles/theme-contract.test.ts` requires every approved token in both
Default light and dark declarations and rejects the removed Modern selector.
Application and protected-content visual baselines cover the resulting
compatibility styles.
