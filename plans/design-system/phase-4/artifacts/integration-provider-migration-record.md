# Integration and Provider Migration Record (DS-0406)

- Task: [DS-0406](../06-integrations-providers.md)
- Exception: EX-002 remains limited to `pages/integrations/integration-icons.tsx`.

## Decisions and deltas

- Raw palette occurrences: **27 → 0** across integration helpers, page chrome, and the MCP dialog.
- Connected uses success, authorization/registration attention uses warning, failed uses danger, and inactive/default remains neutral.
- Metadata prefixes (`auth`, `category`, `language`, `launcher`, `type`, `source`) are descriptive facets, not state or provider brands; they use the neutral badge role instead of creating a category palette.
- Provider artwork and its fixed brand colors remain unchanged inside semantic CC containers.
- OAuth/API-key/MCP payloads, secrets, validation, mutations, query invalidation, and connection behavior were not changed.

Verification is owned by integration/MCP unit tests and `e2e/provider-connections.spec.ts`.
