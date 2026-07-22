# Public MCP OAuth and URL-Key Removal

**Status:** Steps 1–7 implemented and automated verification complete. Claude
web and Claude Code release smoke tests remain environment-dependent. Authored
2026-07-22.

## Implementation Progress

- [x] Step 1 — Add and isolate the OAuth provider dependencies
- [x] Step 2 — Add persistent provider storage
- [x] Step 3 — Map OAuth grants to active API-token principals
- [x] Step 4 — Add metadata, interaction, and challenge routes
- [x] Step 5 — Build the public authorization page
- [x] Step 6 — Remove URL-key authentication and update owner guidance
- [x] Step 7 — End-to-end protocol and client verification
- [x] Step 7 follow-up — Verify one MCP SDK client drives the complete OAuth cycle

### Review follow-up

- [x] Remove bearer-token prefix classification and fall back from direct API-token
      validation to MCP OAuth resolution.
- [x] Add non-cacheable, non-frameable response headers to the rendered OAuth
      authorization page.
- [ ] Scope provider grant revocation to the current adapter model.
- [ ] Run lint and tests, push each fix as a separate commit, and resolve the
      corresponding review threads.

## Goal

Make the public MCP endpoint interoperable with OAuth-capable MCP clients while
preserving CC's single-owner, API-token permission model.

After this feature, `/api/public/mcp` accepts exactly two credential forms:

1. A CC API token in `Authorization: Bearer cc_...`.
2. An opaque OAuth access token in the same `Authorization: Bearer ...` header.

The `?key=<API_TOKEN>` URL credential is removed. A stale URL containing `key`
is never authenticated, but its value remains redacted from logs.

## Acceptance Criteria

- Claude and other conforming MCP clients discover OAuth from an unauthenticated
  `/api/public/mcp` request without the owner manually entering a client ID.
- The client dynamically registers as a public client, opens CC's authorization
  page, completes Authorization Code + S256 PKCE, and receives refreshable OAuth
  tokens.
- The authorization page asks for a CC API token in a password field. It does
  not ask for an owner username/password and does not create a CC user account.
- OAuth MCP sessions expose exactly the tools allowed by the submitted API
  token's current permissions.
- Revoking the API token immediately invalidates every OAuth access and refresh
  path derived from it. Editing token permissions takes effect on the next MCP
  request without reauthorizing.
- Existing header-based API-token MCP clients continue to work unchanged.
- Public REST endpoints continue to accept only CC API tokens in the Bearer
  header; OAuth access tokens are audience-bound to public MCP and are rejected
  by REST routes.
- `?key=` does not authenticate MCP or REST requests. MCP returns a standard
  OAuth challenge; REST returns the existing unauthorized response.
- OAuth metadata, authorization, token, refresh, registration, revocation,
  cancellation, expiration, and restart behavior have integration coverage.
- `pnpm design-system:audit`, typecheck, lint, unit/integration tests, the MCP
  client E2E test, and the relevant Playwright flow pass.

## Decisions Locked In

### 1. Use `oidc-provider` as the protocol engine

Add `oidc-provider` and mount it in Fastify through `@fastify/middie`. Keep all
provider-specific types and configuration behind a small `oauth/` boundary.

Why:

- It supplies Authorization Server Metadata, Authorization Code, PKCE, Dynamic
  Client Registration (DCR), refresh-token rotation, revocation, Resource
  Indicators, and the protocol error handling that should not be maintained by
  CC.
- It supports mounting in Fastify and requires a production storage adapter and
  custom interaction UI, which are the two CC-specific pieces we actually need.
- Pin it with a tilde range to the reviewed minor line because its experimental
  features may make breaking changes in minor releases. Do not enable any
  experimental feature in this implementation.

Add these package dependencies to `packages/backend/package.json`:

- `oidc-provider` as a runtime dependency, pinned to the reviewed `~9.8` line.
- `@fastify/middie` as a runtime dependency compatible with Fastify 5.
- `@fastify/rate-limit` as a runtime dependency for the unauthenticated OAuth
  endpoints.
- `@types/oidc-provider` as a development dependency if the installed provider
  line still relies on DefinitelyTyped.

Do not use `@fastify/oauth2`; it is an OAuth client plugin, not an authorization
server. Do not use Better Auth for this feature because its user/session model
would duplicate CC's owner and API-token identity models.

