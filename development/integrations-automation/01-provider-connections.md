# I1 Provider Connections

## Outcome

The user can connect global LLM providers, store API keys or complete OAuth flows, and expose available models to agent creation and chat.

## Why this is a separate PR

This is a complete global capability with clear UI, backend, and engine integration boundaries.

## Blockers

- E2 OpenCode Orchestrator

## Unblocks

- U2 Agents and Agent Editor
- U3 Direct Chat Screen

## Scope

- Implement provider status and model listing APIs
- Implement API key submission flow via OpenCode auth/config APIs
- Implement OAuth flow delegation and callback handling with configured timeouts
- Build provider connections screen UI
- Surface available models to the agent editor and chat model selector

## Acceptance Criteria

- The user can see provider connection state globally
- API key and OAuth flows can connect a provider successfully
- Connected provider models become selectable in the app
- Provider credentials are stored through OpenCode, not ad hoc app storage

## Non-Goals

- MCP servers
- Composio integrations
