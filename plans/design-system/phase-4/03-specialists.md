# DS-0403 — Migrate Specialist Management Flows

- Status: Planned
- Phase: [Phase 4](README.md)
- Foundation reference:
  [domain migration approach](../../design-system-foundation.md#phase-4--migrate-domain-ui-incrementally)

## Goal

Migrate specialist listing, creation, editing, and form controls to the approved
CC primitive/common layer while preserving specialist data and navigation.

## Context

Specialist surfaces contain repeated buttons, fields, SearchableSelect, Switch,
status/mention/category colors, cards, and destructive confirmations. Phase 0
identified SpecialistForm as the highest raw-palette file. Phase 3 should have
stabilized its common Switch and SearchableSelect dependencies before this task.

## Scope

- Migrate `SpecialistsPage`, `SpecialistEditorPage`, `SpecialistForm`, and the
  directly owned specialist components listed by DS-0401.
- Replace repeated buttons, fields, surfaces, alerts, badges/statuses, dialogs,
  and icon actions with approved primitives/common compositions.
- Replace theme-dependent raw success/warning/danger colors with semantic roles.
- Classify mention/category colors by demonstrated identity semantics before
  retaining or adding bounded tokens.
- Replace equivalent inline UI icons with Lucide.
- Preserve form schemas, validation, provider/model selection, tool state,
  create/update/delete mutations, query invalidation, routing, and workspace
  portability.

## Required deliverables

- Migrated specialist-domain files with focused component/flow tests.
- Updated light/dark specialist list/form/editor baselines at narrow/wide widths.
- `artifacts/specialist-migration-record.md` with file list, raw-palette and icon
  deltas, category decisions, retained classes, and behavior verification.

## Blockers and dependencies

- Blocked by: DS-0401 and completed Phase 3 Switch/SearchableSelect handoff.
- Blocks: DS-0410, DS-0411, and DS-0412.

## Acceptance criteria

- [ ] Specialist create/edit/delete/list/filter/navigation behavior remains
      unchanged.
- [ ] Schema validation, mutation payloads, tool/model/provider state, query
      invalidation, and portable persistence are untouched.
- [ ] Repeated controls consume approved CC-owned APIs; native controls remain
      native where classified.
- [ ] Theme-dependent status colors use semantic roles in both resolved modes.
- [ ] Category/mention identity colors have explicit product roles or are
      migrated to neutral semantic treatment.
- [ ] Equivalent UI glyphs use Lucide; product/provider artwork is not replaced.
- [ ] No direct Radix import or business-logic refactor is introduced.
- [ ] Narrow forms and action groups do not overflow.

## Verification tests

- Run SpecialistForm and specialists page tests for validation, selection,
  Switch, tools, create/update/delete, errors, and navigation.
- Run the full specialist create → edit → open chat/delete E2E flow.
- Review status/focus/error/disabled states in Default light/dark and narrow/wide.
- Re-run inventory counts for the owned files and two no-update visual passes.

## Out of scope

- Changing specialist schemas, API routes, storage, or business rules.
- Migrating chat UI reached after specialist navigation.
- Generalizing category tokens beyond demonstrated specialist/mention meaning.
