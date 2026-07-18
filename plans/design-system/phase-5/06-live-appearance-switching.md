# DS-0506 — Verify Integrated Live Appearance Switching

- Status: Complete
- Phase: [Phase 5](README.md)
- Foundation reference:
  [Appearance coverage](../../design-system-foundation.md#6-treat-theme-coverage-as-a-feature)
- Upstream gates: DS-0502 through DS-0505

## Goal

Prove that all mounted third-party surfaces follow the single CC appearance
contract together, without reloads, fixed islands, state loss, or lifecycle
side effects.

## Context

Individual bridge tests can pass while integrated switching still fails due to
stale resolved mode, duplicated listeners, portal timing, asynchronous lazy
loads, or component recreation. The `system` preference must react to OS-mode
changes just like native CC surfaces.

## Scope

- Add an integrated development/E2E fixture that can mount the deterministic
  Milkdown, Monaco, xterm, and proven file-manager states without production
  data or network nondeterminism.
- Exercise `light` → `dark` → `system` and simulated system light/dark changes
  while each surface is mounted and contains meaningful state.
- Verify lazy-loaded surfaces opened before and after a mode change resolve to
  the same current appearance.
- Verify rapid switching, unmount/remount, focus, selection, scroll, unsaved
  edits, terminal buffer/connection, menus, and overlays.
- Compare third-party bridge roles with adjacent CC-owned surfaces.
- Keep the fixture and routes out of production output.

## Required deliverables

- Integrated Phase 5 appearance fixture or deterministic extension of the
  existing design-system baseline route.
- E2E coverage for explicit and system-resolved live updates.
- Reviewed light/dark wide/narrow computed states for representative bridges.
- Lifecycle evidence showing no extra reconnect/recreation/listener behavior.

## Blockers and dependencies

- Blocked by: DS-0502, DS-0503, DS-0504, and DS-0505.
- Blocks: DS-0507 and DS-0508.

## Acceptance criteria

- [x] All applicable surfaces update on explicit light/dark changes without a
      page reload.
- [x] `system` follows simulated OS light/dark changes while the preference
      remains `system`.
- [x] Surfaces lazy-loaded after a change use the current resolved mode on first
      paint without a fixed-theme flash.
- [x] Milkdown content/selection/menu state, Monaco unsaved model/selection/
      focus/scroll, and xterm buffer/selection/connection/scroll remain intact.
- [x] File-manager state remains intact and any proven bridge updates live.
- [x] Rapid switching and unmount/remount do not leak listeners, reconnect
      sockets, recreate editors, or apply stale theme values.
- [x] No unreadable popup, overlay, selection, cursor, focus, code, or ANSI state
      remains in either resolved mode.
- [x] The fixture is unreachable and absent from production assets.

## Verification tests

- Run the integrated Phase 5 E2E suite at frozen wide/narrow viewports.
- Simulate `prefers-color-scheme` changes under the `system` preference.
- Assert state identity/content before and after each switch and inspect
  editor/terminal construction and WebSocket counts.
- Run two consecutive deterministic integrated appearance passes.
- Build production and search output/routes for fixture markers and test data.

## Out of scope

- Adding themes beyond `Default` or changing appearance persistence semantics.
- Redesigning the header appearance control or profile theme selection.
- Broad page-level fixtures unrelated to third-party bridges.
