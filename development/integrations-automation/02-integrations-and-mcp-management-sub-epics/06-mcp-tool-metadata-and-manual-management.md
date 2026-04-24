# I2.6 MCP Tool Metadata and Manual Management

## Goal

Make MCP tool names, counts, and optional descriptions available in CC without depending on undocumented OpenCode runtime APIs. Suggested MCP presets should seed curated tool metadata from code, custom MCP servers should start with an empty tool list, and the user should be able to manage tool metadata manually through the Integrations UI so the Agent editor can configure precise tool subsets.

This sub-epic intentionally separates **tool metadata used by CC UI/configuration** from **actual MCP runtime execution handled by OpenCode**. CC owns the metadata layer; OpenCode remains responsible for tool execution and OAuth-backed connectivity.

## Pre-Conditions

- Sub-Epic 1 (Global MCP Server Management) is complete.
- Sub-Epic 2 (MCP Auth and Connection Status) is complete.
- Sub-Epic 3 (Agent Editor MCP Permissions) is complete or in progress.
- The product decision is confirmed:
  - suggested MCPs can ship with curated tool metadata from code
  - custom MCPs may start with no known tools and be configured manually by the user

## The Approach

### Why CC Owns MCP Tool Metadata

OpenCode currently exposes MCP connection status, but not a stable public API for listing per-server MCP tools with descriptions. Relying on undocumented OpenCode internals or patching the distributed binary would create a high-maintenance integration surface.

Instead, CC should store MCP tool metadata in its own database and treat it as a UI/configuration layer:

- **Suggested MCPs**: metadata is propagated from code-based presets into the DB when the preset is created.
- **Custom MCPs**: metadata starts empty.
- **User edits**: the user can add, edit, or remove tool metadata in the Integrations UI.
- **Agent editor**: reads tool metadata from CC storage, not from live OpenCode runtime discovery.

This keeps the tool-permission UI reliable even when an MCP is disconnected, unauthenticated, or temporarily unavailable.

### Separation of Responsibilities

| Concern                                                             | Owned by                          |
| ------------------------------------------------------------------- | --------------------------------- |
| MCP connection config (transport, URL, command, headers, auth mode) | CC backend + OpenCode config sync |
| OAuth flow and token lifecycle                                      | OpenCode                          |
| Runtime connection status                                           | OpenCode, surfaced by CC          |
| MCP tool metadata for UI and agent configuration                    | CC                                |
| Actual tool execution                                               | OpenCode                          |

### Metadata Sources

CC supports three metadata sources:

1. **Preset**
   - seeded automatically for suggested MCPs from curated code definitions
2. **Manual**
   - entered or edited by the user in the Integrations UI
3. **Imported**
   - optional future source if we later add direct MCP discovery from backend tooling

For this sub-epic, only **preset** and **manual** are required.

## Scope

### 1. MCP Tool Metadata Persistence

Add a new persistence layer for MCP tool metadata.

#### Database

Add an `mcp_server_tools` table under `packages/backend/src/db/schema/`.

Suggested shape:

| Column        | Type          | Notes                                           |
| ------------- | ------------- | ----------------------------------------------- |
| `id`          | text PK       | ULID                                            |
| `server_id`   | text FK       | references `mcp_servers.id`                     |
| `tool_id`     | text          | full MCP tool id, e.g. `memory_search_nodes`    |
| `tool_name`   | text          | human-readable or raw name, e.g. `search_nodes` |
| `description` | text nullable | optional description for UI                     |
| `source`      | text          | `preset` or `manual`                            |
| `sort_order`  | integer       | preserves stable display order                  |
| `created_at`  | integer       |                                                 |
| `updated_at`  | integer       |                                                 |

Constraints:

- unique `(server_id, tool_id)`
- deleting an MCP server deletes its tool metadata

#### Shared schemas

Add MCP tool metadata schemas to `packages/shared/src/schemas/mcp.ts` or a dedicated adjacent schema file.

Required shapes:

- `McpToolMetadata`
- `McpToolMetadataList`
- `ReplaceMcpToolMetadataInput`
- `UpsertMcpToolMetadataInput`

### 2. Suggested MCP Preset Propagation

Extend suggested MCP definitions so each preset may include curated tool metadata.

Behavior:

- When a suggested MCP is created from preset data, CC also seeds its `mcp_server_tools` rows.
- If a suggested MCP is edited later, tool metadata is preserved unless the user explicitly changes it.
- Preset-seeded tools remain editable by the user.

Requirements:

- The source for seeded rows should be `preset`.
- The initial tool count shown in Integrations should come from seeded metadata.
- The Agent editor should immediately be able to render tool-level controls after preset creation, even if OpenCode has not yet connected.

