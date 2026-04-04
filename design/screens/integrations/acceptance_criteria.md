# Integrations Acceptance Criteria

## Composio Integrations

- Selecting the integrations entry in navigation opens the integrations screen.
- The integrations screen shows a Composio integrations section as the first section of the screen.
- The Composio section shows all connected Composio integrations and available Composio apps when one or more exist.
- If no Composio integrations are connected, the Composio section shows an empty state and provides a way to browse and connect available Composio apps.
- The user can start a Composio app connection using Connect Links and managed OAuth provided by Composio.
- When Composio authentication succeeds, the integrations screen shows that app as connected.
- When Composio authentication fails or does not complete, the integrations screen does not show that app as connected.
- The integrations screen shows the current connection state for each Composio integration.
- When a Composio integration exposes one or more tools or actions, the integrations screen shows those tools for that integration.
- The user can disconnect a connected Composio integration. Selecting disconnect prompts the user with a confirmation dialog before proceeding.
- When the user confirms disconnection, the Composio integration is removed and its tools are no longer available to agents.
- Composio integration credentials are stored as global application configuration rather than inside a single agent configuration.

## MCP Servers

- The integrations screen shows an MCP servers section as the second section of the screen.
- The MCP servers section shows all configured MCP servers when one or more MCP servers exist.
- If no MCP servers exist, the MCP servers section shows an empty state and provides an action to add an MCP server.
- The MCP servers section allows the user to add an MCP server and start its authentication flow.
- When an MCP server supports authentication through the app, the integrations screen delegates that authentication flow through the app's MCP auth flow.
- When MCP server authentication succeeds, the integrations screen shows that server as connected.
- When MCP server authentication fails or does not complete, the integrations screen does not show that server as connected.
- The integrations screen shows the current connection state for each configured MCP server.
- When an MCP server exposes one or more integrations or tools, the integrations screen shows those integrations or tools for that server.
- The user can disable an MCP server for the workspace. A disabled MCP server remains in the configuration but is shown as disabled and its tools are not available to agents.
- The user can re-enable a disabled MCP server, restoring its tools to availability.
- The user can remove an MCP server permanently. Selecting remove prompts the user with a confirmation dialog before proceeding.
- When the user confirms removal, the MCP server and its configuration are deleted from the workspace and it is no longer shown.
- MCP server credentials configured from the integrations screen are stored as global application configuration rather than inside a single agent configuration.

## Shared

- Both Composio integrations and MCP servers configured on the integrations screen are available for per-agent access configuration from the create or edit agent screen.
- All integration and MCP server configuration is persisted inside the workspace.
