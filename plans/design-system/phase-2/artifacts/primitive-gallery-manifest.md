# Primitive Gallery Manifest

- Task: [DS-0206](../06-primitive-gallery.md)
- Phase: [Phase 2](../README.md)
- Fixture: `/__design-system-baseline?surface=primitives` (development-only)
- Spec: `packages/frontend/e2e/design-system/primitive-gallery.spec.ts`
- Status: Complete

## Surface

A `primitives` surface was added to the existing development-only baseline
fixture (`DesignSystemBaselinePage`). It renders every approved first-batch
primitive state through the public `@/components/ui/*` APIs only — no gallery-only
theme switch, palette, or implementation hook. The four pre-existing surfaces
(application, dialog, markdown, milkdown, semantic) are unchanged.

## Examples

| Group       | Example                        | States shown                                                         |
| ----------- | ------------------------------ | -------------------------------------------------------------------- |
| Button      | Variant row                    | primary, secondary, danger, disabled primary, disabled secondary     |
| Dialog      | `Open dialog` (trigger-driven) | title, description, long-token stress content, Cancel + Save actions |
| Dialog      | `Open controlled dialog`       | fixture-owned open state, Close action                               |
| AlertDialog | `Open destructive alert`       | danger action, safe Cancel initial focus, long-token stress content  |
| AlertDialog | `Open ordinary alert`          | non-destructive confirm (Stay / Leave)                               |
| AlertDialog | `Open disabled alert`          | disabled destructive action                                          |

## Appearance coverage (Default theme)

Browser tests cover the closed gallery, open ordinary Dialog, and open
destructive AlertDialog in both modes. They assert semantic surface colors,
disabled/safe states, focus, roles, and responsive containment.

Light and dark render from the same components with no component-level mode
branch; only the semantic tokens differ.

## Interaction coverage (real browser, Playwright)

| Test                                   | Proves                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------- |
| ordinary dialog Escape + outside click | both close the dialog and return focus to the trigger                  |
| dialog focus containment               | Tab cycling keeps `activeElement` inside `[role=dialog]`               |
| destructive alert safe focus + overlay | Cancel receives initial focus; outside click does **not** dismiss      |
| destructive alert Escape               | routes to cancel, closes, returns focus to trigger                     |
| controlled dialog close                | closes through its owning React state                                  |
| disabled destructive action            | remains non-activatable                                                |
| narrow containment (320px, 390px)      | `document` and dialog `scrollWidth <= clientWidth` with an open dialog |

## Approved visual differences

- The `primitives` surface is entirely new; there is no prior baseline to differ
  from.
- Existing application, dialog, Markdown, Milkdown, and semantic contracts
  remain separately asserted.

## Regression found and fixed during gallery bring-up

The 320/390 narrow test initially failed: a long unbreakable token overflowed the
dialog horizontally (`scrollWidth` 716 vs `clientWidth` 356 at 390px). Fixed by
adding `break-words` to `DialogContent` and `AlertDialogContent`. This is the
gallery doing its job — catching an
overflow the unit layer could not observe.

## Runs

- `playwright test e2e/design-system/primitive-gallery.spec.ts --project=chromium` — 9 passed twice.
- `playwright test e2e/design-system --project=chromium` — passed twice.