### 3. Custom MCP Tool Management UI

Add manual tool management to the Integrations page.

For each MCP card:

- show tool count based on stored metadata
- add a **Manage tools** action
- open a modal, drawer, or inline panel where the user can:
  - add a tool
  - edit tool name
  - edit optional description
  - remove a tool
  - reorder tools if ordering is supported in the chosen UI

Behavior for custom MCPs:

- tool list starts empty by default
- empty state copy should explain that CC does not know this server's tools yet
- the user can manually add tools after checking MCP docs or asking the agent/server for available tools

### 4. Agent Editor Integration

Update the MCP permissions section in the Agent editor to read from stored MCP tool metadata.

Requirements:

- If metadata exists, show per-tool permission controls.
- If metadata is empty, show the current empty-state guidance and link back to Integrations.
- Agent editor must not rely on live runtime discovery to render configurable tools.
- Tool IDs used in permissions must match stored `tool_id` exactly.

### 5. Rename / Remove / Lifecycle Handling

When an MCP server is removed:

- delete all `mcp_server_tools` rows for that server
- remove agent capability references, as covered by Sub-Epic 3 implementation

When an MCP server is renamed:

- migrate `mcp_server_tools.tool_id` prefixes to the new server name
- preserve user-edited descriptions and ordering
- migrate agent permission patterns accordingly

When a suggested MCP preset changes in code later:

- existing user-managed metadata must not be silently overwritten
- future preset refresh behavior, if added, must be explicit

## Out of Scope

- Real-time MCP tool discovery from the OpenCode runtime.
- Patching or forking OpenCode to expose MCP tools.
- Automatic syncing of tool descriptions from external MCP servers.
- Full schema-aware tool parameter editing.
- Composio-specific tool catalogs (I5 may layer on top later).

## Acceptance Criteria

- Suggested MCP presets seed tool metadata into CC storage.
- Custom MCP servers start with zero stored tools.
- The user can manually add, edit, and remove tools for any MCP server.
- Integrations page shows tool counts from CC metadata rather than unreliable runtime assumptions.
- Agent editor reads tool lists from stored metadata and can configure subsets when metadata exists.
- Renaming or deleting an MCP server keeps metadata and agent permissions consistent.
- The system works even if OpenCode is connected but does not expose MCP tool lists.

## Key Files to Create/Modify

- `packages/backend/src/db/schema/mcp-server-tools.ts`
- `packages/backend/src/db/schema/index.ts`
- `packages/backend/src/db/migrations/` — new migration for `mcp_server_tools`
- `packages/backend/src/services/mcp-server-service.ts`
- `packages/backend/src/routes/mcp-servers.ts` or a dedicated `mcp-server-tools.ts` route file
- `packages/shared/src/schemas/mcp.ts`
- `packages/frontend/src/pages/IntegrationsPage.tsx`
- `packages/frontend/src/pages/AgentEditorPage.tsx`
- suggested MCP preset definitions in frontend and/or shared code

## Reference

- `development/integrations-automation/02-integrations-and-mcp-management-sub-epics/02-mcp-auth-and-connection-status.md`
- `development/integrations-automation/02-integrations-and-mcp-management-sub-epics/03-agent-editor-mcp-permissions.md`
- `packages/backend/src/services/mcp-server-service.ts`
- `packages/frontend/src/pages/IntegrationsPage.tsx`
- `packages/frontend/src/pages/AgentEditorPage.tsx`
- `mcp-configuration-flow.md`

## OpenWork Context

OpenWork is still useful as a structural reference even though it does not ship this exact metadata workflow.

- **Centralized MCP config logic:** `examples/openwork/apps/server/src/mcp.ts`
  - useful reminder that MCP concerns should stay in a focused backend domain instead of leaking into route handlers.
- **Frontend connection management split:** `examples/openwork/apps/app/src/app/connections/store.ts`
  - good reference for keeping persisted metadata, runtime status, and UI actions as separate concerns.
- **JSON/config helper isolation:** `examples/openwork/apps/server/src/jsonc.test.ts`
  - a useful pattern when testing MCP-related rendering logic separately from UI flows.

## Notes for Implementation

- Do not block agent-level MCP configuration on runtime discovery.
- Prefer explicit user-owned metadata over incomplete or misleading automatic guesses.
- Suggested presets should include enough curated tool metadata to make the feature feel complete on day one.
- Custom MCP support is considered successful if the user can register the connection, add tool metadata manually, and then configure agent permissions against that metadata without any hidden runtime dependency.
