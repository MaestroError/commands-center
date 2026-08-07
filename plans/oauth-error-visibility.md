# Surface OAuth failures instead of falling through to the dashboard

## Problem

OAuth failures on the public MCP authorization flow are invisible — to the
person connecting the client and to anyone reading the server logs.

`registerOAuthProvider` in `packages/backend/src/oauth/provider.ts` routes a
fixed list of paths to `oidc-provider`. Any other path under `/oauth` calls
`next()`, and the provider callback itself is wrapped in `.catch(next)`. In
`start` mode the CLI answers every unmatched route with `index.html`
(`packages/cli/src/cli.ts`), and the SPA router turns that into
`<Navigate replace to="/" />` (`packages/frontend/src/app/AppRouter.tsx`). A
failed authorization therefore lands the browser on the dashboard with no
error, no log line, and no authorization code.

This masked a real bug: approving a second MCP client with a different API
token made `oidc-provider` treat the approval as an account switch and answer
the resume request with an auto-submitting form aimed at the RP-initiated
logout endpoint, which is disabled and unrouted. The POST fell through to the
SPA and the connection silently dead-ended on the dashboard. The account-switch
cause is fixed on `fix/oauth-second-client-session-conflict`; the reason it took
a reproduction to find is not.

Two further gaps sit behind the same surface:

- No `provider.on(...)` listeners are registered, so `server_error`,
  `authorization.error`, and `grant.error` are never logged.
- `renderError` is not overridden, so the errors `oidc-provider` does render
  reach the user as its stock "oops! something went wrong" page — off-brand, and
  it `@import`s a Google Fonts stylesheet from an external CDN.

Errors that `oidc-provider` can safely return to the client over a validated
`redirect_uri` already work and are out of scope.

## Implementation

1. Subscribe to the provider's error events and log them through the Fastify
   logger, including the request id. Independent of any UI work and worth
   landing first.
2. Stop OAuth paths from reaching the SPA fallback: respond with a proper OAuth
   error for unrecognized paths under the issuer prefix, and handle rejections
   from `providerCallback` instead of passing them to `next()`.
3. Override `renderError` with a server-rendered page in CC's visual language,
   modelled on the "Authorization unavailable" card in
   `packages/frontend/src/pages/OAuthAuthorizationPage.tsx`. Server-rendered
   rather than an SPA redirect so it also works in `serve` mode, and so error
   text stays out of query strings.
4. Show `error` and `error_description` verbatim — both are OAuth-spec fields
   and carry nothing sensitive. For `server_error`, show a generic message plus
   the request id and keep the detail in the logs.
5. Cover the new behaviour in `packages/backend/test/routes/oauth.test.ts`.

## Success criteria

- No request under the OAuth issuer prefix can render the SPA or redirect to
  the dashboard, for any method.
- A provider callback failure is logged with its request id and answered with
  an OAuth error rather than `index.html`.
- The rendered error page makes no external network requests.
- Backend lint, typechecking, and tests pass.