### 2. DCR public clients only; no client secret

Enable automatic Dynamic Client Registration and advertise its registration
endpoint. Registered clients must use:

- `grant_types: ["authorization_code", "refresh_token"]`
- `response_types: ["code"]`
- `token_endpoint_auth_method: "none"`
- S256 PKCE on every authorization request

Reject client-secret authentication methods and do not issue a client secret.
Do not add a manual OAuth-client settings UI or environment variables for static
client IDs/secrets.

This is the v1 answer to "client ID + secret or automatic registration?": use
automatic registration with a generated client ID and no secret. MCP desktop,
CLI, and browser clients cannot safely keep a shared client secret, so a secret
adds rotation and support work without adding meaningful protection. PKCE is
the protection for these public clients.

Client ID Metadata Documents (CIMD) are deliberately out of scope for this
feature. The current `oidc-provider` support is experimental, and enabling it
would make CC fetch attacker-selected URLs and therefore require a hardened
SSRF policy, DNS rebinding protection, caching, and extra upgrade testing. Add
CIMD later as a separately reviewed compatibility improvement; DCR solves the
current Claude registration failure now.

### 3. The API token is the OAuth resource-owner credential

CC still has no user accounts. The authorization interaction validates the
pasted API token once and stores only its `api_tokens.id` as the provider
`accountId`/subject. The raw `cc_...` value is never persisted in OAuth state,
cookies, grants, or logs.

The API token remains the sole source of authorization:

- OAuth scope is only `mcp`; do not copy CC capability IDs into OAuth scopes.
- The OAuth grant identifies an API-token record.
- Every MCP request resolves that record again from `api_tokens`, checks that it
  is active, and uses its current `ApiTokenRecord` for the existing per-tool
  filtering and checks.
- API-token revocation therefore fails closed immediately without a background
  synchronization job.

### 4. OAuth is MCP-only

The protected resource is the exact canonical URI:

`<CC_PUBLIC_ORIGIN>/api/public/mcp`

Enable RFC 8707 Resource Indicators and issue access tokens only for that
resource. The MCP bearer resolver verifies issuer, token state, `scope=mcp`, and
the exact resource/audience before attaching the backing `ApiTokenRecord`.

Do not accept OAuth access tokens on `/api/public/v1/*`. Those routes keep the
existing `cc_...` API-token Bearer contract.

### 5. Stable public origin and HTTPS policy

Build issuer and resource URLs only from `config.security.publicOrigin`; never
trust the request `Host` header.

- Issuer: `<CC_PUBLIC_ORIGIN>/oauth`
- Resource: `<CC_PUBLIC_ORIGIN>/api/public/mcp`

Allow plain HTTP only when the public origin host is a loopback host in local
development/test. Reject an externally addressed non-HTTPS `CC_PUBLIC_ORIGIN`
at startup with an actionable message. Keep the existing warning that an
externally exposed installation must set `CC_PUBLIC_ORIGIN` to the proxy-facing
origin.

Add `CC_TRUST_PROXY` (default `false`) and use it for both Fastify's `trustProxy`
setting and `provider.proxy`. Reverse-proxy deployments enable it only when the
backend is not directly reachable from untrusted networks and the proxy
overwrites forwarded headers. This also makes OAuth secure-cookie handling and
per-source rate limiting consistent. Document the proxy requirement in
`.env.example`.

Changing `CC_PUBLIC_ORIGIN` changes the OAuth issuer. Document that existing
client registrations and OAuth tokens then become invalid and clients must
reconnect.

### 6. Runtime OAuth state belongs in SQLite

Create one generic provider-adapter table rather than reproducing a table per
OIDC model:

`packages/backend/src/db/schema/oauth-records.ts`

Columns:

| Column         | Purpose                                                   |
| -------------- | --------------------------------------------------------- |
| `model`        | Provider model name (`Client`, `Grant`, `AccessToken`, …) |
| `id`           | Provider artifact identifier                              |
| `payload_json` | Provider-owned JSON payload                               |
| `grant_id`     | Indexed grant revocation lookup                           |
| `user_code`    | Indexed adapter lookup when present                       |
| `uid`          | Indexed interaction/session lookup when present           |
| `consumed_at`  | Authorization-code consumption timestamp                  |
| `expires_at`   | Indexed absolute expiry timestamp; nullable for clients   |
| `created_at`   | Operational/audit timestamp                               |
| `updated_at`   | Operational/audit timestamp                               |

