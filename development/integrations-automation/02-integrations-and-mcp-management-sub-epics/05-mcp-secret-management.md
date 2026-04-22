# I2.5 MCP Secret Management

## Goal

Ensure that sensitive credentials required by MCP servers (API tokens, bearer headers, env var secrets) are never stored or transmitted in plain text. Users enter secrets through the UI, the backend stores them encrypted via a general-purpose Secrets domain, `opencode.jsonc` holds only symbolic references, and the OpenCode subprocess receives the real values at spawn time via environment variable injection.

MCP secrets are the first consumer of a general **Secrets domain** built in this sub-epic. Other parts of the app (provider connections, agent credentials, future integrations) will reuse the same infrastructure without any changes to the core secrets layer.

## Pre-Conditions

- Sub-Epic 1 (Global MCP Server Management) is complete.
- MCP servers are persisted in the `mcp_servers` table with `config_json`.
- The backend spawns or restarts the OpenCode process in a controlled way.
- OpenCode supports `{env:VAR_NAME}` substitution in `opencode.jsonc` (confirmed — substitution runs at parse time before JSONC is processed).

## The Approach

### Why `{env:VAR_NAME}` in opencode.jsonc

OpenCode's config loader replaces `{env:VAR_NAME}` tokens with `process.env[VAR_NAME]` before parsing. This means the workspace config file can hold symbolic references (`{env:CC_MCP_MYSERVER_GITHUB_TOKEN}`) instead of raw values. AI agents that read the workspace file see only the reference, never the credential.

The backend is responsible for:
1. Storing the real secret value encrypted in the DB via the Secrets domain.
2. Writing the `{env:...}` reference into `opencode.jsonc` during config sync.
3. Decrypting secrets and injecting them as env vars into the OpenCode subprocess on each spawn or reload.

### Variable Naming Convention

Each secret env var is namespaced to avoid collisions:

```
CC_MCP_{SERVER_NAME_UPPER}_{FIELD_UPPER}
```

Examples:
- Server `github`, field `GITHUB_TOKEN` → `CC_MCP_GITHUB_GITHUB_TOKEN`
- Server `linear`, header `Authorization` value → `CC_MCP_LINEAR_HEADER_AUTHORIZATION`

### What Goes in opencode.jsonc

Raw values are **never** written. Instead:

```jsonc
{
  "mcp": {
    "github": {
      "type": "stdio",
      "command": ["github-mcp-server"],
      "environment": {
        "GITHUB_TOKEN": "{env:CC_MCP_GITHUB_GITHUB_TOKEN}"
      }
    },
    "linear": {
      "type": "sse",
      "url": "https://mcp.linear.app/sse",
      "headers": {
        "Authorization": "{env:CC_MCP_LINEAR_HEADER_AUTHORIZATION}"
      }
    }
  }
}
```

### Lifecycle: When Env Vars Must Be (Re-)Injected

| Event | Required action |
|---|---|
| New MCP server added with secrets | Encrypt + store secrets; write `{env:...}` refs to config; reload OpenCode with injected env |
| Existing MCP server secrets updated | Re-encrypt; update config refs if var name changed; reload OpenCode |
| MCP server removed | Delete secrets from DB; remove config entry; reload OpenCode |
| Backend process (re)starts | Decrypt all active secrets from DB; inject into OpenCode spawn environment before first start |
| App cold start / full reload | Same as backend (re)start — secrets are always sourced from DB at spawn time |

### Encryption

- Algorithm: AES-256-GCM, key derived from `CC_SECRET_KEY` env var (set once by the operator / in `.env`, also update `.env.example` with example key).
- Each secret value is encrypted independently with a random IV stored alongside the ciphertext.
- The encryption key itself is never stored in the DB or written to any config file.

### API Response Masking

Secret field values are **never** returned in API responses. Instead, responses carry:

```json
{
  "key": "GITHUB_TOKEN",
  "isSet": true,
  "updatedAt": "2026-04-23T10:00:00Z"
}
```

The client can tell whether a secret is configured and when it was last changed, but cannot retrieve the value.

---

## Scope

### 1. General-Purpose Secrets Domain

The secrets infrastructure is built as a standalone domain, not coupled to MCP. This means any future feature can store and retrieve encrypted secrets without touching MCP code.

