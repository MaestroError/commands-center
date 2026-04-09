# I5 Composio Integration

## Context

Composio provides a managed MCP server that exposes 1000+ external app actions (GitHub, Slack, Jira, Notion, etc.) with built-in OAuth flows and token lifecycle management. CC treats Composio as a **built-in MCP server suggestion** — a pre-registered MCP entry where the connection details are already defined. The only difference from a user-added MCP server is that the user doesn't need to provide URLs, headers, or transport config — they just supply their API key or authenticate via OAuth.

All MCP auth, connection, per-agent access control, and workspace config mechanics are handled by I2. This epic only covers the Composio-specific UI and pre-registered server definition.

**Future (Enterprise):** Multi-profile Composio integration with CC-managed accounts and team-level tool provisioning. Out of scope for Phase 1.

## Outcome

The user can activate Composio from a dedicated section on the integrations screen by providing their API key or authenticating via OAuth. Once activated, Composio behaves like any other MCP server — I2 handles everything else.

## Why this is a separate PR

Composio has a dedicated UI section (pre-registered suggestion with simplified setup) that extends the integrations screen built by I2.

## Blockers

- I2 Integrations and MCP Management

## Unblocks

- No hard blockers downstream.

## Scope

- Add Composio as a built-in MCP suggestion in the integrations screen (dedicated section alongside user-added MCP servers)
- Pre-register Composio's MCP server definition (URL, transport type) so the user only needs to provide an API key or complete OAuth
- Provide a simplified setup flow: API key input or OAuth — no URL/header/transport configuration needed
- Store the API key securely (encrypted in DB, same pattern as other credentials)
- Once authenticated, Composio is registered as a normal global MCP server — all connection management, tool discovery, per-agent access, and workspace config rendering is handled by I2's infrastructure
- Composio section adapts correctly to mobile viewports

## Acceptance Criteria

- Composio appears as a built-in MCP suggestion on the integrations screen with a simplified setup flow
- The user can authenticate with API key or OAuth
- Once activated, Composio shows up as a normal MCP server with connection status and available tools (via I2)
- Per-agent enable/disable and tool permissions work through the standard I2 agent editor flow
- API key is stored securely (encrypted in DB, never exposed in API responses)
- Composio section adapts correctly to mobile viewports

## Non-Goals

- Deep Composio SDK integration (`composio-core` native tools mode) — we use MCP mode only
- Multi-profile / team Composio accounts (Enterprise feature, future phase)
- Composio-specific OAuth management for connected apps (users manage those via Composio's own dashboard)
- MCP auth, connection, per-agent config infrastructure (owned by I2)
- Custom tool HTTP request builder (owned by I3)
- Agent CRUD UI (owned by U2)
