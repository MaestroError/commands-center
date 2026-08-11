# Public MCP Authentication

CommandsCenter exposes one Streamable HTTP MCP endpoint:

```text
https://<commandscenter-host>/api/public/mcp
```

The endpoint supports two authentication methods. Both resolve to a current
CommandsCenter API-token record, so token revocation and permission changes take
effect on the next MCP request.

## Automatic OAuth

Automatic OAuth is recommended for interactive MCP clients. Configure the MCP
client with the endpoint only. A conforming client then:

1. Receives the protected-resource challenge from the MCP endpoint.
2. Discovers CommandsCenter's authorization server.
3. Registers itself as a public client without a client secret.
4. Opens the CommandsCenter authorization page.
5. Asks the operator to paste a CommandsCenter API token and approve access.
6. Completes Authorization Code with S256 PKCE and receives refreshable OAuth
   tokens.

The API token is used to authorize the grant. Its raw value is not stored in
OAuth records. OAuth access is limited to the public MCP resource and cannot be
used with public REST endpoints.

## Static Bearer Header

Clients that support fixed request headers can use a CommandsCenter API token
directly:

```http
Authorization: Bearer <YOUR_API_TOKEN>
```

Create a dedicated API token in the API screen and grant only the capabilities,
templates, and document roots that the client needs. Public REST endpoints also
remain API-token Bearer only.

## Connect Another CommandsCenter Instance

One CommandsCenter instance can consume another instance's public MCP endpoint.
On **Integrations → Connected CC instances**, select **Add** and provide:

- **Name** — a label for this instance. It is saved under the technical name
  shown beneath the field (`Knowledge base` → `knowledge_base`), because
  OpenCode derives tool ids as `<name>_<tool>` and rewrites any character
  outside letters, digits, underscores, and hyphens. Storing the derived name
  keeps permission patterns such as `knowledge_base_*` matching the tool ids
  they are meant to gate. The field stays editable if you want a different
  technical name.
- **Instance URL** — the other instance's origin, for example
  `cc.example.com`. CommandsCenter appends `/api/public/mcp` itself and accepts
  a complete endpoint URL or a reverse-proxy sub-path without duplicating it.
- **Secret name** — the key the API token is stored under in this instance's
  secret store, for example `CC_INSTANCE_STAGING_CC_TOKEN`. It must start with a
  letter or underscore and contain only letters, digits, and underscores.
- **API token** — a CommandsCenter API token created on the _other_ instance
  under **API → Tokens**, granting only the capabilities, templates, and
  document roots this connection needs.

The token is encrypted at rest, and the MCP header is stored as a reference
(`Authorization: Bearer {env:<SECRET_NAME>}`) rather than the value, so the
registration stays portable while the value does not leave this instance.

A new instance is registered **disabled**, because the running AI engine cannot
read a secret written after it started. Select **Activate** when convenient:
CommandsCenter restarts the engine only when the referenced secret changed since
the engine started, and asks for confirmation first, reporting any running task
runs. Cancelling leaves the instance disabled and retryable later.

## Revocation And Permission Changes

- Revoking the backing CommandsCenter API token immediately removes access from
  both direct Bearer clients and every OAuth grant derived from that token.
- Editing the API token's permissions changes the MCP tools visible and callable
  on the next request; the OAuth client does not need to authorize again.
- Revoking an OAuth grant affects that OAuth connection only and does not delete
  the CommandsCenter API token.

## Reset OAuth Connections

The API screen includes **Reset OAuth connections** for recovery after an origin
or proxy change, or when stale registrations prevent clients from reconnecting.
After confirmation, it clears registered OAuth clients, grants, access tokens,
refresh tokens, pending interactions, and the dynamic-client-registration retry
limit. It preserves every CommandsCenter API token and its permissions. All
OAuth MCP clients must connect and authorize again.

## Public Origin And Reverse Proxies

For an externally available instance, configure the exact stable HTTPS origin:

```dotenv
CC_PUBLIC_ORIGIN=https://commands.example.com
```

OAuth issuer, resource, redirect, and discovery URLs are derived from this
value. Changing it invalidates existing client registrations and OAuth tokens;
update the configuration, restart CommandsCenter, reset OAuth connections, and
reconnect each client.

When a trusted reverse proxy terminates HTTPS, also configure:

```dotenv
CC_TRUST_PROXY=true
```

This is the expected value when MCP users open a company URL such as
`https://cc.company.com` and Caddy, nginx, a trusted tunnel, ingress, or load
balancer forwards requests to CommandsCenter. Leave it at its safe default,
`false`, only when users connect directly to the CommandsCenter host and port.

With `true`, CommandsCenter trusts `X-Forwarded-For` for the user's address
and `X-Forwarded-Proto` / `X-Forwarded-Host` for the original HTTPS URL. Without
it, CC sees the proxy's address and its private HTTP connection. The proxy must
be the only way to reach the backend, preserve the public `Host`, and overwrite
all three forwarded headers. The default is `false` because a directly
connected client could otherwise fake those values.

This flag does not set the OAuth origin; `CC_PUBLIC_ORIGIN` does. Changing proxy
trust requires a restart but does not itself invalidate OAuth tokens or
registrations.

See [What proxy trust changes](../README.md#what-proxy-trust-changes) for the
decision table, security requirements, and nginx guidance. Plain HTTP public
origins are accepted only for loopback development.

## URL Credentials Are Removed

Tokens in URL query parameters are rejected. There is no compatibility flag to
restore URL credentials. This applies even when the supplied API token is still
valid.

Rotate any API token that was ever embedded in an MCP URL. URLs can remain in
client configuration, shell or browser history, proxy logs, screenshots, and
support bundles. CommandsCenter continues to redact legacy MCP token query
values from its own logs while rejecting the request.