Use a composite primary key on `(model, id)` and model-qualified indexes for
`grant_id`, `user_code`, `uid`, and `expires_at`. Implement the complete
`oidc-provider` adapter contract: `upsert`, `find`, `findByUserCode`,
`findByUid`, `consume`, `destroy`, and `revokeByGrantId`.

Add the schema export and generate the next Drizzle migration (currently
expected to be `0039_*`) with:

`pnpm --filter @cc/backend db:generate`

Review the generated SQL and snapshot/journal metadata. Do not hand-write or
renumber the migration.

This data is runtime authorization state, not portable configured state. A
copied workspace can recreate it by reconnecting clients and repasting an API
token, which satisfies the Portable Workspace Rule. No raw secret value is
added to workspace files.

Run an hourly cleanup that deletes expired provider artifacts in bounded
batches. Dynamically registered clients are retained, rate-limited, and capped
at 500 records so an unauthenticated caller cannot grow SQLite without bound.
When the cap is reached, registration returns a protocol-compliant error and
the API page offers an owner-authenticated **Reset OAuth connections** action.
That action deletes provider runtime records after confirmation but leaves CC
API tokens and their permissions untouched; clients then register and authorize
again.

### 7. Explicit token lifetimes

Configure lifetimes explicitly so provider upgrades do not silently change the
security contract:

- Authorization code: 60 seconds, one use.
- Interaction transaction: 10 minutes.
- Access token: 60 minutes.
- Refresh token: 14 days, rotated on every successful refresh.
- Provider session/login cookie: session-only; `remember: false`.

Refresh does not require repasting the API token, but it must re-resolve the
backing API-token ID and fail if that token is revoked. OAuth revocation revokes
the OAuth grant/token family only; revoking the CC API token invalidates all
OAuth grants derived from it.

### 8. Hard-remove URL authentication, retain defensive redaction

This feature is the removal release for `?key=` rather than a warning-only
period. The fallback was documented as temporary, and continuing to accept it
would preserve the leakage risk OAuth is intended to remove.

- Delete `readPublicMcpUrlToken()` and all query-token fallback logic from
  `owner-auth-guard.ts`.
- Remove URL-token examples and warnings from the API UI and documentation.
- Replace positive query-token tests with assertions that a valid `?key=` is
  ignored and receives `401` plus the OAuth challenge.
- Keep `url-redaction.ts`, its logger hook, and its tests. Old client configs may
  continue sending secrets in URLs after authentication is removed; CC must not
  copy those secrets into logs.
- Add a release note telling owners to rotate any token ever placed in a URL.

## Protocol Contract

### Discovery and provider endpoints

With public origin `https://cc.example.com`, expose:

| Endpoint                                                                     | Purpose                                |
| ---------------------------------------------------------------------------- | -------------------------------------- |
| `https://cc.example.com/api/public/mcp`                                      | MCP protected resource                 |
| `https://cc.example.com/.well-known/oauth-protected-resource/api/public/mcp` | RFC 9728 protected-resource metadata   |
| `https://cc.example.com/oauth`                                               | OAuth issuer                           |
| `https://cc.example.com/.well-known/oauth-authorization-server/oauth`        | RFC 8414 authorization-server metadata |
| `https://cc.example.com/oauth/.well-known/openid-configuration`              | OIDC discovery compatibility           |
| `https://cc.example.com/oauth/authorize`                                     | Authorization endpoint                 |
| `https://cc.example.com/oauth/token`                                         | Code exchange and refresh              |
| `https://cc.example.com/oauth/register`                                      | Dynamic Client Registration            |
| `https://cc.example.com/oauth/revoke`                                        | RFC 7009 revocation                    |
| `https://cc.example.com/oauth-interaction/:uid`                              | CC authorization page                  |
| `https://cc.example.com/api/oauth/interactions/:uid`                         | Interaction detail/decision API        |
| `https://cc.example.com/api/oauth/runtime`                                   | Owner-only OAuth reset API             |

Use explicit provider route configuration so these paths are stable and do not
inherit package defaults such as `/auth` or `/reg`.

Protected-resource metadata returns:

```json
{
  "resource": "https://cc.example.com/api/public/mcp",
  "authorization_servers": ["https://cc.example.com/oauth"],
  "scopes_supported": ["mcp"],
  "bearer_methods_supported": ["header"]
}
```

