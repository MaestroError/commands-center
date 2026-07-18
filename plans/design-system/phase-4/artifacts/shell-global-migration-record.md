# Shell/Global Migration Record (DS-0402)

- Task: [DS-0402](../02-shell-global-ui.md)
- Phase: [Phase 4](../README.md)
- Status: **Complete** — semantic tokens + ThemeMenu interaction migration done

## Completed in this slice

Status/palette tokenization in `components/shell/AppShell.tsx` (theme-dependent
status roles → existing semantic tokens; no new tokens added):

| Location                                         | Before                                                                         | After                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `ActiveRunsBadge`                                | `border-amber-400/30 bg-amber-400/10 text-amber-300 hover:border-amber-300/60` | `border-warning/30 bg-warning/10 text-warning hover:border-warning/60` |
| `EngineStatusBadge` healthy                      | `bg-emerald-500`                                                               | `bg-success`                                                           |
| `EngineStatusBadge` starting/stopping/restarting | `bg-amber-400`                                                                 | `bg-warning`                                                           |

`unhealthy` already used `bg-danger` and `stopped` `bg-text-secondary`; the sibling
`QueuedRunsBadge` already used semantic `accent` tokens and set the precedent this
slice follows. Raw-palette occurrences in AppShell: **7 → 0**.

## Behavior preserved

Class-only change. No navigation, routing, status logic, tooltip text, shortcut,
persistence, or responsive-layout change. Existing `AppShell` unit coverage and
the application visual baseline continue to gate this surface.

## ThemeMenu interaction migration (UI-012)

`ThemeMenu` moved from a hand-rolled `role="menu"` with manual outside/Escape
handling onto a new CC-owned `components/ui/dropdown-menu.tsx` (Radix
DropdownMenu + RadioGroup). This adds the behavior the previous implementation
lacked: arrow-key/Home/End navigation, typeahead, disabled-item skipping, and
focus return to the trigger. Preserved exactly:

- Trigger accessible name `Choose color mode, current: <mode>`.
- Three `menuitemradio` items (Light/Dark/System) with `aria-checked` on the
  current selection and the check indicator.
- `setColorModePreference` on selection; close on select/Escape/outside.
- Color-mode persistence and the header layout/styling.

New primitive `components/ui/dropdown-menu.tsx` uses only semantic tokens (no
palette, no mode branch); Radix stays inside `components/ui`. Covered by
`dropdown-menu.test.tsx` (3), the updated `ThemeMenu.test.tsx` (6, including
select), a `primitives` gallery example, and Playwright tests for keyboard
navigation, focus return, and radio selection. The real-browser ThemeMenu flow
in `phase-1-foundations.spec.ts` continues to pass unchanged.

## Tooltip assessment (UI-013) — not added

Every shell icon-only control already carries an `aria-label` (Open navigation,
Open global search, Profile, Collapse/Expand sidebar, Engine status). DS-0402
authorizes a Tooltip **only** for controls lacking a description, so adding a
Tooltip primitive would be speculative and is deferred until a concrete
consumer needs one.

## Deferred (audit-first, unchanged)

Global search (`GlobalSearchPalette`, UI-011), the activity bell, and the profile
control carry selection/shortcut behavior and remain audit-first — not migrated
to the generic menu/overlay primitives in this batch.

## Test-infra note

Added inert `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture` mocks
to `test-setup.ts` (jsdom lacks them; Radix menu/select pointer interactions call
them). Same category as the existing `scrollIntoView` mock.

## Fixture coupling note (important for later batches)

The dev fixture route `/__design-system-baseline` renders **inside the real
AppShell**, so the shell header — including the mocked-`healthy`
`EngineStatusBadge` dot — appears in every application fixture. Recoloring the
healthy dot (`emerald-500 → success`) therefore shifted ~16 px in the header of
all shell-framed light-desktop snapshots (application, common, primitives,
semantic, profile, markdown, and the four Milkdown surfaces). The protected
`.cc-md`/Milkdown **content** pixels are unchanged; only the shell chrome moved.
Dark-mode dots stayed within threshold. Snapshots were regenerated and pass twice
with no further update. Future shell batches (DS-0402 remainder) should expect
the same coupling.

## Verification (full DS-0402)

- `pnpm --filter @cc/frontend typecheck` — passed.
- `pnpm --filter @cc/frontend lint` — passed (0 warnings; Radix import boundary holds).
- `pnpm --filter @cc/frontend test` — passed in the final Phase 4 suite: 1,398 tests / 139 files.
- `pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium` — 40 passed, twice with no update after approved baseline updates.
- `pnpm --filter @cc/frontend build` — passed.
- Palette recount — AppShell 0; Phase 4 total 178 → 0 / 0 files. New `ui/` primitive: `dropdown-menu.tsx`. Direct Radix outside `ui/`: 0.
