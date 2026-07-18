# Third-party Fixture Contract (DS-0501)

## Milkdown

- MILK-01: editable code/image/table document, light/dark at 1280×900 and
  390×844.
- MILK-02: read-only document at 1280×900.
- MILK-03: slash menu with Workspace file action.
- MILK-04: visible text selection.
- Behavior: serialization, edits, readonly, menu insertion, selection,
  long-token/code/table/image containment.

## Monaco

- Deterministic TypeScript model with comment, keyword, type, string, number,
  active line, selection, cursor, and line numbers; writable and read-only
  states.
- Behavior: value and model identity, language, save shortcut, reload,
  conflict, selection/focus/scroll, and no recreation during mode changes.
- Capture theme prop/API behavior before removing `vs-dark`.

## xterm

- Deterministic output covering default foreground/background, all normal and
  bright ANSI roles, cursor, selection, link, and scrollback.
- Behavior: one terminal/socket/addon construction, input/output, copy, link,
  resize, reconnect, buffer serialization/restore, selection, and no reconnect
  during mode changes.
- Capture constructor theme before removing the fixed object.

## File manager

Reuse Phase 4 file-manager unit/E2E coverage. No new fixture is authorized
unless a real third-party consumer is discovered.

Focused fixtures run before integrated light/dark/system switching. Theme API,
computed-style, containment, contrast, and behavior assertions provide the
Phase 5 regression evidence without adding binary screenshot baselines.
