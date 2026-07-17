# DS-0407 — Migrate Settings, API, and Custom-Tool Flows

- Status: Planned
- Phase: [Phase 4](README.md)
- Foundation reference:
  [domain migration approach](../../design-system-foundation.md#phase-4--migrate-domain-ui-incrementally)
- Adoption row: UI-016 tri-state checkbox in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Migrate configuration-heavy Settings, API token/public MCP, and custom-tool
surfaces to approved CC primitives and semantic states while preserving all
configuration, validation, permission, and destructive workflows.

## Context

These pages have high densities of fields, actions, tabs, alerts, status colors,
confirmations, modal shells, native controls, and API-specific tri-state checks.
Most checkboxes/radios/selects should remain native. Only the reusable visual
tri-state control is approved for a CC Checkbox backed by Radix.

## Scope

- Migrate SettingsPage and owned settings components, ApiPage token/public-MCP
  surfaces, CustomToolsPage, and direct components assigned by DS-0401.
- Compose Phase 3 page states/tabs/password fields plus approved Button, Input,
  Surface, Alert, Badge/Status, Dialog/AlertDialog, Tooltip, and icon APIs.
- Add/migrate the reusable tri-state Checkbox only for the demonstrated API
  permission control; keep permission/domain logic outside it.
- Retain ordinary native selects/checkboxes/radios and theme them through the
  existing base/utility contract.
- Replace theme-dependent raw state colors and equivalent inline UI SVGs.
- Preserve settings persistence, API token visibility/copy/revoke, audit/public
  MCP state, tool create/copy/rename/delete, validation, and confirmation flows.

## Required deliverables

- Migrated settings/API/tool files with focused tests.
- Approved `components/ui/checkbox.tsx` only if DS-0401 confirms the tri-state
  consumer and Phase 3 has not already added it.
- E2E coverage for settings save, token create/copy/revoke, tri-state permission,
  public MCP, and custom-tool create/conflict/delete flows.
- `artifacts/settings-api-tools-migration-record.md` with native/custom control
  decisions, palette/icon deltas, API compatibility, and behavior results.

## Blockers and dependencies

- Blocked by: DS-0401 and required Phase 3 common APIs.
- Blocks: DS-0410, DS-0411, and DS-0412.

## Acceptance criteria

- [ ] Settings, tokens, public MCP, permissions, and custom-tool behavior remains
      unchanged.
- [ ] Secret/token display, copy, revoke, and persistence boundaries are not
      weakened or refactored.
- [ ] Tri-state checked/unchecked/indeterminate semantics, labels, keyboard, and
      form/domain updates are accurate.
- [ ] Ordinary native controls remain native unless DS-0401 records a concrete
      exception.
- [ ] Repeated controls/modal shells use approved CC-owned APIs and semantic
      states in both modes.
- [ ] Equivalent UI glyphs use Lucide with stable accessible names.
- [ ] API payloads, validation, permission logic, and tool filesystem behavior
      remain unchanged.
- [ ] Dense settings/API layouts and dialogs remain usable at narrow widths.

## Verification tests

- Run Settings, API token/public MCP, and CustomTools focused tests.
- Use Playwright for token/tool destructive confirmation, clipboard-visible
  behavior, tri-state keyboard interaction, settings persistence, and errors.
- Review all status/disabled/focus/pending states in Default light/dark.
- Re-run owned palette/icon/control inventories and two visual passes.

## Out of scope

- Replacing all native form controls with Radix.
- Changing token security, settings persistence, permissions, or tool business
  logic.
- Filesystem migration or custom-tool storage redesign.
