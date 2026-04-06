# I3 Custom Tools Platform

## Outcome

The user can define global custom tools, expose them through the app-managed MCP layer, and assign them to agents with explicit permissions.

## Why this is a separate PR

This is a complete capability platform with its own data model, backend execution layer, and management UI.

## Blockers

- C2 Agent Workspace Lifecycle
- I2 Integrations and MCP Management

## Unblocks

- U2 Agents and Agent Editor

## Scope

- Add custom tool schema and persistence
- Build custom tools CRUD screen
- Implement HTTP request configuration, validation, and execution rules
- Register custom tools into the user-configured custom tools MCP server established in I2
- Emit MCP `listChanged` notifications when tool definitions are created, updated, or deleted, forcing active agents to refresh their available toolsets without restart
- Support optional extra instructions injection per assigned custom tool
- Ensure custom tools screen is responsive on mobile viewports

## Acceptance Criteria

- The user can create, edit, and delete global custom tools
- Custom tools appear as assignable capabilities for agents
- Tool definitions are exposed through the custom tools MCP server
- Tool updates trigger MCP `listChanged` notifications that agents receive and act on without requiring restart or manual repair

- Custom tools screen adapts correctly to mobile viewports

## Non-Goals

- Composio auth itself
- Scheduling or cron execution
