# DS-0406 — Migrate Integrations and Provider Flows

- Status: Planned
- Phase: [Phase 4](README.md)
- Foundation reference:
  [domain migration approach](../../design-system-foundation.md#phase-4--migrate-domain-ui-incrementally)
- Exception: EX-002 provider brand artwork/colors in the
  [exception register](../phase-0/artifacts/exceptions-and-phase-0-signoff.md)

## Goal

Migrate integration and provider listing, connection, configuration, OAuth/API
key, MCP, status, and dialog chrome while preserving provider identity and all
connection behavior.

## Context

Integrations, provider connections, helpers, and MCP dialogs contain repeated
forms/actions/statuses, raw palette colors, several modal shells, and
provider-owned icons. EX-002 preserves actual brand artwork/colors, but generic
containers, focus, status, warnings, and actions are not exempt.

## Scope

- Migrate IntegrationsPage, ProviderConnectionsPage, integration dialogs/helpers,
  MCP server dialogs, and assigned direct components from DS-0401.
- Compose approved fields, buttons, surfaces, alerts, badges/statuses, dialogs,
  confirmations, tabs/comboboxes, tooltips, and icon actions.
- Separate provider brand identity from generic connected/disconnected/error/
  pending/status treatment.
- Preserve EX-002 artwork and fixed brand colors only at exact registered paths;
  replace equivalent generic UI glyphs with Lucide.
- Preserve OAuth, API-key, connection test, activate/deactivate, duplicate,
  delete, MCP configuration, secrets handling, validation, mutations, and query
  invalidation.

## Required deliverables

- Migrated integration/provider files with focused tests.
- Per-provider light/dark review showing brand exceptions inside semantic CC
  containers and status treatment.
- E2E coverage for representative connect/configure/test/disconnect flows.
- `artifacts/integration-provider-migration-record.md` with files, EX-002 paths,
  palette/icon deltas, modal/API compatibility, and behavior verification.

## Blockers and dependencies

- Blocked by: DS-0401 and required Phase 3 dialog/field/page-state APIs.
- Blocks: DS-0410, DS-0411, and DS-0412.

## Acceptance criteria

- [ ] Provider/integration list, filter, create/edit/duplicate, activate, test,
      connect/disconnect, OAuth/API-key, and MCP behavior remains unchanged.
- [ ] Secret values and auth state remain handled by existing secure boundaries.
- [ ] EX-002 is limited to provider identity; generic UI appearance uses CC
      semantic roles in both modes.
- [ ] Connected/disconnected/pending/error statuses are semantically consistent
      and accessible.
- [ ] Repeated controls and dialogs consume approved CC-owned APIs with no direct
      Radix imports.
- [ ] Equivalent generic glyphs use Lucide; provider artwork is preserved.
- [ ] Mutation payloads, API routes, validation, and query invalidation are not
      refactored.
- [ ] Narrow forms/dialogs and provider cards do not overflow.

## Verification tests

- Run integrations/provider/MCP focused tests for every connection method and
  state.
- Run representative E2E flows for API key, OAuth, test, activate, and removal.
- Review provider cards/dialogs/statuses in Default light/dark and narrow/wide.
- Re-run owned palette/icon counts and verify exact EX-002 paths.

## Out of scope

- Redesigning provider branding or authentication protocols.
- Changing secret persistence, OAuth orchestration, MCP schemas, or API payloads.
- Treating all brand colors as application semantic tokens.