Authorization-server metadata must advertise Authorization Code, S256 PKCE,
`mcp`, refresh tokens, revocation, resource indicators, and DCR. It must not
advertise implicit, password, client-credentials, query-token, client-secret,
or CIMD support.

Every unauthenticated or invalid-token response from `/api/public/mcp` returns:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://cc.example.com/.well-known/oauth-protected-resource/api/public/mcp", scope="mcp"
```

The JSON body stays in CC's existing error envelope. Do not add the OAuth
challenge to unrelated public REST 401 responses.

### DCR validation policy

Accept only registration metadata needed by MCP clients. Reject:

- Grant or response types other than Authorization Code and refresh token.
- Token endpoint auth methods other than `none`.
- Redirect URIs containing credentials, fragments, or wildcards.
- Plain HTTP redirect URIs except `localhost`, `127.0.0.1`, and `[::1]` loopback
  callbacks.
- Native private-use schemes that do not follow reverse-domain style.

Allow HTTPS redirects, loopback HTTP redirects with dynamic ports, and valid
native private-use schemes. Preserve exact redirect-URI matching at the
authorization endpoint. Display the exact client name and redirect host/scheme
on the authorization page, with a visible warning for loopback/private-use
callbacks.

Rate-limit registration more tightly than token exchange (initial target: 10
registrations per 10 minutes per observed source, plus the 500-client hard cap).
Apply separate limits to authorization/token/interaction attempts and return
standard `429` responses without echoing request parameters or tokens.

## Authorization Interaction

Add a design-system-compliant public React route outside `ProtectedAppRoute`:

`/oauth-interaction/:uid`

The page shows:

- "Connect to CommandsCenter".
- Registered client name.
- Exact callback host/scheme.
- Requested protected resource and `mcp` scope.
- A password input labeled `CC API token`, with paste enabled and no value
  persistence.
- A concise explanation that the token's current permissions determine which
  tools the client receives.
- Authorize and Cancel buttons.
- A warning for loopback or private-use redirect URIs.

The page calls:

- `GET /api/oauth/interactions/:uid` for safe display metadata.
- `POST /api/oauth/interactions/:uid` with a discriminated decision payload:
  `{ "decision": "approve", "apiToken": "cc_..." }` or
  `{ "decision": "deny" }`.

The backend uses `provider.interactionDetails()` and
`provider.interactionResult()`; the browser follows the returned `redirectTo`.
On approval, validate the API token, create/update the provider grant for
`scope=mcp` and the exact resource, and finish both login and consent with
`accountId=<api-token-id>` and `remember=false`. On denial, finish with
`access_denied`.

Security headers for the page and API:

- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- A restrictive CSP allowing only CC's own scripts/styles/connect target
- `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'`

Do not log request bodies. Rely on the provider's unguessable interaction UID
and transaction cookie, plus CC's existing same-origin mutation check. Return a
generic invalid-token message; never reveal whether a token was revoked versus
mistyped.

## Implementation Steps

### Step 1 — Add and isolate the OAuth provider dependencies

Files:

- Modify `packages/backend/package.json` and `pnpm-lock.yaml`.
- Add `packages/backend/src/oauth/provider.ts`.
- Add `packages/backend/src/oauth/types.ts` only if needed to isolate gaps in
  the external type definitions.
- Modify `packages/backend/src/server.ts`.

Work:

1. Install the reviewed provider, Fastify bridge, rate limiter, and types.
2. Create a Fastify OAuth plugin that mounts the provider at `/oauth` through
   `@fastify/middie` before the owner-auth guard.
3. Keep `createServer()`'s current call shape; register the async plugin through
   Fastify's plugin lifecycle instead of making all test/server callers manage
   provider readiness themselves.
4. Set `provider.proxy = true` only when CC's runtime proxy configuration says
   forwarded headers are trusted; add the matching Fastify `trustProxy` setting.
   Canonical endpoint URLs still come from `CC_PUBLIC_ORIGIN`.
5. Disable development interactions and every unused grant/feature.

Verify:

- A server reaches `ready()` and closes cleanly with the provider mounted.
- No provider development login page is reachable.
- Discovery advertises only the locked protocol surface.

### Step 2 — Add persistent provider storage

Files:

