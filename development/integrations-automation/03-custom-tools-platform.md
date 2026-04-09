# I3 Custom Tools Platform

## Outcome

The user can define global custom tools (configurable HTTP requests), expose them to agents through a dedicated custom tools MCP server managed by CC, and assign them per-agent with explicit permissions.

## Why this is a separate PR

This is a complete capability platform with its own data model, MCP server infrastructure, backend execution layer, and management UI.

## Blockers

- C2 Agent Workspace Lifecycle
- I2 Integrations and MCP Management (for agent editor MCP permission patterns)

## Unblocks

- No hard blockers downstream. Extends the agent editor with custom tools assignment.

## Scope

### Custom Tools MCP Server

- Establish the custom tools MCP server: a CC-managed MCP server using SSEServerTransport with token auth that dynamically exposes user-defined custom tools to OpenCode
- Register the custom tools MCP server in the global `opencode.jsonc` so OpenCode connects to it automatically
- Emit MCP `listChanged` notifications when tool definitions are created, updated, or deleted, forcing active agents to refresh their available toolsets without restart

### Custom Tool CRUD

- Add custom tool schema and persistence (name, description, HTTP config, optional extra instructions)
- Implement custom tools CRUD as a backend service exposed via REST API routes
- Build custom tools CRUD screen
- Implement HTTP request configuration, validation, and execution rules

### Per-Agent Assignment

- Register custom tools into the custom tools MCP server
- Support optional extra instructions injection per assigned custom tool
- Add custom tools section to the agent editor: per-agent tool assignment and permission controls (allow, ask, deny)
- Update agent workspace config (`opencode.jsonc`) when custom tool assignments change
- Ensure custom tools screen and agent editor custom tools section are responsive on mobile viewports

## Acceptance Criteria

- The custom tools MCP server is operational and OpenCode can connect to it
- The user can create, edit, and delete global custom tools
- Custom tools appear in the agent editor as assignable capabilities with per-agent permission controls
- Agent workspace `opencode.jsonc` is updated when custom tool assignments are saved
- Tool definitions are exposed through the custom tools MCP server
- Tool updates trigger MCP `listChanged` notifications that agents receive and act on without requiring restart or manual repair
- Custom tool CRUD is implemented as a decoupled service reusable by future surfaces (MCP, CLI)
- Custom tools screen and agent editor section adapt correctly to mobile viewports

## Non-Goals

- App-provided tools MCP server (owned by I6)
- Composio integration (owned by I5)
- Scheduling or cron execution (owned by I4)
