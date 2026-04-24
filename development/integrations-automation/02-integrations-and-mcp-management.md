# I2 Integrations and MCP Management

## Outcome

The user can manage global external MCP servers, authenticate them via OpenCode's auth flow, inspect connection status, manage MCP tool metadata inside CC, and control per-agent access through the workspace permission system.

## Why this is a separate PR

This is a complete feature area with one screen and one clear capability boundary: global external MCP server lifecycle and per-agent permission assignment.

## Blockers

- E2 OpenCode Orchestrator
- C2 Agent Workspace Lifecycle

## Unblocks

- I3 Custom Tools Platform
- I5 Composio Integration

## Scope

### Global MCP Server Management (Integrations Screen)

- Build integrations screen with external MCP servers section (Composio section added by I5)
- Implement global MCP server add, remove, enable, disable flows
- For user-added MCP servers: UI collects connection details (URL, transport type, headers, auth method)
- Delegate all OAuth flows and credential storage to OpenCode's `/mcp/auth/` endpoints — CC is the middle man that configures credentials globally, OpenCode handles the runtime connection
- Register MCP servers in the global `opencode.jsonc` using the standard MCP config format
- Show connection state and CC-managed tool metadata per MCP server
- Persist MCP server configuration inside the workspace (global `opencode.jsonc` + `mcp_servers` DB table)
- Persist MCP tool metadata inside CC so suggested MCPs can ship curated tools and custom MCPs can be configured manually

### Per-Agent MCP Access (Agent Editor)

- Add MCP permissions section to the agent editor
- For each globally-registered MCP server, allow per-agent control:
  - **Server level:** enable or disable the entire MCP server for this agent (`mcp.<name>.enabled`)
  - **Tool level:** set individual tool permissions — allow, ask, or deny (`permission.<name>_*`, `permission.<name>_<tool>`)
- Default to `"deny"` for all tools of a newly-enabled server — require explicit opt-in
- Update agent workspace config (`opencode.jsonc`) when MCP permissions change, following the workspace contract in `mcp-configuration-flow.md`
- Read configurable tool lists from CC-owned MCP metadata rather than depending on undocumented OpenCode runtime APIs

### Data Flow

1. User adds an MCP server via integrations screen (or activates a built-in suggestion like Composio from I5)
2. CC stores the config and registers the server in the global `opencode.jsonc`
3. OpenCode connects to the MCP endpoint using the stored credentials
4. CC stores tool metadata for the MCP server:
   - suggested MCPs: seeded from curated preset definitions
   - custom MCPs: starts empty and can be edited manually by the user
5. User configures per-agent server toggle and tool permissions
6. CC writes workspace `opencode.jsonc` with `mcp` and `permission` entries
7. OpenCode loads the workspace config and enforces permissions at runtime

### Responsive UI

- Ensure integrations screen and agent editor MCP section are responsive on mobile viewports

## Acceptance Criteria

- Behavior matches `design/screens/integrations/acceptance_criteria.md` (Skip composio part for now, it will be handled in I5)
- External MCP servers can be added, authenticated, enabled/disabled, and removed through the integrations screen
- Connection status and CC-managed tool metadata are visible per server
- Connected MCP servers appear in the agent editor with per-agent server toggle and per-tool permission controls
- Agent workspace `opencode.jsonc` is updated when MCP permissions are saved (explicit `enabled` for every global server, permission rules for tool access)
- Changes that require OpenCode reload are applied through a controlled orchestrator path
- Integrations screen and agent editor MCP section adapt correctly to mobile viewports

## Sub-Epics

- `02-integrations-and-mcp-management-sub-epics/01-global-mcp-server-management.md`
- `02-integrations-and-mcp-management-sub-epics/02-mcp-auth-and-connection-status.md`
- `02-integrations-and-mcp-management-sub-epics/03-agent-editor-mcp-permissions.md`
- `02-integrations-and-mcp-management-sub-epics/04-mcp-test-coverage.md`
- `02-integrations-and-mcp-management-sub-epics/05-mcp-secret-management.md`
- `02-integrations-and-mcp-management-sub-epics/06-mcp-tool-metadata-and-manual-management.md`

## References

- `mcp-configuration-flow.md` — Per-workspace MCP configuration model, workspace `opencode.jsonc` schema, tool naming convention, and configuration cases (disabled / fully enabled / selective tool access)
- `examples/opencode` — OpenCode engine source: MCP connection logic (`src/mcp/index.ts`), permission evaluation (`src/permission/index.ts`), config schema with `enabled` flag and permission union types (`src/config/config.ts`)
- `development/integrations-automation/02-integrations-and-mcp-management-sub-epics/06-mcp-tool-metadata-and-manual-management.md` — CC-owned MCP tool metadata strategy for suggested and custom servers

## Non-Goals

- Custom tools MCP server infrastructure (owned by I3)
- App-provided MCP server for CC's own tools (owned by I6)
- Composio-specific setup UI and pre-registered config (owned by I5)
- Automation execution (owned by I4)
