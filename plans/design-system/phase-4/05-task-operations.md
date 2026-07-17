# DS-0405 — Migrate Task Board, Detail, and Run Flows

- Status: Planned
- Phase: [Phase 4](README.md)
- Foundation reference:
  [domain migration approach](../../design-system-foundation.md#phase-4--migrate-domain-ui-incrementally)

## Goal

Migrate operational task surfaces—board, list/detail panels, run views,
subtasks, status/progress, artifacts, and feedback—to the approved design-system
layer while preserving task execution behavior.

## Context

Task helpers and task UI contain concentrated raw warning, success, danger, and
progress palette usage. The board/detail/run flows also contain dense actions,
status chips, tabbed sections, dialogs, drag-and-drop, monitoring, and mutation
state. Their color roles must be classified by meaning rather than mechanically
renamed.

## Scope

- Migrate TaskBoard, TaskList/detail panels/sections, run detail, task helpers,
  task UI, feedback/artifact controls, and directly owned components assigned by
  DS-0401.
- Use Phase 3 common tabs/page states and approved Button, Surface, Alert,
  Badge/Status, Dialog, Tooltip, and icon-action APIs.
- Classify queued/running/completed/failed/cancelled/progress/subtask colors and
  map them to semantic or bounded domain-status roles.
- Replace equivalent inline UI SVGs with Lucide.
- Preserve drag/drop, queue/cancel/retry, live progress, subtask relationships,
  detail selection, routing, polling/events, mutations, and artifact behavior.
- Coordinate shared task helpers with DS-0404 so neither task overwrites the
  other's semantic-role changes.

## Required deliverables

- Migrated operational task files with focused tests.
- Updated task status-role map and token decisions where demonstrated.
- Board/detail/run E2E and light/dark narrow/wide visual coverage.
- `artifacts/task-operations-migration-record.md` with file list, status mapping,
  palette/icon deltas, DnD/monitoring verification, and shared-helper ownership.

## Blockers and dependencies

- Blocked by: DS-0401 and DS-0404 shared task-role decisions.
- Blocks: DS-0410, DS-0411, and DS-0412.

## Acceptance criteria

- [ ] Board, detail, run, queue, cancel, retry, progress, subtask, and artifact
      behavior remains unchanged.
- [ ] Drag-and-drop and keyboard/pointer interaction retain current semantics.
- [ ] Status/progress colors map to documented product roles and remain legible
      in both resolved modes.
- [ ] Repeated controls and modal shells consume approved CC-owned APIs.
- [ ] Live events/polling, mutations, routing, selection, and task data are not
      refactored.
- [ ] Equivalent UI glyphs use Lucide with stable accessible names.
- [ ] Domain-specific status roles are bounded and not a second arbitrary
      palette.
- [ ] Dense board/detail layouts remain usable at approved responsive widths.

## Verification tests

- Run task board/detail/run/helper/UI tests including drag/drop, status,
  progress, queue/cancel, subtasks, feedback, and artifacts.
- Run critical task E2E flows across authoring → queue → board/detail → run.
- Review every status and interaction state in Default light/dark.
- Re-run task-owned palette/icon inventories and two no-update visual passes.

## Out of scope

- Changing scheduler, monitoring, event, task-state, or artifact business logic.
- Refactoring task schemas or API contracts.
- Replacing third-party drag-and-drop behavior.
