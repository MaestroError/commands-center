# Shell/Global Migration Record (DS-0402)

- Task: [DS-0402](../02-shell-global-ui.md)
- Phase: [Phase 4](../README.md)
- Status: **In progress** — semantic-token slice done; interaction slices pending

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
slice follows. Palette matches in AppShell: **4 → 0**.

## Behavior preserved

Class-only change. No navigation, routing, status logic, tooltip text, shortcut,
persistence, or responsive-layout change. Existing `AppShell` unit coverage and
the application visual baseline continue to gate this surface.

## Remaining DS-0402 scope (not in this slice)

Tracked so DS-0402 is not marked complete prematurely:

- `ThemeMenu` → CC DropdownMenu/RadioGroup (adoption UI-012) — requires a new
  `components/ui` DropdownMenu primitive + real-browser menu/keyboard coverage.
- Tooltip primitive (UI-013) for icon-only shell controls lacking an accessible
  description.
- Compose Button/Dialog for remaining raw shell `<button>`/overlay entry points.
- Global search / activity / profile chrome audit-first review.
- Playwright coverage for menus, shortcuts, focus return, and 320/390 overflow;
  application + protected baselines re-run twice.

## Fixture coupling note (important for later batches)

The dev fixture route `/__design-system-baseline` renders **inside the real
AppShell**, so the shell header — including the mocked-`healthy`
`EngineStatusBadge` dot — appears in every fixture screenshot. Recoloring the
healthy dot (`emerald-500 → success`) therefore shifted ~16 px in the header of
all shell-framed light-desktop snapshots (application, common, primitives,
semantic, profile, markdown, and the four Milkdown surfaces). The protected
`.cc-md`/Milkdown **content** pixels are unchanged; only the shell chrome moved.
Dark-mode dots stayed within threshold. Snapshots were regenerated and pass twice
with no further update. Future shell batches (DS-0402 remainder) should expect
the same coupling.

## Verification (this slice)

- `pnpm --filter @cc/frontend typecheck` — passed.
- `pnpm --filter @cc/frontend lint` — passed.
- `pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium` — 36 passed, twice with no update after regenerating the shell-framed light snapshots.
- Palette recount for AppShell — 0 (total 72 → 68).