- Add `packages/backend/src/db/schema/oauth-records.ts`.
- Modify `packages/backend/src/db/schema/index.ts`.
- Add generated `packages/backend/src/db/migrations/0039_*.sql` and matching
  `meta/0039_snapshot.json` / `_journal.json` updates.
- Add `packages/backend/src/oauth/sqlite-adapter.ts`.
- Add `packages/backend/test/oauth/sqlite-adapter.test.ts`.

Work:

1. Add the generic adapter table and indexes described above.
2. Generate the migration with Drizzle and inspect it for duplicate historical
   changes.
3. Implement the full adapter contract with parameterized Drizzle operations.
4. Make `consume` atomic and make `revokeByGrantId` delete every artifact in the
   grant family.
5. Add bounded expired-record cleanup and DCR client-count enforcement.

Verify:

- Contract tests cover every adapter method, expiration, code consumption,
  grant-family revocation, cleanup bounds, and restart persistence.
- Run the migration against a fresh and an existing test database.

### Step 3 — Map OAuth grants to active API-token principals

Files:

- Modify `packages/backend/src/services/api-token-service.ts`.
- Add `packages/backend/src/oauth/mcp-oauth-service.ts`.
- Add `packages/backend/test/oauth/mcp-oauth-service.test.ts`.

Work:

1. Add an API-token service method that resolves an active token by stable ID
   and marks `last_used_at` without requiring the raw token.
2. Configure provider `findAccount` to return only active API-token IDs and the
   minimal `sub` claim required internally.
3. Implement interaction approval, grant creation, refresh validation, opaque
   access-token resolution, exact resource/scope validation, and OAuth
   revocation.
4. Keep API-token capabilities out of provider state; always return the current
   `ApiTokenRecord` from the database.

Verify:

- A permission edit changes the next OAuth-authenticated `tools/list` result.
- API-token revocation rejects existing access tokens and refresh tokens.
- OAuth grant revocation does not revoke the backing CC API token.

### Step 4 — Add metadata, interaction, and challenge routes

Files:

- Add `packages/backend/src/routes/oauth.ts`.
- Modify `packages/backend/src/routes/index.ts`.
- Modify `packages/backend/src/lib/public-routes.ts`.
- Modify `packages/backend/src/lib/owner-auth-guard.ts`.
- Modify `packages/backend/src/lib/runtime-config.ts`.
- Add `packages/backend/test/routes/oauth.test.ts`.
- Modify `packages/backend/test/lib/owner-auth-guard.test.ts`.
- Modify runtime-config tests.

Work:

1. Serve path-correct RFC 9728 and RFC 8414 metadata from canonical origin
   values.
2. Exempt only the exact OAuth metadata/provider/interaction routes from owner
   session auth. Do not broadly exempt `/oauth*` or `/api/oauth*` prefixes.
3. Let the provider own protocol endpoints; keep the interaction detail and
   decision APIs as Zod-validated Fastify routes.
4. Add owner-session + CSRF-protected `DELETE /api/oauth/runtime`; it clears
   provider records only and is never included in the public-route allow-list.
5. Add the MCP-only `WWW-Authenticate` challenge before returning 401.
6. Refactor public MCP Bearer resolution to be asynchronous: `cc_...` resolves
   through `apiTokenService`; other values resolve through the OAuth service.
7. Preserve `request.apiToken` as the sole downstream principal so public MCP
   route/service/tool code does not fork by auth method.
8. Enforce stable-origin and HTTPS rules at configuration load.

Verify:

- Exact metadata documents and headers match the table above.
- OAuth routes work without an owner session; adjacent paths remain protected.
- OAuth access tokens are accepted only by MCP.
- API-token Bearer behavior and public REST capability checks are unchanged.
- Resetting OAuth state invalidates OAuth connections without revoking API
  tokens.

### Step 5 — Build the public authorization page

Read `docs/design-system/README.md` before implementation.

Files:

- Add OAuth interaction schemas to
  `packages/shared/src/schemas/oauth-interactions.ts` and export them from the
  shared public schema surface.
- Add `packages/frontend/src/lib/api/oauth.ts`.
- Add `packages/frontend/src/pages/OAuthAuthorizationPage.tsx`.
- Add `packages/frontend/src/pages/OAuthAuthorizationPage.test.tsx`.
- Modify `packages/frontend/src/app/AppRouter.tsx`.
- Modify `packages/backend/src/lib/owner-auth-guard.ts` browser-navigation
  handling so the exact `/oauth-interaction/:uid` page is not redirected to
  owner login.

