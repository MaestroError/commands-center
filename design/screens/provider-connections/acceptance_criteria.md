# Provider Connections Acceptance Criteria

- Selecting the provider connections entry in navigation opens the provider connections screen.
- The provider connections screen shows the providers supported by the app and the current connection state for each provider.
- The provider connections screen provides a way to start provider authentication for a provider.
- If a provider supports OAuth authentication in the app, the provider connections screen provides an OAuth flow for that provider.
- If a provider supports API key authentication in the app, the provider connections screen provides an API key entry flow for that provider.
- When provider authentication succeeds, the provider connections screen shows that provider as connected.
- When provider authentication fails or does not complete, the provider connections screen does not show the provider as connected.
- Provider credentials configured from the provider connections screen are stored as global application configuration rather than inside a single agent configuration.
- When one or more providers are connected and models are available, those models are available from the default model selector in the create or edit agent screen.
- When one or more providers are connected and models are available, those models are available from the model selector in direct chat.