#### Database — `secrets` table

A single generic table for all app secrets:

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `domain` | text | logical owner type, e.g. `"mcp_server"`, `"provider"` |
| `owner_id` | text | ID of the owning entity (e.g. `mcp_servers.id`) |
| `key` | text | field name within that owner, e.g. `GITHUB_TOKEN` |
| `encrypted_value` | text | AES-256-GCM ciphertext + IV, base64-encoded |
| `env_var_name` | text | computed name used in config references, e.g. `CC_MCP_GITHUB_GITHUB_TOKEN` |
| `created_at` | integer | |
| `updated_at` | integer | |

Unique constraint on `(domain, owner_id, key)`.

#### Backend — `secret-service.ts`

A single service at `packages/backend/src/services/secret-service.ts` that all consumers call:

- `set(domain, ownerId, key, envVarName, plainValue)` — encrypts and upserts a secret.
- `delete(domain, ownerId, key)` — removes a single secret record.
- `deleteAllForOwner(domain, ownerId)` — removes all secrets for an owner; called when the owner entity is deleted.
- `listMeta(domain, ownerId)` — returns `{ key, isSet, envVarName, updatedAt }[]` with no plaintext values.
- `buildEnvMap(domain?)` — decrypts all secrets (optionally filtered by domain), returns `Record<string, string>` keyed by `env_var_name`; used when spawning subprocesses.
- `isEnvVarLoaded(envVarName)` — checks whether a given env var is currently present in the active subprocess environment; used for status checks.
- `getStatus(domain?)` — returns a per-owner summary of `{ ownerId, secrets: { key, isSet, isLoaded }[] }`; used by the Secrets Management page.

#### Shared schemas — `packages/shared/src/schemas/secrets.ts`

New shared schema file (not inside `mcp.ts`):

- `SecretMetaSchema` — `{ key, isSet, updatedAt }` — the shape returned in API responses.
- `SetSecretRequestSchema` — `{ value: string }` — body for PUT secret endpoint.
- `SecretStatusSchema` — shape for the global status response.

#### Routes — `packages/backend/src/routes/secrets.ts`

