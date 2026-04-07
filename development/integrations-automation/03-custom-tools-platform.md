# I3 Custom Tools Platform

## Outcome

The user can define global custom tools, expose them through the app-managed MCP layer, and assign them to agents with explicit permissions.

## Why this is a separate PR

This is a complete capability platform with its own data model, backend execution layer, and management UI.

## Blockers

- C2 Agent Workspace Lifecycle
- I2 Integrations and MCP Management

## Unblocks

- No hard blockers downstream. Extends the agent editor with custom tools assignment.

## Scope

- Add custom tool schema and persistence
- Implement custom tools CRUD as a backend service exposed via REST API routes
- Build custom tools CRUD screen
- Implement HTTP request configuration, validation, and execution rules
- Register custom tools into the user-configured custom tools MCP server established in I2
- Emit MCP `listChanged` notifications when tool definitions are created, updated, or deleted, forcing active agents to refresh their available toolsets without restart
- Support optional extra instructions injection per assigned custom tool
- Add custom tools section to the agent editor: per-agent tool assignment and permission controls
- Update agent workspace config (`opencode.jsonc`) when custom tool assignments change
- Ensure custom tools screen and agent editor custom tools section are responsive on mobile viewports

## Acceptance Criteria

- The user can create, edit, and delete global custom tools
- Custom tools appear in the agent editor as assignable capabilities with per-agent permission controls
- Agent workspace `opencode.jsonc` is updated when custom tool assignments are saved
- Tool definitions are exposed through the custom tools MCP server
- Tool updates trigger MCP `listChanged` notifications that agents receive and act on without requiring restart or manual repair
- Custom tool CRUD is implemented as a decoupled service reusable by future surfaces (MCP, CLI)
- Custom tools screen and agent editor section adapt correctly to mobile viewports

## Non-Goals

- Composio auth itself
- Scheduling or cron execution
