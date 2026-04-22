# I2.1 Global MCP Server Management

## Goal

Give the user a complete global MCP server management flow: list external servers, add one, edit it, enable or disable it, remove it, and persist that configuration inside the workspace. After this sub-epic, CommandsCenter can own the lifecycle of global MCP registrations instead of treating them as static config.

## Pre-Conditions

- E2 OpenCode Orchestrator is complete.
- C2 Agent Workspace Lifecycle is complete.
- I1 Provider Connections is complete and provides a reusable management-screen pattern.
- Shared agent capability types already include `mcpServers` and `toolPermissions`.

## Scope

### Shared Contracts

- Add shared schemas for MCP server records and lifecycle inputs/outputs.
- Cover create, update, list, delete, enable, and disable payloads.
- Represent transport, headers, and config in a normalized way so both backend and frontend share one contract.

### Backend MCP Service

- Create a dedicated backend service for MCP server lifecycle.
- Persist global MCP servers in the `mcp_servers` table.
- Store normalized connection config in `config_json`.
- Reject invalid or duplicate server names.
- Keep enable/disable state in both DB state and generated OpenCode config.

### Global OpenCode Config

- Register global MCP servers in the global `opencode.jsonc` using the standard MCP config format.
- Ensure config is written inside the portable workspace.
- Apply updates through a controlled orchestrator path when a reload is required.

### Integrations Screen

- Build the external MCP servers section on the integrations screen.
- Show loading, empty, error, and success states.
- Render server cards with name, transport, enabled/disabled state, and summary metadata.
- Support add, edit, enable/disable, and remove flows.
- Reuse the interaction patterns already used on the provider connections screen.

### Responsive UI

- Ensure the integrations screen layout works on mobile viewports.
- Dialogs/forms must remain usable on narrow screens.

## Out of Scope

- OAuth/auth handshake details and live connection status inspection (Sub-Epic 2).
- Agent editor MCP permissions and tool-level controls (Sub-Epic 3).
- Composio-specific setup and built-in suggestions (I5).

## Acceptance Criteria

- The integrations screen shows a dedicated external MCP servers section.
- A user can add a new MCP server with the required connection details.
- Existing MCP servers can be edited, enabled/disabled, and removed.
- Global MCP server configuration is persisted in both the workspace DB and global `opencode.jsonc`.
- Configuration changes that require OpenCode reload are applied through the orchestrator path.
- The MCP management UI is usable on mobile viewports.

## Key Files to Create/Modify

- `packages/shared/src/schemas/` — add MCP schemas and shared API contracts
- `packages/backend/src/services/` — add `mcp-server-service.ts`
- `packages/backend/src/routes/` — add MCP lifecycle routes
- `packages/backend/src/db/schema/mcp-servers.ts` — reuse existing schema, extend only if required
- `packages/frontend/src/lib/api.ts` — MCP lifecycle client methods
- `packages/frontend/src/hooks/` — MCP React Query hooks
- `packages/frontend/src/pages/` — build/extend integrations screen for MCP management

## Reference

- `packages/frontend/src/pages/ProviderConnectionsPage.tsx`
- `packages/backend/src/services/provider-service.ts`
- `mcp-configuration-flow.md`
- `examples/opencode/packages/opencode/src/mcp/`

## OpenWork Context

OpenWork already has a similar MCP lifecycle flow and is useful as a shape reference for both backend and frontend. The main pattern is: keep MCP registration as config-backed state, expose simple list/add/remove server operations, and drive the UI from a central connections store.

- **Backend config management:** `examples/openwork/apps/server/src/mcp.ts`
  - `listMcp()` merges global and project MCP config.
  - `addMcp()` and `removeMcp()` update JSONC config directly through shared helpers instead of putting write logic inside routes.
- **Frontend MCP screen:** `examples/openwork/apps/app/src/app/pages/mcp.tsx`
  - shows a dedicated MCP management surface with cards, selection, status summaries, and actions.
- **Frontend state layer:** `examples/openwork/apps/app/src/app/connections/store.ts`
  - centralizes `connectMcp`, `removeMcp`, refresh, and status-loading logic.
- **Add server modal:** `examples/openwork/apps/app/src/app/components/add-mcp-modal.tsx`
  - good reference for remote/local server forms, validation, and mobile-friendly modal structure.
