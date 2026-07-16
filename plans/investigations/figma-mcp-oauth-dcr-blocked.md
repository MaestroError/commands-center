# Figma remote MCP: OAuth blocked by closed Dynamic Client Registration

**Date:** 2026-07-16
**Context:** PR that added `create_document`, document `move_*` tools, and (reverted here) a
Figma entry in the "Suggested MCPs" list on the Integrations page.
**Outcome:** Figma suggested-MCP entry **reverted** — it cannot authenticate through our
OpenCode-based MCP runtime today. This note records why, so we don't re-attempt it blindly.

## What we wanted

Add Figma's remote MCP server as a one-click preset in `SUGGESTED_MCP_SERVERS`
(`packages/frontend/src/pages/integrations/integration-helpers.ts`), matching the existing
remote-OAuth presets (Notion, Linear, Jira, Sentry, Vercel, Supabase).

Figma's published details:

- Remote endpoint: `https://mcp.figma.com/mcp`
- Transport: streamable HTTP
- Auth: Figma OAuth
- Available on all seats/plans
- Docs: https://developers.figma.com/docs/figma-mcp-server/

Shape-wise this is identical to the other remote-OAuth presets, so it was added as a data-only
change: `{ transport: "streamable-http", authMethod: "oauth", url: "https://mcp.figma.com/mcp" }`.

## Symptom

Clicking **Authenticate** on the Figma integration fails immediately:

```
Failed to start authentication for MCP server 'figma': OpenCode request failed:
POST /mcp/figma/auth → 500: {"name":"UnknownError","data":{"message":"Unexpected server error.
Check server logs for details.","ref":"err_8000c1cd"}}
```

CC delegates the OAuth start to OpenCode (`opencodeService.startMcpAuth` →
`POST /mcp/figma/auth`), and OpenCode returns a 500. CC surfaces it as a `BadRequestError`
(`mcp-server-service.ts` `callOpencode` → `startAuth`).

## Root cause

OpenCode's own log (`~/.local/share/opencode/log/*.log`) shows the real error:

```
service=mcp key=figma transport=StreamableHTTP mcp server requires authentication
service=mcp mcpName=figma removed oauth credentials
ERROR service=server ref=err_8000c1cd
  error=HTTP 403: Invalid OAuth error response:
  SyntaxError: JSON Parse error: Unexpected identifier "Forbidden". Raw body: Forbidden
    at MCP.startAuth
```

Chain of events:

1. OpenCode connects to `https://mcp.figma.com/mcp` → `401` with
   `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource",
scope="mcp:connect", authorization_uri="https://api.figma.com/.well-known/oauth-authorization-server"`.
2. OpenCode discovers the authorization server metadata, which advertises a
   **Dynamic Client Registration (DCR)** endpoint:
   `registration_endpoint: https://api.figma.com/v1/oauth/mcp/register`.
3. Having no Figma `client_id`, OpenCode attempts DCR against that endpoint.
4. Figma returns **`403 Forbidden`** — with a plain-text body `Forbidden` but a
   `Content-Type: application/json` header.
5. OpenCode tries `JSON.parse("Forbidden")` → `SyntaxError` → bubbles up as the opaque
   `500 UnknownError`.

### Evidence (direct probes, 2026-07-16)

Discovery works for anyone:

```
POST https://mcp.figma.com/mcp                         → 401 (+ WWW-Authenticate)
GET  https://mcp.figma.com/.well-known/oauth-protected-resource   → 200 JSON
GET  https://api.figma.com/.well-known/oauth-authorization-server → 200 JSON
```

Registration (DCR) is blanket-blocked, regardless of request contents:

| DCR request                                      | Result          |
| ------------------------------------------------ | --------------- |
| redirect_uri = `http://localhost:3000/...`       | `403 Forbidden` |
| redirect_uri = `https://cc.example.com/...`      | `403 Forbidden` |
| no `redirect_uris`                               | `403 Forbidden` |
| empty body `{}`                                  | `403 Forbidden` |
| User-Agent spoof: VS Code / Claude Code / Cursor | `403 Forbidden` |

Conclusions from the probes:

- **Not the redirect URI.** The `403` is independent of the redirect value (https, localhost, or
  absent). So `CC_PUBLIC_ORIGIN` / localhost is irrelevant here.
- **Not User-Agent gating.** Spoofing approved editors' UAs still `403`s.
- **DCR is simply closed to unapproved clients.** Figma's approved MCP clients (VS Code, Cursor,
  Claude Code, Codex, Xcode — the "Figma MCP Catalog") use **pre-issued static `client_id`s** that
  Figma allowlisted out-of-band; they do not use DCR. OpenCode only knows how to self-register via
  DCR, so it cannot obtain a `client_id`.

## Why we can't fix it on our side

The block is entirely server-side at Figma and happens at the "get a `client_id`" step, before any
redirect/browser handoff. Nothing in CC's config (including `CC_PUBLIC_ORIGIN`) or in the OpenCode
config we generate changes it. The two real unlocks are both external:

1. Figma allowlists CommandsCenter/OpenCode for DCR, or issues us a static `client_id`
   (i.e. gets us into their MCP client catalog — a partnership/approval request).
2. OpenCode ships a Figma-approved static `client_id` and uses it instead of DCR.

## Why the other remote-OAuth presets work

Notion, Linear, Vercel, Supabase, Sentry, Jira all support **open DCR** (or already had stored
credentials in testing), so OpenCode can self-register and complete the browser OAuth flow through
CC's hosted redirect (`/api/mcp-servers/:id/auth/redirect`, built from `CC_PUBLIC_ORIGIN`). Figma is
the outlier because it closed DCR.

## Decision

- Reverted the Figma suggested-MCP entry (commit "Revert feat(integrations): add Figma to suggested
  MCP servers"). A one-click preset that always dead-ends in a confusing 500 is worse than not
  offering it.
- Revisit only if CommandsCenter is added to Figma's MCP client catalog, or if OpenCode gains a way
  to use a pre-registered Figma `client_id`.

## Possible future follow-ups (not done here)

- **Clearer error surface:** when OpenCode returns the opaque 500 for an OAuth start, CC could hint
  that "this provider may not allow this client to register." Hard to detect reliably from OpenCode's
  generic `UnknownError` payload, so deferred.
- **Static client credentials:** allow users to supply a pre-issued `client_id`/`secret` for a remote
  MCP server so OpenCode skips DCR. Would not help Figma (no public client IDs) but could help other
  DCR-less providers. Larger scope; depends on OpenCode support.
