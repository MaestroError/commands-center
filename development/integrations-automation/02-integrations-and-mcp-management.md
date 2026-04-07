# I2 Integrations and MCP Management

## Outcome

The user can manage global MCP servers and Composio integrations, authenticate them, inspect status, and make them available for per-agent permission assignment.

## Why this is a separate PR

This is a complete feature area with one screen and one clear capability boundary for global integration management.

## Blockers

- E2 OpenCode Orchestrator
- C2 Agent Workspace Lifecycle

## Unblocks

- U2 Agents and Agent Editor
- I3 Custom Tools Platform

## Scope

- Build integrations screen with separate Composio and MCP sections
- Establish the two internal MCP server architecture: one server for app-provided tools (Composio integrations, automation scheduling for agents, and other app-level interactions) and one for user-configured custom tools, using SSEServerTransport with token auth
- Implement global MCP add, remove, enable, disable, and auth flows
- Implement Composio connect and disconnect flows
- Show connection state and available tools per integration
- Persist integration state inside the workspace
- Update per-agent capability sources used by the agent editor
- Ensure integrations screen is responsive on mobile viewports

## Acceptance Criteria

- Behavior matches `design/screens/integrations/acceptance_criteria.md`
- Two internal MCP servers (app-provided tools and user-configured custom tools) are operational and can register tools independently
- MCP servers can be configured and authenticated through the app flow
- Composio connections can be established and revoked through the app flow
- Connected capabilities appear in per-agent access configuration
- Changes that require OpenCode reload are applied through a controlled orchestrator path
- Integrations screen adapts correctly to mobile viewports

## Non-Goals

- User-defined custom tool server
- Automation execution
