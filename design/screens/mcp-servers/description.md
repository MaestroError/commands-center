# MCP Servers

## Purpose

MCP Servers is the global screen for connecting and managing Model Context Protocol servers in CommandsCenter. It should let the single operator authenticate server connections once at the app level, review their connection state and available integrations, and then use agent configuration to control which servers and tools each agent may access.

## Functional Description

- Show globally configured MCP server connections in one place.
- Let the user add and authenticate an MCP server through the app's delegated OpenCode authentication flow.
- Show the current connection state for each MCP server.
- Let the user review the integrations or toolsets exposed by each connected MCP server.
- Keep MCP server authentication global while leaving per-agent access control to the create or edit agent screen.
- Reflect server-level disablement when an MCP server is disabled for the workspace.

## User Stories

- As a single user, I want to connect MCP servers in one global screen, so that shared integrations are configured once for the whole app.
- As a single user, I want to authenticate an MCP server through the app, so that external services such as Jira, Notion, or GitHub can be used by agents.
- As a single user, I want to see whether an MCP server is connected and what integrations it exposes, so that I understand what can be made available to agents.
- As a single user, I want MCP server connection setup to stay separate from per-agent permission choices, so that global authentication and agent access remain distinct workflows.
- As a single user, I want MCP server configuration to remain in the workspace, so that connection state and setup survive restarts and workspace moves.
