# I6 App-Provided MCP Server

## Outcome

CC exposes its own MCP server that gives agents access to app-level capabilities — actions that interact with CC itself rather than external services (e.g., scheduling automations, querying app state, managing workspace files).

## Why this is a separate PR

This is CC's own tool surface — distinct from external MCP servers (I2), user-defined custom tools (I3), and Composio (I5). It has its own lifecycle tied to the CC backend and its own tool registration logic.

## Blockers

- E2 OpenCode Orchestrator
- C2 Agent Workspace Lifecycle

## Unblocks

- I4 Automations (agents need the app MCP server to create/manage cron jobs)

## Scope

- Establish the app-provided MCP server: a CC-managed MCP server using SSEServerTransport with token auth that exposes CC's own tools to OpenCode agents
- Register the app-provided MCP server in the global `opencode.jsonc` so OpenCode connects to it automatically
- Implement initial app-provided tools (TBD — starting with automation scheduling for agents)
- Support dynamic tool registration and MCP `listChanged` notifications as new app tools are added
- Per-agent access control via workspace `opencode.jsonc` permission rules (same pattern as all other MCP servers)

## Acceptance Criteria

- The app-provided MCP server is operational and OpenCode can connect to it
- Registered app tools are discoverable via MCP `tools/list`
- Per-agent permission control works through the standard workspace config pattern
- The server starts and stops cleanly with the CC backend lifecycle

## Non-Goals

- External MCP server management (owned by I2)
- Custom tools MCP server (owned by I3)
- Composio integration (owned by I5)
- Specific automation tool implementation (owned by I4, registers tools into this server)
