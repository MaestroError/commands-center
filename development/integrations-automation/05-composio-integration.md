# I5 Composio Integration

## Context

Composio (`composio-core`) provides managed OAuth flows, token storage/refresh, and a tool router for dynamically loading actions from 1000+ external apps (GitHub, Slack, Jira, Notion, etc.). It offers two integration modes: **native tools** (SDK function calls) and **MCP mode** (exposes tools via MCP URL). The app uses Composio to give agents access to external services without the user manually configuring each one.

**Composio documentation:** https://docs.composio.dev/llms.txt — consult this before planning implementation details, especially for auth flows, tool routing, MCP mode, and connected account management.

**Key Composio concepts:**
- **Client → User → Session → Tools/MCP**: Initialize client, create user-scoped session, connect accounts, fetch tools
- **Connected accounts**: Linking user credentials for external apps via OAuth or manual auth
- **MCP mode**: `session.mcp.url` exposes tools via MCP — no provider package needed, any MCP-compatible client (including OpenCode) can consume tools directly
- **Native tools mode**: `session.tools()` paired with a provider package for direct function calls
- **Toolkits**: Grouped collections of tools per app (e.g., GitHub toolkit contains multiple actions)

## Outcome

The user can connect external app accounts through Composio, browse available tools per connection, and assign Composio-provided tools to agents. Connected Composio tools are exposed to agents via the app-provided MCP server.

## Why this is a separate PR

Composio is a distinct third-party integration with its own SDK, auth model, and tool routing. It has different concerns from MCP server management (I2) and custom tools (I3): managed OAuth for external apps, connected account lifecycle, and dynamic tool discovery from Composio's catalog.

## Blockers

- I2 Integrations and MCP Management

## Unblocks

- No hard blockers downstream. Extends the agent editor with Composio tool assignment.

## Scope

- Implement Composio client initialization with `COMPOSIO_API_KEY`
- Implement connected account management: connect, disconnect, list connections, inspect connection status
- Implement OAuth and manual auth flows for connecting external apps through Composio
- Implement tool/toolkit browsing: list available toolkits, list tools per connected app, show tool descriptions
- Register Composio-provided tools into the app-provided MCP server established in I2 (either via Composio's MCP mode URL or by wrapping native tool calls)
- Add Composio section to the integrations screen (extending the screen built by I2)
- Add Composio tools section to the agent editor: per-agent Composio tool assignment and permission controls
- Update agent workspace config (`opencode.jsonc`) when Composio tool assignments change
- Persist Composio connection state inside the workspace
- Ensure Composio sections of integrations screen and agent editor are responsive on mobile viewports

## Acceptance Criteria

- The user can connect external app accounts through Composio OAuth flows from the integrations screen
- Connected accounts are listed with status and available tools
- The user can disconnect/revoke Composio connections
- Connected Composio tools appear in the agent editor with per-agent permission controls
- Agent workspace `opencode.jsonc` is updated when Composio tool assignments are saved
- Composio tools are exposed to agents through the app-provided MCP server
- Connection state persists across app restarts and workspace moves per the Portable Workspace Rule
- Composio section adapts correctly to mobile viewports

## Non-Goals

- Custom tool HTTP request builder (owned by I3)
- MCP server configuration and auth (owned by I2)
- Agent CRUD UI (owned by U2)
