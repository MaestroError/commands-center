# DS-0409 — Migrate Workspace, Documents, and File-Manager Chrome

- Status: Complete ([record](artifacts/workspace-files-migration-record.md))
- Phase: [Phase 4](README.md)
- Foundation reference:
  [domain migration approach](../../design-system-foundation.md#phase-4--migrate-domain-ui-incrementally)
- Third-party boundary:
  [Phase 5 scope](../../design-system-foundation.md#phase-5--complete-third-party-theming)

## Goal

Migrate CC-owned workspace layout, Documents controls, file navigation/dialogs,
and file-manager chrome while leaving editor/terminal/file-manager third-party
theme bridges and domain-specific tab controllers for Phase 5 or their approved
owners.

## Context

Workspace and file surfaces mix split-pane/layout controls, quick-file and file
picker dialogs, tabs, Documents sidebar/actions, workspace file controls,
file-manager panels/dialogs, inline SVGs, and raw warning colors. Monaco, xterm,
Milkdown, and any third-party file-manager bridge have separate theme ownership.
Terminal/editor tab controllers carry close/dirty/pane behavior and must not be
replaced by generic Tabs.

## Scope

- Migrate WorkspaceLayout and CC-owned workspace controls, Documents page/
  sidebar chrome, WorkspaceFilesTab actions, quick-file/file-picker dialogs,
  file-manager page/panels/dialogs, and files assigned by DS-0401.
- Compose approved buttons, fields, surfaces, alerts/statuses, dialogs,
  tooltips, icon actions, and common page states.
- Audit quick-file/file-picker search/selection/focus/shortcut behavior before
  composing Dialog or combobox primitives.
- Preserve TerminalTabBar/EditorTabBar controllers; migrate only shared visual
  primitives/icons where safe without changing their domain APIs.
- Replace equivalent inline UI SVGs with Lucide and raw theme-dependent file
  warning/status colors with semantic roles.
- Keep Milkdown, Monaco, xterm, and third-party bridge variables/options out of
  this task except recording exact Phase 5 handoff locations.
- Preserve filesystem APIs, path validation, selection, split-pane state,
  editor/terminal lifecycle, document serialization, and workspace portability.

## Required deliverables

- Migrated CC-owned workspace/Documents/file-manager files with focused tests.
- Real-browser coverage for file dialogs, quick-file navigation, layout actions,
  file selection, and narrow overlays.
- Updated light/dark narrow/wide chrome baselines with editor content protected.
- `artifacts/workspace-files-migration-record.md` with file list, palette/icon
  deltas, domain-tab decisions, behavior results, and exact Phase 5 bridge
  handoff.

## Blockers and dependencies

- Blocked by: DS-0401 and required Phase 3 Dialog/field/page-state APIs.
- Blocks: DS-0410, DS-0411, and DS-0412.

## Acceptance criteria

- [x] Workspace layout, panes, files, Documents, quick-file/picker, and
      file-manager behavior remains unchanged.
- [x] Filesystem paths, operations, selection, navigation, editor/terminal
      lifecycle, and portable workspace state are not refactored.
- [x] Quick-file/file-picker focus, shortcuts, filtering, and selection retain
      their audited behavior.
- [x] Terminal/editor tab domain controllers remain intact.
- [x] CC-owned chrome uses approved primitives and semantic tokens; Radix is not
      imported directly by domain files.
- [x] Equivalent UI glyphs use Lucide with stable accessible labels.
- [x] Milkdown, Monaco, xterm, and third-party bridge appearance remains scoped
      and assigned to Phase 5.
- [x] Dense panes/dialogs remain usable without page-level overflow at narrow
      widths.

## Verification tests

- Run WorkspaceLayout, file picker/quick-file, Documents, file-manager, editor
  tab, terminal tab, and filesystem UI tests.
- Run critical file/document navigation and operation E2E flows.
- Re-run Milkdown, Monaco-mock, and xterm lifecycle suites as protected behavior
  checks.
- Review Default light/dark chrome and rerun owned palette/inline-SVG counts.

## Out of scope

- Monaco, xterm, Milkdown, or third-party file-manager theme bridges.
- Replacing TerminalTabBar or EditorTabBar with generic Tabs.
- Changing filesystem APIs, migrations, document data, or pane architecture.
