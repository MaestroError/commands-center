# I2.3 Agent Editor MCP Permissions

## Goal

Allow the user to control MCP access per agent: enable or disable each global MCP server and configure tool-level permissions as allow, ask, or deny. After this sub-epic, global integrations become safely usable by individual agents through workspace-enforced permissions.

## Pre-Conditions

- Sub-Epic 1 (Global MCP Server Management) is complete.
- Sub-Epic 2 (MCP Auth, Connection Status, and Tool Discovery) is complete.
- Agent editor (U2) is complete and already saves agent capability selections.

## Scope

### Agent Editor Section

- Add an MCP permissions section to the agent editor.
- For every globally-registered MCP server, show:
  - server-level enable/disable control for the current agent
  - list of discovered tools for that server
  - per-tool permission control: allow, ask, deny

### Defaults and Safety

- Default newly-enabled MCP servers to `deny` for every tool.
- Require explicit opt-in before a tool becomes usable by the agent.
- Preserve other agent capabilities and settings when saving MCP permissions.

### Workspace Config Application

- Update agent workspace `opencode.jsonc` when MCP permissions are saved.
- Follow `mcp-configuration-flow.md` exactly:
  - explicit `enabled` entry for every global server
  - correct `permission` rules for enabled/disabled and tool-level access

### Responsive UI

- Ensure the MCP permissions section remains usable on mobile viewports.
- Tool lists and controls should stack cleanly on narrow widths.

## Out of Scope

- Runtime tool execution behavior beyond the permission model.
- Custom tools server support (I3).
- Composio-specific shortcuts/presets (I5).

## Acceptance Criteria

- Connected global MCP servers appear in the agent editor.
- The user can enable/disable an MCP server for a specific agent.
- The user can set allow/ask/deny for individual tools.
- Newly-enabled servers default to deny for all tools until explicitly changed.
- Saving the agent updates workspace `opencode.jsonc` with explicit MCP and permission entries.
- Saving MCP permissions does not wipe unrelated agent settings.
- The MCP section is usable on mobile viewports.

## Key Files to Create/Modify

- `packages/frontend/src/pages/AgentEditorPage.tsx`
- `packages/frontend/src/components/` — MCP permission controls if extracted
- `packages/backend/src/services/agent-service.ts` or adjacent config-writing helpers
- `packages/shared/src/schemas/agents.ts` and MCP-related shared schemas

## Reference

- `packages/frontend/src/pages/AgentEditorPage.tsx`
- `mcp-configuration-flow.md`
- `examples/opencode/packages/opencode/src/permission/`
- `examples/opencode/packages/opencode/src/config/config.ts`

## OpenWork Context

OpenWork does not mirror this exact per-agent permission editor, but it is still useful as a configuration reference. Its MCP implementation keeps server config and runtime status separate, and its backend JSONC helpers demonstrate how MCP entries should be written centrally rather than scattered across UI code.

- **Backend MCP config writes:** `examples/openwork/apps/server/src/mcp.ts`
  - useful for structuring dedicated MCP config helpers instead of writing config directly in route handlers.
- **Frontend config parsing helpers:** `examples/openwork/apps/app/src/app/mcp.ts`
  - `parseMcpServersFromContent()` and `removeMcpFromConfig()` are helpful references for keeping MCP config logic small and isolated.
- **Connections store:** `examples/openwork/apps/app/src/app/connections/store.ts`
  - demonstrates a clean split between persisted config, runtime status, and UI actions. We should preserve that separation when adding per-agent permission controls in the agent editor.