Domain-agnostic routes. The `domain` and `ownerId` are path parameters so any future feature can reuse them without new routes:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/secrets/:domain/:ownerId` | List secret metadata for an owner (no values) |
| `PUT` | `/api/secrets/:domain/:ownerId/:key` | Set or update a secret |
| `DELETE` | `/api/secrets/:domain/:ownerId/:key` | Revoke a secret |
| `DELETE` | `/api/secrets/:domain/:ownerId` | Revoke all secrets for an owner |
| `GET` | `/api/secrets/status` | Global secrets status across all domains |
| `GET` | `/api/secrets/status/:domain` | Status filtered to a single domain |

#### Frontend hooks — `use-secrets-query.ts`

Generic React Query hooks parameterised by `domain` and `ownerId`:

- `useSecretsMeta(domain, ownerId)` — list secret metadata.
- `useSetSecret(domain, ownerId)` — mutation for setting a value.
- `useRevokeSecret(domain, ownerId)` — mutation for deletion.
- `useSecretsStatus(domain?)` — global or domain-scoped status.

---

### 2. MCP Integration (First Consumer)

The MCP layer calls `secret-service.ts` with `domain: "mcp_server"`. Nothing in the secrets domain knows about MCP internals.

#### Config Sync Integration

`syncGlobalConfig()` in `mcp-server-service.ts` is updated to call `secretService.listMeta("mcp_server", serverId)` and substitute each secret field with `{env:envVarName}` in the rendered config entry. Raw values are never passed to `renderConfigEntry()`.

#### OpenCode Spawn Integration

Wherever the backend spawns or restarts the OpenCode process, it calls `secretService.buildEnvMap("mcp_server")` and merges the result into the subprocess environment:

```ts
const secretEnv = await secretService.buildEnvMap("mcp_server");
spawnOpenCode({
  env: { ...process.env, ...secretEnv }
});
```

This is the only point where decrypted values exist in memory.

#### MCP Server Add/Edit Form Updates

Fields that accept secrets (env var values, header values) use `<input type="password">` with `autocomplete="off"`. On submit:

1. Non-secret config fields are written to `config_json` as before.
2. Secret fields are routed to `secretService.set("mcp_server", id, key, envVarName, value)` — not stored in `config_json`.
3. `syncGlobalConfig()` writes the updated `opencode.jsonc` with `{env:...}` refs.
4. OpenCode is reloaded with the fresh env map injected.

Existing secrets are shown as `{ isSet: true }` in the edit form — the user can leave them unchanged or overwrite.

---

### 3. Secrets Management Page (`SecretsPage.tsx`)

A standalone page in the settings or integrations area, reachable from the sidebar. It is domain-aware — it shows sections per domain, and MCP servers are the first section.

**MCP Servers section:**
- One panel per MCP server that has at least one secret.
- Each panel shows server name, transport type, and a table of secret keys.
- Per-secret row: key name, masked value (`••••••••`), last-updated timestamp, loaded status badge (green "Loaded" / yellow "Not loaded").
- Per-secret actions: **Update** (inline password input), **Revoke** (deletes secret, removes ref from config).
- Add-secret button per server for new fields.

**Global status banner:**
- If any configured secrets are not currently injected into the OpenCode process (e.g. after a backend restart where injection was skipped, or after key rotation), a warning banner appears at the top with a **Reload OpenCode** action that re-injects all secrets and restarts the process.

**Extensibility:**
- When future domains (e.g. provider credentials) store secrets, they appear as additional sections on this same page without any structural changes to the page.

---

## Out of Scope

- OS keychain integration (unnecessary given subprocess env injection).
- Multi-user or per-session secret scoping (all secrets are workspace-global for now).
- Secret rotation scheduling or expiry.
- Audit log of secret access.

## Acceptance Criteria

- No MCP secret value is ever stored in plain text in `config_json` or written as a raw value in `opencode.jsonc`.
- Secrets entered via UI are encrypted before hitting the DB using AES-256-GCM.
- API responses never include plaintext secret values — only `isSet` + metadata.
- The OpenCode subprocess receives decrypted secrets as env vars at spawn time via `buildEnvMap()`.
- The Secrets Management page shows all configured secrets with per-key loaded status and allows update/revoke.
- Adding or updating an MCP server with secret fields triggers config sync and OpenCode reload.
- `secretService.isEnvVarLoaded()` correctly detects whether a variable is active in the current OpenCode process environment.
- A status banner warns when secrets are configured but not currently injected, with a one-click reload action.
- A future feature can store secrets by calling `secretService.set("new_domain", ownerId, key, envVarName, value)` with no changes to secrets infrastructure.

## Key Files to Create/Modify

**Secrets domain (new, shared infrastructure):**
- `packages/backend/src/db/schema/secrets.ts` — `secrets` table schema
- `packages/backend/src/services/secret-service.ts` — general-purpose secrets service
- `packages/backend/src/routes/secrets.ts` — domain-agnostic secret routes
- `packages/shared/src/schemas/secrets.ts` — `SecretMeta`, `SetSecretRequest`, `SecretStatus` schemas
- `packages/frontend/src/lib/api.ts` — secrets client methods
- `packages/frontend/src/hooks/use-secrets-query.ts` — generic React Query hooks
- `packages/frontend/src/pages/SecretsPage.tsx` — Secrets Management page

**MCP integration (modify existing):**
- `packages/backend/src/services/mcp-server-service.ts` — update `renderConfigEntry()` and `syncGlobalConfig()` to write `{env:...}` refs; update spawn path to call `buildEnvMap("mcp_server")`
- `packages/frontend/src/pages/IntegrationsPage.tsx` — update add/edit MCP forms to use password fields and route secrets to secrets API

## Reference

- `examples/opencode/packages/opencode/src/config/paths.ts` — `{env:VAR}` substitution implementation (lines 77–81)
- `examples/opencode/packages/opencode/src/mcp/index.ts` — how MCP subprocess env is constructed at spawn time
- `packages/backend/src/services/mcp-server-service.ts` — existing `renderConfigEntry()` and `syncGlobalConfig()`
- Sub-Epic 1 (`01-global-mcp-server-management.md`) — MCP lifecycle patterns to extend
