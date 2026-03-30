# MCP Servers Acceptance Criteria

- Selecting the MCP servers entry in navigation opens the MCP servers screen.
- The MCP servers screen shows all configured MCP servers when one or more MCP servers exist.
- If no MCP servers exist, the MCP servers screen shows an empty state and provides an action to add an MCP server.
- The MCP servers screen allows the user to add an MCP server and start its authentication flow.
- When an MCP server supports authentication through the app, the MCP servers screen delegates that authentication flow through the app's MCP auth flow.
- When MCP server authentication succeeds, the MCP servers screen shows that server as connected.
- When MCP server authentication fails or does not complete, the MCP servers screen does not show that server as connected.
- The MCP servers screen shows the current connection state for each configured MCP server.
- When an MCP server exposes one or more integrations or tools, the MCP servers screen shows those integrations or tools for that server.
- MCP server credentials configured from the MCP servers screen are stored as global application configuration rather than inside a single agent configuration.
- If an MCP server is disabled for the workspace, the MCP servers screen shows that the server is disabled.
- MCP servers configured on the MCP servers screen are available for per-agent access configuration from the create or edit agent screen.