Work:

1. Register the interaction page as a public route before
   `ProtectedAppRoute`; it must not render `AppShell`.
2. Use CC semantic tokens and existing CC-owned input/button primitives.
3. Keep the API-token value only in component state, clear it after submit, and
   never place it in a URL, query cache, browser storage, analytics, or error
   text.
4. Redirect only to the provider-generated `redirectTo`; do not trust a
   frontend-supplied callback.

Verify:

- Component tests cover loading, approval, cancellation, invalid token,
  expired interaction, redirect warning, value clearing, and successful
  redirect.
- `pnpm design-system:audit` passes.

### Step 6 — Remove URL-key authentication and update owner guidance

Files:

- Modify `packages/backend/src/lib/owner-auth-guard.ts`.
- Preserve `packages/backend/src/lib/url-redaction.ts` and logger integration.
- Modify `packages/backend/test/routes/public-mcp.test.ts`.
- Preserve/update `packages/backend/test/lib/url-redaction.test.ts`.
- Modify `packages/frontend/src/components/api/EndpointsTab.tsx` and its test.
- Replace `docs/public-mcp-url-token-fallback.md` with OAuth and Bearer-header
  connection guidance, or rename it to `docs/public-mcp-authentication.md` and
  update inbound references.
- Update `.env.example`, `README.md`, and release notes with
  `CC_PUBLIC_ORIGIN`, HTTPS/proxy, reconnection, and token-rotation guidance.

Work:

1. Delete URL-token parsing and all copyable `?key=` examples.
2. Present two supported MCP connection methods in the API page: automatic
   OAuth for interactive clients, or a CC API token in an Authorization header
   for clients that support static headers.
3. Add a confirmed **Reset OAuth connections** control for recovery from stale
   or unwanted DCR records; describe its reconnect impact before deletion.
4. Keep defensive URL redaction and assert it still redacts rejected legacy
   URLs.
5. State plainly that no compatibility flag restores URL credentials.

Verify:

- A real valid API token in `?key=` cannot authenticate.
- The same token in the Bearer header still works.
- Rejected stale URLs do not expose their key in Pino output.
- Resetting OAuth connections clears grants/clients while preserving API-token
  records.

### Step 7 — End-to-end protocol and client verification

Files:

- Extend `packages/backend/test/e2e/public-mcp-client.test.ts`.
- Add focused OAuth E2E helpers under `packages/backend/test/helpers/`.
- Add a Playwright authorization interaction flow under
  `packages/frontend/e2e/`.

Automated scenarios, one behavior per test:

1. Unauthenticated MCP request returns path-specific resource metadata.
2. DCR registers a public client without a secret.
3. Invalid confidential-client registration is rejected.
4. Authorization without S256 PKCE is rejected.
5. Invalid redirect URIs are rejected.
6. Valid API-token approval returns an authorization code only to the exact
   registered redirect URI.
7. Code exchange returns opaque Bearer + rotating refresh tokens.
8. Reusing an authorization code fails.
9. MCP SDK `listTools()` works with the OAuth access token.
10. Refresh rotation invalidates the old refresh token.
11. OAuth revocation invalidates the grant family.
12. Backing API-token revocation invalidates access and refresh immediately.
13. Permission edits affect the next tool list/call.
14. Provider records survive a server restart and unexpired refresh still
    works.
15. Expired interactions/codes/access/refresh tokens fail correctly.
16. URL-key auth is rejected while the key remains redacted from logs.
17. Direct header API-token MCP and REST tests remain green.
18. OAuth tokens are rejected by public REST.
19. One real MCP SDK client follows the unauthenticated challenge, discovers
    both metadata documents, dynamically registers, creates S256 PKCE state,
    completes the simulated browser callback, exchanges its code, reconnects,
    lists tools, and calls a permitted tool.

Manual interoperability matrix before release:

- Claude web custom connector using automatic registration.
- Claude Code MCP connection.
- One independent MCP SDK/client using discovery + DCR.
- Direct Bearer-header connection with a CC API token.

Capture the discovery documents and failure codes during this pass, but never
capture or paste real API/access/refresh tokens into fixtures, screenshots, or
issues.

