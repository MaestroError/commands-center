# DS-0504 — Migrate the xterm Theme Bridge

- Status: Complete
- Phase: [Phase 5](README.md)
- Foundation reference:
  [Phase 5 scope](../../design-system-foundation.md#phase-5--complete-third-party-theming)
- Upstream gate: DS-0501 bridge and fixture contracts

## Goal

Build xterm's base appearance from the resolved CC theme and update mounted
terminals live while retaining a deliberate, readable ANSI palette and all
terminal lifecycle behavior.

## Context

`TerminalInstance` currently constructs xterm with fixed dark background,
foreground, cursor, selection, and sixteen ANSI values inside the terminal
lifecycle effect. Appearance changes must update `terminal.options.theme` (or
the supported equivalent established during implementation) without recreating
the terminal, socket, addons, or buffer.

## Scope

- Add a deterministic xterm fixture before changing the hardcoded theme. Cover
  normal/bright ANSI colors, default text/background, cursor, selection, links,
  scrollback, and representative status output.
- Extract/build a typed xterm theme from the approved semantic adapter inputs.
- Map base background, foreground, cursor, cursor accent, and selection to CC
  semantic roles.
- Review all sixteen ANSI values as a controlled palette under EX-004 for both
  light and dark backgrounds; change only values that fail readability/meaning.
- Update the mounted terminal on resolved mode change without reconnecting or
  rerunning initialization.
- Preserve xterm CSS lazy loading, addons, fitting, resize debounce, buffer
  restore/snapshot, clipboard, links, prefill, socket, reconnect, and exit logic.

## Required deliverables

- Stable xterm fixture and focused mounted-theme-update assertions.
- Typed CC-to-xterm theme builder/adapter.
- Updated terminal integration with independent lifecycle and appearance update
  paths.
- Final EX-004 ANSI table with rationale and readability evidence per mode.

## Blockers and dependencies

- Blocked by: DS-0501.
- Blocks: DS-0506 through DS-0508.

## Acceptance criteria

- [x] The xterm fixture is captured and passes before fixed theme values change.
- [x] Base terminal background, text, cursor, cursor accent, and selection use
      documented CC semantic inputs in both resolved modes.
- [x] All normal/bright ANSI colors remain distinguishable and readable on both
      backgrounds, with exact ownership in EX-004.
- [x] Mode changes update the existing terminal without WebSocket reconnect,
      terminal/addon recreation, buffer loss, scroll reset, selection loss, or
      additional resize/reconnect listeners.
- [x] Terminal input/output, clipboard, links, fit, resize, reconnect, exit,
      prefill, serialization, and restore behavior remain stable.
- [x] xterm remains lazy-loaded and no global descendant theme CSS is added.
- [x] Rapid repeated mode changes settle on the last resolved mode without
      stale values or leaked listeners.

## Verification tests

- Run the focused `TerminalInstance` lifecycle suite plus tests proving mounted
  theme updates do not reconstruct xterm or reconnect its socket.
- Run the real xterm fixture in Default light/dark and exercise `system` OS-mode
  changes while content, selection, scrollback, and a connection are active.
- Review the ANSI matrix and text/selection/cursor readability in both modes.
- Compare lazy-load/build behavior and listener/cleanup assertions.
- Run two consecutive deterministic xterm palette/appearance passes.

## Out of scope

- Changing PTY protocols, terminal session persistence, shell output, or addons.
- Converting ANSI roles into general-purpose application status tokens.
- Replacing xterm or restyling its implementation with global selector trees.
