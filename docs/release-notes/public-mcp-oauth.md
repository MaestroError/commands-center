# Public MCP OAuth Authentication

This release moves the public MCP endpoint to header-only credentials and adds
automatic OAuth for interactive MCP clients.

## Action Required

- MCP URLs containing an API token no longer authenticate. There is no
  compatibility flag to restore URL credentials.
- Rotate any API token that was ever placed in a URL, then reconnect the client
  with automatic OAuth or configure an `Authorization: Bearer <API_TOKEN>`
  header.
- Public deployments must use a stable, exact HTTPS `CC_PUBLIC_ORIGIN`. Changing
  the origin invalidates OAuth registrations and tokens, so clients must connect
  again.
- Set `CC_TRUST_PROXY=true` only when a trusted reverse proxy overwrites
  forwarded headers and the CommandsCenter backend is not directly exposed.

## What Changed

- OAuth-capable clients can discover the authorization server, register as
  public clients, and complete Authorization Code with S256 PKCE automatically.
- The authorization page accepts a CommandsCenter API token instead of creating
  a user account or asking for the owner password.
- Revoking the backing API token immediately invalidates its derived OAuth
  access. Permission edits apply on the next MCP request.
- The API screen now documents both supported authentication methods and offers
  a confirmed **Reset OAuth connections** recovery action. Resetting removes
  OAuth clients, grants, and tokens while preserving CommandsCenter API-token
  records.
