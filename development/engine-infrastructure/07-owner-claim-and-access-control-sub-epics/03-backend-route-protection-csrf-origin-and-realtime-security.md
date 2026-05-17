# E7.3 Backend Route Protection, CSRF, Origin, and Realtime Security

## Goal

Make server-side owner auth the security boundary for all browser, API, SSE, and WebSocket access. After this sub-epic, protected routes are denied by default without a valid owner session, mutating cookie-authenticated requests require CSRF protection, and browser origin checks protect HTTP mutations, SSE, and WebSocket upgrades.

## Pre-Conditions

- E7.2 Claim, Login, Logout, and Session API is complete.
- E3 API and Realtime Foundation is complete.
- Terminal WebSocket routes and SSE/event routes are registered in the backend.

## Scope

### Protected-by-Default Backend Guard

- Add a global Fastify auth guard that runs before protected routes.
- Maintain one explicit public route registry in a backend module.
- Public routes are limited to health needed for uptime checks, auth status, claim, reclaim completion if public by design, login, logout, CSRF bootstrap if separate, and static assets needed to render claim/login.
- Treat all other API routes as protected by default: agents, conversations, file manager, search, terminal, secrets, providers, integrations, MCP management, tasks, custom tools, system update routes, and live-request routes.
- `ccenter serve` API-only mode must enforce the same auth guard as `ccenter start`.

### Browser Navigation and API Response Behavior

- When unclaimed, direct browser navigations to app routes must render or redirect to `/claim` without exposing protected data.
- When claimed but unauthenticated, direct browser navigations to app routes must render or redirect to `/login` without exposing protected data.
- API requests without a valid session must return typed `401` or `403` responses.
- API requests must not receive the frontend `index.html` shell as an unauthorized response.

### CSRF Protection

- Add CSRF protection for cookie-authenticated mutating requests: `POST`, `PUT`, `PATCH`, and `DELETE`.
- Use double-submit token or server-issued CSRF token sent by the frontend in a custom header.
- Do not require CSRF tokens for safe `GET` requests, but still require a valid session for protected `GET` routes.
- Rotate CSRF material on login and logout.
- Add a minimal public CSRF bootstrap endpoint only if the chosen design requires it.

### Origin and Host Checks

- Validate `Origin` on browser mutating requests.
- Validate `Origin` on SSE/event-stream routes before opening streams.
- Validate `Origin` on WebSocket upgrades before accepting them.
- Reject cross-site WebSocket upgrades even when cookies are sent.
- Validate forwarded host/proto information against configured public origin when behind a reverse proxy.
- Add explicit environment support for `CC_PUBLIC_ORIGIN` or `CC_ALLOWED_ORIGINS`.
- In development, allow localhost origins for configured Vite and API ports.
- Document reverse proxy assumptions in E7.6; this sub-epic owns the backend enforcement behavior.

### WebSocket and SSE Protection

- Terminal WebSocket upgrades must validate owner session before accepting the upgrade.
- Terminal WebSocket upgrades must validate origin before accepting the upgrade.
- Conversation event streams, workspace watch streams, or any SSE/event-stream routes must validate owner session before opening.
- Event-stream routes must fail fast with typed unauthorized/forbidden behavior rather than leaving connections open.

### Regression Guardrails

- Add tests that assert every backend route is protected unless explicitly public.
- Add tests that fail when a new route registration pattern bypasses the auth guard.
- Keep the public route list small and reviewable.

## Out of Scope

- Claim/login/logout route implementation (E7.2).
- Frontend auth bootstrap, claim/login screens, and API CSRF header attachment (E7.4).
- CLI claim-code and deployment docs (E7.6), except environment variables required for origin checks.

## Acceptance Criteria

- Protected API requests without a valid session return typed unauthorized responses.
- Health, auth status, claim, login, logout, and any CSRF bootstrap remain public only where explicitly listed.
- The public route allowlist lives in one backend module and is covered by tests.
- Unclaimed browser navigation resolves to `/claim` behavior.
- Claimed unauthenticated browser navigation resolves to `/login` behavior.
- Unauthorized API requests never return `index.html`.
- Mutating requests without CSRF token fail.
- Mutating requests with invalid `Origin` fail.
- Allowed-origin mutating requests pass with a valid session and CSRF token.
- Terminal WebSocket upgrades fail without a valid owner session.
- Terminal WebSocket upgrades fail with invalid origin.
- SSE/event-stream endpoints reject unauthenticated requests before opening streams.
- `ccenter serve` enforces the same auth guard as full web mode.

## Key Files to Create/Modify

- `packages/backend/src/lib/owner-auth-guard.ts`
- `packages/backend/src/lib/public-routes.ts`
- `packages/backend/src/lib/csrf.ts`
- `packages/backend/src/lib/origin-check.ts`
- `packages/backend/src/lib/runtime-config.ts`
- `packages/backend/src/server.ts`
- `packages/backend/src/routes/index.ts`
- `packages/backend/src/routes/terminal.ts`
- `packages/backend/src/routes/conversation-events.ts`
- `packages/backend/src/routes/live-requests.ts`
- `packages/backend/test/server.test.ts`
- `packages/backend/test/routes/terminal.test.ts`
- `packages/backend/test/lib/owner-auth-guard.test.ts`
- `packages/backend/test/lib/csrf.test.ts`
- `packages/backend/test/lib/origin-check.test.ts`

## Reference

- Parent epic: `development/engine-infrastructure/07-owner-claim-and-access-control.md`
- Server hooks: `packages/backend/src/server.ts`
- Route registration: `packages/backend/src/routes/index.ts`
- Terminal upgrade path: `packages/backend/src/routes/terminal.ts`
- API error handling: `packages/backend/src/lib/api-error.ts`