### Step 7 Verification Record

Completed on 2026-07-22:

- The backend public-MCP E2E suite passes 22 tests, including DCR, S256 PKCE,
  exact redirect matching, code exchange/reuse, MCP SDK authorization, refresh
  rotation, grant revocation, backing API-token revocation, live permission
  edits, restart persistence, expiry behavior, URL-key rejection/redaction,
  direct Bearer authentication, and OAuth rejection by public REST.
- One OAuth-aware MCP SDK client now drives the complete cycle: initial MCP 401
  challenge, protected-resource and authorization-server discovery, DCR, S256
  PKCE, simulated browser approval/callback, code exchange, authenticated MCP
  reconnect, `listTools()`, and a permitted `callTool()`.
- The authorization Playwright flow passes in the configured Chromium and
  mobile projects. The focused OAuth/public-MCP Playwright run passes 4 tests
  when the existing provider OAuth scenarios are included.
- The complete package unit/integration suites pass: backend 1,341 tests,
  frontend 1,473 tests, shared 221 tests, and CLI 43 tests.
- Database generation reports no uncommitted schema changes. Type checking,
  linting after ESLint auto-fix, the design-system audit, and the production CLI
  build all pass.

Interoperability matrix status:

- Independent MCP SDK/client: verified automatically in one client-driven flow
  with the real MCP SDK, discovery, DCR, authorization, token exchange,
  authenticated reconnect, `listTools()`, and `callTool()`.
- Direct Bearer-header connection: verified automatically with a real CC API
  token against the MCP endpoint.
- Claude web custom connector: release smoke pending; it requires a deployed
  HTTPS CC origin and an authenticated Anthropic session.
- Claude Code: release smoke pending; it requires an interactive browser
  authorization against a deployed/reachable CC origin and should use an
  isolated temporary client configuration during release verification.

The two pending Claude checks are release-environment interoperability checks,
not gaps in the repository's automated protocol coverage.

## Verification Commands

Run after implementation:

```sh
pnpm --filter @cc/backend db:generate
pnpm design-system:audit
pnpm typecheck
pnpm lint --fix
pnpm test
pnpm --filter @cc/backend test -- public-mcp oauth owner-auth-guard
pnpm --filter @cc/frontend test:e2e --grep "OAuth|public MCP"
pnpm build:cli
```

If the root lint script does not forward `--fix` correctly to package scripts,
run `pnpm exec eslint packages/backend/src packages/backend/test
packages/frontend/src --fix` and then `pnpm lint`.

## Rollout and Recovery

1. Release notes call this a breaking removal of MCP URL-token authentication.
2. Before upgrading, owners should remove `?key=` from connector URLs and rotate
   every API token previously embedded in a URL.
3. After upgrading, OAuth-capable clients reconnect automatically through DCR;
   static-header clients continue using their existing Bearer configuration.
4. A stale URL receives the OAuth challenge instead of silently authenticating.
5. Rollback restores the old binary and schema compatibility; the new OAuth
   table is additive. A rollback must not require deleting the migration.
6. If OAuth runtime state is cleared or the issuer changes, no workspace
   configuration or API-token permissions are lost; clients simply reconnect
   and authorize again.

## Explicitly Out of Scope

- CC user accounts, teams, tenants, or owner-password OAuth login.
- OAuth client secrets or manual client-registration administration.
- CIMD until its provider support and SSRF policy are separately reviewed.
- OAuth on public REST endpoints.
- JWT access tokens, token introspection for third-party resource servers, or an
  external identity provider.
- Device Authorization Grant, Client Credentials, Resource Owner Password,
  Implicit, PAR, DPoP, mTLS, or OpenID profile/userinfo features.
- Persisting OAuth grants or clients as portable workspace configuration.

## Research Basis

- The current MCP authorization specification requires Protected Resource
  Metadata and authorization-server discovery, recommends public clients with
  PKCE, and treats DCR as the compatibility registration mechanism:
  <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>
- RFC 9728 defines protected-resource metadata and the `resource_metadata`
  challenge parameter: <https://datatracker.ietf.org/doc/html/rfc9728>
- `oidc-provider` documents Fastify mounting, custom interactions, production
  adapters, DCR, PKCE, Resource Indicators, refresh rotation, and revocation:
  <https://github.com/panva/node-oidc-provider>
