# I2.2 MCP Auth, Connection Status, and Tool Discovery

## Goal

Let the user authenticate MCP servers through OpenCode, inspect whether each server is connected, and see the tools exposed by that server. After this sub-epic, MCP integrations are not just configured — they are observable and actionable.

## Pre-Conditions

- Sub-Epic 1 (Global MCP Server Management) is complete.
- The backend MCP service can persist and update global MCP server records.

## Scope

### Auth Delegation

- Delegate MCP auth flows to OpenCode `/mcp/auth/` endpoints.
- Support user-entered auth inputs required by a server configuration.
- Keep credential handling inside OpenCode's auth/runtime model; CommandsCenter acts as the UI and persistence middle layer.

### Connection Status

- Surface per-server connection state in backend responses.
- Show connected / not connected / error or equivalent status in the integrations UI.
- Allow re-auth or credential update flows when a server is not connected.

### Tool Discovery

- Fetch and expose available tools per MCP server via MCP `tools/list`.
- Show tool counts and tool names in the integrations UI.
- Preserve graceful behavior when tool discovery fails or the server is offline.

### Integrations Dialogs

- Add auth dialogs/forms for MCP servers with conditional fields by auth type.
- Reuse the modal, busy-state, and success/error interaction style established by the provider connections screen.

## Out of Scope

- Agent-specific MCP permission assignment (Sub-Epic 3).
- Composio-specific integration setup (I5).
- Custom-tools MCP runtime owned by I3.

## Acceptance Criteria

- MCP servers can be authenticated through CommandsCenter using OpenCode auth endpoints.
- Each server shows connection status in the integrations screen.
- Available tools are visible per server.
- Failed auth or tool discovery is surfaced with clear error states.
- Re-auth/update auth flows are available for previously configured servers.

## Key Files to Create/Modify

- `packages/shared/src/schemas/` — auth/status/tool schemas
- `packages/backend/src/services/mcp-server-service.ts`
- `packages/backend/src/routes/` — auth/status/tools routes
- `packages/frontend/src/lib/api.ts` — auth/status/tool client methods
- `packages/frontend/src/pages/` — integrations page dialogs and status/tool display

## Reference

- `packages/frontend/src/pages/ProviderConnectionsPage.tsx`
- `examples/opencode/packages/opencode/src/mcp/`
- `mcp-configuration-flow.md`

## OpenWork Context

OpenWork is especially relevant for this sub-epic because it already separates MCP registration from MCP authorization and connection status. The UI opens a dedicated auth modal, starts auth through the OpenCode client, polls status, and surfaces reload requirements when needed.

- **Auth modal:** `examples/openwork/apps/app/src/app/components/mcp-auth-modal.tsx`
  - starts auth, opens authorization URL, polls for connection, and handles reload-required states.
- **Frontend state orchestration:** `examples/openwork/apps/app/src/app/connections/store.ts`
  - `authorizeMcp()` and `logoutMcpAuth()` show how auth actions are triggered from central state.
- **Screen-level status display:** `examples/openwork/apps/app/src/app/pages/mcp.tsx`
  - maps backend/client status into friendly badges and connection messaging.
- **Remote API surface:** `examples/openwork/apps/app/src/app/lib/openwork-server.ts`
  - exposes simple MCP auth/logout endpoints over the app-server boundary instead of embedding auth logic inside components.
