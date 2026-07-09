# Public MCP URL Token Fallback

The public MCP server supports bearer-token authentication through the `Authorization` header:

```http
Authorization: Bearer <YOUR_API_TOKEN>
```

That header-based flow is the recommended integration path.

As a temporary compatibility fallback before OAuth support is implemented, clients that cannot set custom headers may authenticate the public MCP endpoint with a URL query parameter:

```text
https://<commandscenter-host>/api/public/mcp?key=<YOUR_API_TOKEN>
```

This fallback applies only to the public MCP endpoint at `/api/public/mcp`. Public REST API endpoints under `/api/public/v1/*` remain header-only.

## Production Guidance

URL-token authentication is not recommended for production unless the token has explicitly defined, minimal scopes and template permissions. URLs are more likely than headers to appear in client config, shell history, screenshots, browser history, proxy logs, and support bundles.

When this fallback is necessary:

- Create a dedicated token for the MCP client.
- Grant only the exact capabilities and template tools the client needs.
- Prefer short-lived operational use where possible.
- Rotate the token immediately if the URL is pasted into the wrong place or shared outside the intended client.
- Move the client to header-based auth or OAuth once supported.

## Behavior

- `Authorization: Bearer <token>` remains the preferred auth mechanism.
- `?key=<token>` is accepted only for `/api/public/mcp`.
- If an `Authorization` header is present, the server validates that header and does not fall back to `?key=`.
- Token revocation and permission edits work the same way for both auth styles.
- MCP tool visibility and execution remain gated by the token's configured capabilities and template permissions.

## Example

```text
https://commands.example.com/api/public/mcp?key=cc_example_token
```

Use the real token only inside the MCP client's private configuration. Do not commit tokenized URLs to source control or shared workspace files.
