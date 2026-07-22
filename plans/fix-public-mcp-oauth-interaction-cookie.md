# Fix public MCP OAuth interaction cookie

## Problem

`oidc-provider` scopes its interaction cookie to the configured interaction page
by default. CC serves that page at `/oauth-interaction/:uid`, while the page
reads and decides the interaction through `/api/oauth/interactions/:uid`.
Browsers therefore omit the interaction cookie from the API requests and CC
reports a fresh interaction as invalid or expired.

The full MCP OAuth test copied the raw cookie header into every request, so it
did not enforce browser cookie path rules.

## Implementation

1. Set the OIDC short-lived cookie path to `/` so the interaction API receives
   the secure, HTTP-only interaction cookie.
2. Update the full MCP OAuth test helper to retain cookie attributes and send
   only cookies whose paths match each request URL.
3. Run ESLint autofix, backend typechecking, and the backend test suite.

## Success criteria

- A fresh OAuth interaction can be read and approved through the public
  authorization page API.
- The full MCP client OAuth cycle fails if the interaction cookie is narrowed
  back to `/oauth-interaction/:uid`.
- Backend lint, typechecking, and tests pass.
