# Provider Connections

## Purpose

Provider Connections is the global screen for connecting and managing LLM providers in CommandsCenter. It should let the single operator authenticate providers once at the app level so their models become available across agents.

## Functional Description

- Show globally configured LLM provider connections in one place.
- Let the user start provider authentication using either OAuth or API key entry, depending on the provider flow supported by the app.
- Show the current connection state for each provider.
- Let the user manage provider credentials globally rather than per agent.
- Make connected provider models available to agent configuration and chat model selection flows.

## User Stories

- As a single user, I want to connect providers in one global screen, so that I do not have to repeat authentication for each agent.
- As a single user, I want to authenticate a provider with OAuth or API key entry, so that I can use the provider in the app regardless of its auth method.
- As a single user, I want to see which providers are connected, so that I know what model sources are available.
- As a single user, I want connected providers to make models available to agents, so that I can choose default and per-chat models from authenticated providers.
- As a single user, I want provider connections to remain separate from agent screens, so that global credentials are managed in one place.
