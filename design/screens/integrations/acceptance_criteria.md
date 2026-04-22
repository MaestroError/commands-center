# Integrations Acceptance Criteria

## Composio

- Selecting the integrations entry in navigation opens the integrations screen.
- The integrations screen shows a Composio section as the first section of the screen.
- The Composio section shows Composio as a built-in MCP server suggestion with a simplified setup flow — the user does not need to provide a URL, transport type, or headers.
- If Composio is not yet activated, the Composio section shows an inactive state and provides an action to activate it (API key input or OAuth).
- The user can activate Composio by providing their own API key or completing an OAuth flow. This authenticates CC to Composio — individual app connections (GitHub, Slack, Jira, etc.) are managed by the user directly in the Composio dashboard.
- When Composio activation succeeds, the integrations screen shows Composio as an active MCP server with its connection status and available tools (via standard MCP tools/list — same as any other MCP server).
- When Composio activation fails or does not complete, the integrations screen does not show Composio as active.
- The Composio API key is stored securely (encrypted in DB) and is never exposed in API responses.
- Once activated, Composio is treated as a normal MCP server for all subsequent operations — connection management, tool discovery, per-agent access control, and workspace config rendering all follow the standard MCP flow described in the MCP Servers section below.
- The user can deactivate Composio. Selecting deactivate prompts the user with a confirmation dialog before proceeding. When confirmed, the Composio MCP server is removed and its tools are no longer available to agents.
- The Composio section adapts correctly to mobile viewports.

## MCP Servers

- The integrations screen shows an MCP servers section as the second section of the screen.
- The MCP servers section shows all configured MCP servers when one or more MCP servers exist.
- If no MCP servers exist, the MCP servers section shows an empty state and provides an action to add an MCP server.
- The user can add an MCP server by providing connection details (URL, transport type, headers, auth method). The app registers the server globally and delegates all OAuth flows and credential storage to OpenCode's `/mcp/auth/` endpoints.
- When an MCP server supports authentication through the app, the integrations screen delegates that authentication flow through OpenCode's MCP auth flow.
- When MCP server authentication succeeds, the integrations screen shows that server as connected.
- When MCP server authentication fails or does not complete, the integrations screen does not show that server as connected.
- The integrations screen shows the current connection state and available tools for each configured MCP server.
- The user can disable an MCP server for the workspace. A disabled MCP server remains in the configuration but is shown as disabled and its tools are not available to agents.
- The user can re-enable a disabled MCP server, restoring its tools to availability.
- The user can remove an MCP server permanently. Selecting remove prompts the user with a confirmation dialog before proceeding.
- When the user confirms removal, the MCP server and its configuration are deleted from the workspace and it is no longer shown.
- MCP server credentials configured from the integrations screen are stored as global application configuration rather than inside a single agent configuration.
- The MCP servers section adapts correctly to mobile viewports.

## Shared

- All globally configured MCP servers (including Composio once activated) are available for per-agent access configuration from the create or edit agent screen.
- The agent editor allows per-agent control over each globally registered MCP server: the entire server can be enabled or disabled for the agent, and individual tool permissions can be set to allow, ask, or deny.
- All MCP server configuration and credentials are persisted inside the workspace.
