# I6 App-Provided MCP Server

## Outcome

CC exposes its own app-provided MCP surface for agent-only CommandsCenter capabilities, but not as one global undifferentiated tool list. Instead, each agent gets its own logical app MCP endpoint, resolved by agent slug, so CC can publish a different enabled tool set per agent.

## Why this is a separate PR

This is CC's own tool surface — distinct from external MCP servers (I2), user-defined custom tools (I3), and Composio (I5). It has its own lifecycle tied to the CC backend and its own tool registration logic.

## Blockers

- E2 OpenCode Orchestrator
- C2 Agent Workspace Lifecycle

## Unblocks

- I4 Automations (agents need the app MCP server to create/manage cron jobs)

## Decision

- Do not treat the app-provided MCP server as one global static server entry shared by every agent.
- Do not rely only on workspace permission rules to hide app tools from agents.
- Give each agent its own logical app MCP endpoint, addressed by agent slug, so the backend can resolve the exact app tool set for that agent.
- Keep one stable MCP server name in the workspace config, for example `cc_app`, so tool names remain predictable (`cc_app_<toolname>`), while the URL differs per agent.
- Resolve tool access server-side from the agent slug. The MCP server should only publish tools enabled for that agent.
- Keep OpenCode permission rules as defense in depth and prompt-control for published tools, not as the primary way to hide tools that should not exist for an agent.
- Build the server using the official TypeScript MCP SDK package: `@modelcontextprotocol/sdk`.
- Fastify does not provide MCP server functionality itself. Fastify should only host the HTTP endpoint, auth checks, origin validation, and lifecycle wiring around the SDK transport.
- Prefer the official HTTP MCP transport shape for new work. If OpenCode compatibility still requires the older SSE transport path, keep that as a compatibility detail behind the same service boundary rather than making Fastify itself the protocol implementation.

## Architecture

### Agent-Specific Endpoint Model

- Each agent workspace should register the app-provided MCP server in that agent's own `opencode.jsonc`, not only in the global root config.
- The MCP endpoint URL should encode the agent identity, for example `/api/mcp/app/agents/:agentSlug` or an equivalent stable route.
- The backend resolves the agent from the slug in the route and serves only the app tools enabled for that agent.
- This creates one logical app MCP per agent without requiring one separate backend process per agent.
- Because the server name stays stable, tool names stay stable too. Only the endpoint URL changes between agents.

### Tool Access Model

- Add app-provided tool access as an explicit per-agent configuration surface.
- The minimum required control is per-tool enable or disable for each agent.
- The app MCP server should use that per-agent configuration as the source of truth for `tools/list` and tool invocation eligibility.
- If a tool is disabled for an agent, it should not be published in `tools/list` for that agent and should reject direct invocation if somehow addressed anyway.
- The agent editor should later expose this as a dedicated app-tools section or as the app-server subsection of the MCP permissions area.

### Service Split

- Add one dedicated backend service responsible for app MCP lifecycle, endpoint/session handling, agent resolution, and `listChanged` notifications.
- Add one separate registry module for app-provided tool definitions, where every tool has a stable name, description, argument schema, and executor binding.
- The MCP lifecycle service should ask the access service which tools are enabled for the current agent, then materialize only that subset from the registry.
- Tool implementation modules should stay small and focused. The registry should be the single place where CC-owned MCP tools are declared and described.

Recommended shape:

```text
packages/backend/src/mcp/
	app-mcp-server-service.ts      # transport bridge, sessions, agent routing, listChanged
	app-tool-access-service.ts     # resolves enabled app tools per agent
	app-tool-registry.ts           # canonical tool names, descriptions, schemas, factories
	app-tools/
		schedule-task.ts
		get-task-status.ts
		...future app tools...
```

### Runtime Flow

1. Agent workspace `opencode.jsonc` includes a `cc_app` MCP server entry pointing to the agent-specific app MCP URL.
2. OpenCode connects to that endpoint while operating inside that agent workspace.
3. The app MCP service resolves the agent from the slug in the URL.
4. The app tool access service loads the enabled tool set for that agent.
5. The app tool registry materializes only those tool definitions.
6. The SDK server responds to `tools/list` with that filtered tool set.
7. When the enabled tool set for an agent changes, CC emits `listChanged` for sessions attached to that agent so OpenCode refreshes tools without requiring a full restart.

## Scope

- Establish the app-provided MCP server using `@modelcontextprotocol/sdk`, hosted through the CC backend HTTP layer
- Register the app-provided MCP server in each agent workspace `opencode.jsonc` using an agent-specific URL that resolves by agent slug
- Add a dedicated service that resolves enabled app tools for a given agent
- Add a dedicated registry file or module where app tools are declared with stable names and descriptions
- Implement initial app-provided tools through that registry, starting with the automation hooks required by I4
- Support dynamic tool registration and agent-scoped `listChanged` notifications when an agent's enabled app tool set changes
- Enforce per-agent tool enable or disable in the backend service, not only in workspace permission rules
- Add endpoint auth, origin validation, and lifecycle cleanup for the app MCP transport

## Implementation Notes

- Package choice: use the official MCP TypeScript SDK, `@modelcontextprotocol/sdk`.
- Fastify role: host the HTTP route, validate auth and origin, and participate in app startup and shutdown. Fastify is not the MCP protocol layer.
- Transport choice: prefer the current official HTTP MCP transport shape for new work. Keep SSE compatibility only if the OpenCode client path in this project still depends on it.
- Security: bind locally when possible, validate `Origin` on HTTP requests, and require an app-issued auth token for agent MCP access.
- Routing: the agent slug should come from the URL path rather than an untrusted tool argument.
- Stability: keep the MCP server name stable across workspaces so tool permission patterns do not change when agent slugs change.
- Portability: all configuration needed to resolve and authorize the agent-specific app MCP endpoint must remain inside `.cc/workspace`.

## Acceptance Criteria

- The app-provided MCP endpoint is operational and OpenCode can connect to it from an agent workspace
- Each agent workspace receives an app MCP server config entry whose URL resolves that specific agent by slug
- Different agents can receive different app tool sets from the same backend runtime
- Registered app tools are discoverable via MCP `tools/list`, but only when enabled for the current agent
- Disabled app tools do not appear in `tools/list` for that agent and are rejected on direct invocation
- Tool names remain stable across agents because the MCP server name is stable
- The app MCP lifecycle service and tool registry are separate modules with clear responsibilities
- Agent tool-set changes trigger `listChanged` for the affected agent sessions
- The server starts and stops cleanly with the CC backend lifecycle

## Non-Goals

- External MCP server management (owned by I2)
- Custom tools MCP server (owned by I3)
- Composio integration (owned by I5)
- Specific automation business logic implementation (owned by I4, which registers tools into this server)
- One separate OS process per agent for the app MCP surface
- Using Fastify alone as the MCP implementation without the official SDK
