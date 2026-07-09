# Public MCP URL Token Auth

## Goal

Allow public MCP clients that cannot send custom headers to authenticate by appending the API token to the public MCP endpoint URL:

```text
/api/public/mcp?key=<YOUR_API_TOKEN>
```

Header-based bearer auth remains the preferred and existing path:

```http
Authorization: Bearer <YOUR_API_TOKEN>
```

## Assumptions

- This applies only to the Streamable HTTP public MCP endpoint at `/api/public/mcp`.
- Public REST endpoints under `/api/public/v1/*` stay header-only.
- The query parameter name is `key`, matching the requested `MCP-URL?key=TOKEN` shape.
- The API token model, permissions, per-template MCP gating, and audit identity stay unchanged.
- No database migration or workspace-file migration is needed.

## Implementation Plan

- [x] Add query-token extraction in `packages/backend/src/lib/owner-auth-guard.ts`.
  - Reuse the existing `apiTokenService.validateToken()` flow.
  - Accept `?key=<token>` only when `pathname === "/api/public/mcp"`.
  - Keep bearer header auth working exactly as it does today.
  - Prefer an explicit bearer token when present; use `key` only when the bearer header is absent.
  - Preserve the current behavior where a valid token is enough to reach MCP and per-tool permissions are enforced inside the MCP session.

- [x] Add URL-token log redaction before shipping the auth change.
  - URL tokens can appear in Fastify request logs, browser history, reverse-proxy logs, and copied config.
  - Add a small sanitizer for public MCP URLs so `?key=cc_...` is rendered/logged as `?key=redacted`.
  - Wire it into backend request logging in the narrowest practical place, likely the Fastify request serializer or a dedicated request-log helper.
  - Add a test that proves the raw token does not appear in emitted request logs for `/api/public/mcp?key=...`.

- [x] Extend backend route/auth tests.
  - In `packages/backend/test/routes/public-mcp.test.ts`, cover `/api/public/mcp?key=<token>` without an `Authorization` header.
  - In `packages/backend/test/routes/public-mcp.test.ts`, add a `tools/list` or `initialize` request authenticated only by the URL `key`.
  - Assert invalid, missing, and revoked `key` values still return `401`.
  - Assert `/api/public/v1/*?key=<token>` is not accepted, so the fallback does not broaden REST auth.
  - Assert an invalid bearer header is not silently bypassed by a valid query key if both are provided.
  - In `packages/backend/test/lib/url-redaction.test.ts`, assert URL-token values are redacted from request-log URL and query fields.

- [x] Update operator-facing MCP connection guidance.
  - In `packages/frontend/src/components/api/EndpointsTab.tsx`, keep the header-based endpoint as the recommended option.
  - Add a second copyable endpoint form for clients that cannot set headers:

    ```text
    {baseUrl}/api/public/mcp?key=<YOUR_API_TOKEN>
    ```

  - Include a short warning that URL tokens are less private than headers and should be rotated if pasted into the wrong place.
  - Keep styling in existing theme classes (`cc-*`, `text-*`, `bg-*`, `border-*`) and do not introduce new visual patterns.

- [x] Update frontend tests.
  - Extend `packages/frontend/src/components/api/EndpointsTab.test.tsx` to assert both MCP URL forms are rendered.
  - If copy behavior is covered, assert the copied URL uses the placeholder and never a real token.

- [x] Run verification.
  - `pnpm eslint --fix`
  - Focused backend tests for owner auth and public MCP.
  - Focused frontend tests for `EndpointsTab`.
  - Broader package tests if the focused run touches shared helpers or logger behavior.

## Security Notes

- This is intentionally less secure than bearer headers because URLs are more likely to be stored in client config, logs, history, screenshots, and support bundles.
- The feature should be documented as a compatibility fallback for MCP clients that cannot send headers.
- Token revocation and permission edits continue to work because the raw query token is validated through the same stored hash as bearer auth.
- The query token must never be written to audit entries; MCP audit already records the validated token identity and tool call inputs, not the request URL.

## Out of Scope

- OAuth for public MCP clients.
- New token types, token scopes, or database schema changes.
- Supporting query-token auth for public REST endpoints.
- Persisting real tokenized URLs in CommandsCenter state.
