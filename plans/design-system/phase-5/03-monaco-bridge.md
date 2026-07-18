# DS-0503 — Migrate the Monaco Theme Bridge

- Status: Complete
- Phase: [Phase 5](README.md)
- Foundation reference:
  [Phase 5 scope](../../design-system-foundation.md#phase-5--complete-third-party-theming)
- Upstream gate: DS-0501 bridge and fixture contracts

## Goal

Replace Monaco's fixed dark appearance with a CC-owned light/dark adapter that
updates a mounted editor live while preserving editing, file, and save behavior.

## Context

`MonacoFileEditor` currently passes `theme="vs-dark"`. Monaco needs a supported
API bridge because its canvas/DOM internals should not be restyled with global
descendant CSS. The adapter may select a theme ID from resolved color mode, but
domain components must not branch on visual utility classes or read a separate
preference store.

## Scope

- Add a deterministic Monaco fixture before changing the fixed theme. Include
  representative syntax, comments, strings, diagnostics/selection, cursor,
  line numbers, active line, scrollbars, and read-only state.
- Define/register CC-owned Monaco light and dark themes through Monaco's public
  theme API using DS-0501's semantic mapping.
- Select/update the registered theme from the resolved CC color mode.
- Keep bounded syntax colors under EX-005; map editor chrome and interactive
  roles to CC semantics.
- Keep Monaco lazy-loaded and avoid adding it to the initial bundle.
- Preserve component value, language inference, path context, options,
  `onChange`, reload, save, conflict, and read-only behavior.

## Required deliverables

- Stable Monaco appearance fixture and focused lifecycle/computed-style
  assertions.
- A narrow CC-to-Monaco theme adapter with typed theme definitions.
- Updated `MonacoFileEditor` integration using the adapter.
- Monaco role mapping and EX-005 disposition in Phase 5 artifacts.

## Blockers and dependencies

- Blocked by: DS-0501.
- Blocks: DS-0506 through DS-0508.

## Acceptance criteria

- [x] The Monaco fixture is captured and passes before `vs-dark` is removed.
- [x] Default light renders a true light editor and Default dark renders a true
      dark editor with readable chrome, code, selection, cursor, and focus.
- [x] `light`, `dark`, and resolved `system` changes update the mounted editor
      without reload, model recreation, value loss, scroll reset, or focus loss.
- [x] Theme registration/update uses supported Monaco APIs and remains inside a
      narrow bridge module or integration boundary.
- [x] Monaco remains lazy-loaded and initial bundle behavior does not regress.
- [x] File editing, language selection, save shortcut, reload, conflict,
      read-only, loading, and error behavior remain stable.
- [x] Every retained syntax color is owned by EX-005; editor base/chrome colors
      are not justified as syntax exceptions.
- [x] No global `.monaco-editor` descendant theme tree is introduced.

## Verification tests

- Run focused `MonacoFileEditor` unit tests, including theme selection/update,
  editing, save shortcut, reload, conflict, and read-only states.
- Run the real Monaco fixture in Default light/dark and switch modes while the
  editor contains unsaved content, selection, scroll, and focus.
- Verify `system` follows a simulated OS preference change without reload.
- Compare build output/lazy chunk behavior before and after the adapter.
- Run two consecutive deterministic Monaco appearance passes.

## Out of scope

- Changing Monaco editing options or language features for product reasons.
- Replacing Monaco or styling its internals through global CSS selectors.
- Treating the entire syntax palette as ordinary semantic UI tokens.
