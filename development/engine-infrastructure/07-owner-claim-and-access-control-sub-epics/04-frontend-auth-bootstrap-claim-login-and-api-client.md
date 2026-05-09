# E7.4 Frontend Auth Bootstrap, Claim/Login UX, and API Client

## Goal

Add the browser-facing owner access experience: auth bootstrap, `/claim`, `/login`, protected app routing, logout behavior, and centralized CSRF header attachment for API requests. After this sub-epic, browser users are guided through claiming or logging in before they can reach the application shell.

## Pre-Conditions

- E7.2 Claim, Login, Logout, and Session API is complete.
- E7.3 Backend Route Protection, CSRF, Origin, and Realtime Security is complete enough to define API/CSRF behavior.
- U0 Frontend Foundation is complete.
- U5 Profile, Settings, and Theming is complete enough to preserve current theme/layout patterns.

## Scope

### Auth Bootstrap

- Add an auth bootstrap layer that calls auth status before rendering protected app routes.
- Render `/claim` for `unclaimed` status.
- Render `/login` for `claimed-unauthenticated` status.
- Render the requested app route for `claimed-authenticated` status.
- Avoid flashing protected application content before auth status resolves.
- Ensure browser back/forward behavior does not reveal protected content after logout.

### Routing Structure

- Add public `/claim` and `/login` routes outside the protected `AppShell`.
- Keep protected routes inside the existing app shell after authentication.
- Preserve deep links: after successful claim or login, navigate to the originally requested protected route when safe.
- Handle unknown routes consistently with the existing router while respecting auth state.

### Claim Screen

- Build a focused claim screen with ownership language:
  - “Secure Your CommandsCenter”
  - “This instance controls files, terminals, agents, and secrets.”
- Require claim code, strong owner password, and password confirmation.
- Show clear password guidance matching backend validation rules.
- Surface invalid/expired/rate-limited claim-code errors without exposing sensitive details.
- On successful claim, transition into the authenticated app.
- Keep the UI responsive on mobile viewports.

### Login Screen

- Add login form for claimed workspaces.
- Require owner password.
- Handle invalid credentials with generic messaging that does not reveal auth internals.
- Support finite-session behavior and “remember this browser” only if implemented by the backend in E7.2.
- On successful login, transition into the requested app route or dashboard.
- Keep the UI responsive on mobile viewports.

### Logout Flow

- Add frontend logout action that calls the logout API.
- Clear client-visible authenticated state after logout.
- Navigate to `/login` after logout for claimed workspaces.
- Prevent browser back navigation from showing protected screens from stale client state.

### API Client and CSRF

- Centralize CSRF token retrieval/storage in the API client layer.
- Attach CSRF headers for all mutating API requests from one shared path.
- Do not store auth tokens, session IDs, or CSRF secrets in `localStorage` or `sessionStorage`.
- Update non-`requestJson` direct fetch paths, including terminal resize/delete and streaming helpers, so feature code does not reimplement CSRF behavior.
- Ensure EventSource/fetch stream behavior handles typed unauthorized responses and redirects through auth state rather than silently retrying.

## Out of Scope

- Backend auth service and route implementation (E7.1/E7.2).
- Backend guard, CSRF validation, origin checks, SSE, and WebSocket enforcement (E7.3).
- Profile password-change form (E7.5), except logout/auth state reuse.
- Deployment docs and CLI claim-code (E7.6).

## Acceptance Criteria

- Auth bootstrap renders `/claim` for unclaimed status.
- Auth bootstrap renders `/login` for claimed unauthenticated status.
- Authenticated status renders the originally requested app route.
- Protected content is not shown before auth status resolves.
- Claim form requires claim code, strong password, and confirmation.
- Claim form surfaces validation errors without revealing sensitive details.
- Login form handles invalid credentials with generic messaging.
- Logout clears client-visible authenticated state and prevents stale protected-page display through browser back navigation.
- The API client attaches CSRF headers to mutating requests from one shared implementation.
- No auth tokens or session IDs are stored in `localStorage` or `sessionStorage`.
- Claim and login screens are usable on mobile viewports.
- Frontend unit tests cover auth bootstrap states, claim form validation, login errors, CSRF header attachment, and logout state clearing.
- E2E tests cover fresh workspace claim, claimed workspace login, protected deep-link redirect, and logout back-navigation behavior.

## Key Files to Create/Modify

- `packages/frontend/src/app/AppRouter.tsx`
- `packages/frontend/src/app/routes.tsx`
- `packages/frontend/src/pages/ClaimPage.tsx`
- `packages/frontend/src/pages/LoginPage.tsx`
- `packages/frontend/src/context/AuthProvider.tsx`
- `packages/frontend/src/hooks/use-auth-query.ts`
- `packages/frontend/src/lib/api.ts`
- `packages/frontend/src/lib/query-client.ts`
- `packages/frontend/src/App.test.tsx`
- `packages/frontend/src/app/routes.test.ts`
- `packages/frontend/src/lib/api.test.ts`
- `packages/frontend/e2e/owner-auth.spec.ts`

## Reference

- Parent epic: `development/engine-infrastructure/07-owner-claim-and-access-control.md`
- Current routes: `packages/frontend/src/app/routes.tsx`
- Current router shell: `packages/frontend/src/app/AppRouter.tsx`
- Current API client: `packages/frontend/src/lib/api.ts`
- Existing profile/theming visual language: `packages/frontend/src/pages/ProfilePage.tsx`
