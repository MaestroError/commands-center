# Integrations

## Purpose

Integrations is the global screen for managing external service connections in CommandsCenter. It combines Composio-based app integrations and MCP server connections into one unified screen. The single operator can authenticate services once at the app level, review their connection state and available tools, and then use agent configuration to control which integrations each agent may access.

## Functional Description

### Composio Integrations

- Show Composio-based app integrations as the first section of the screen.
- Let the user browse available Composio apps and connect them using Composio Connect Links and managed OAuth.
- Show the current connection state for each Composio integration.
- Let the user review the tools or actions exposed by each connected Composio integration.
- Let the user disconnect a Composio integration when it is no longer needed.
- Keep Composio integration authentication global while leaving per-agent tool access control to the create or edit agent screen.

### MCP Servers

- Show MCP server connections as the second section of the screen.
- Let the user add and authenticate an MCP server through the app's delegated OpenCode authentication flow.
- Show the current connection state for each MCP server.
- Let the user review the integrations or toolsets exposed by each connected MCP server.
- Let the user disable an MCP server for the workspace without removing its configuration.
- Let the user remove an MCP server permanently when it is no longer needed.
- Keep MCP server authentication global while leaving per-agent access control to the create or edit agent screen.

### Shared

- Save all integration and MCP server configuration inside the workspace so connection state and setup remain portable.
- Integrations and MCP servers configured on this screen are available for per-agent access configuration from the create or edit agent screen.

## User Stories

- As a single user, I want one screen for all external integrations, so that I can manage Composio apps and MCP servers in one place.
- As a single user, I want to connect Composio apps through managed OAuth, so that external services such as Jira, Notion, or GitHub can be used by agents.
- As a single user, I want to disconnect a Composio integration, so that I can revoke access when it is no longer needed.
- As a single user, I want to add and authenticate MCP servers, so that additional tool providers can be used by agents.
- As a single user, I want to disable an MCP server without removing it, so that I can temporarily stop agents from accessing it.
- As a single user, I want to remove an MCP server permanently, so that I can clean up servers I no longer use.
- As a single user, I want to see connection state and available tools for all integrations, so that I understand what can be made available to agents.
- As a single user, I want integration configuration to remain in the workspace, so that connection state and setup survive restarts and workspace moves.
