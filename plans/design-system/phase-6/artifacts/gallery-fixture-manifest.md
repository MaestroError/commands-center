# Final Gallery Fixture Manifest

Route: `/__design-system-baseline` in development only.

| Surface query           | Contract                                                                                           | Primary test                         |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `application` (default) | actions, forms, tabs, badges, switch, success, danger, empty                                       | `application-baseline.spec.ts`       |
| `common`                | PageHeader, page states, PasswordInput, SearchableSelect, Switch, TabBar, Confirm/document dialogs | `common-gallery.spec.ts`             |
| `dialog`                | overlay, destructive focus, responsive containment                                                 | `application-baseline.spec.ts`       |
| `primitives`            | Button, Dialog, AlertDialog, DropdownMenu, Checkbox states                                         | `primitive-gallery.spec.ts`          |
| `semantic`              | unclassed headings, prose, lists, table, code, media, explicit-utility precedence                  | `markdown-milkdown-baseline.spec.ts` |
| `markdown`              | protected reader and chat variants                                                                 | `markdown-milkdown-baseline.spec.ts` |
| `milkdown`              | editable/read-only Crepe, selection, slash menu, serialization                                     | `markdown-milkdown-baseline.spec.ts` |
| `monaco`                | CC bridge and live mode switching                                                                  | `third-party-bridges.spec.ts`        |

Primitive coverage is intentionally composed through public APIs:

- `alert` and `surface`: application/common page states.
- `input`: PasswordInput and document/form fixtures.
- `command` and `popover`: SearchableSelect.
- `switch` and `tabs`: common compositions.
- dialog, alert-dialog, button, dropdown-menu, and checkbox: direct primitive
  fixtures.

xterm remains on its real terminal fixture because terminal lifecycle, socket,
buffer, and ANSI behavior cannot be represented faithfully by a static gallery
mock. `global-terminal.spec.ts` owns its light/dark ANSI and live-switching
contract. The file manager is CC-owned React UI and needs no bridge fixture.

Appearance checks use theme attributes, computed roles, focus, interaction, and
containment. No committed screenshot baseline is part of this contract.
