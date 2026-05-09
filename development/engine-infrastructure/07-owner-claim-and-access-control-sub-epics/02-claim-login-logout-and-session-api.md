# E7.2 Claim, Login, Logout, and Session API

## Goal

Expose owner access through typed HTTP APIs: auth status, claim, reclaim completion, login, logout, and server-side browser sessions. After this sub-epic, a browser can securely authenticate as the single owner using `HttpOnly` cookies backed by portable server-side session state.

## Pre-Conditions

- E7.1 Owner Auth State and Claim Code Service is complete.
- E3 API and Realtime Foundation is complete.
- Shared Zod schema patterns are available in `@cc/shared`.

## Scope

### Shared Auth Contracts

- Add shared schemas for auth status, claim input/result, reclaim input/result, login input/result, logout result, and password-change inputs if shared early.
- Auth status must expose only one of:
  - `unclaimed`
  - `claimed-authenticated`
  - `claimed-unauthenticated`
- Do not expose whether a password exists, password hash metadata, session IDs, claim-code hashes, CSRF secrets, or rate-limit internals.

### Claim and Reclaim Routes

- Add `/api/auth/status` as a minimal public endpoint.
- Add claim route that accepts claim code, owner password, and password confirmation.
- Validate claim code before owner password setup.
- Require strong owner password rules from E7.1.
- Reject passwords matching the claim code.
- Invalidate claim code immediately after successful claim.
- Add reclaim completion route for claimed workspaces that accepts a fresh claim code and new owner password.
- Completing reclaim must revoke existing sessions.
- Keep lost-password recovery as an operator action through CLI-generated claim code, not an unauthenticated email or web reset flow.

### Login and Logout Routes

- Add `/api/auth/login` for claimed workspaces.
- Return generic invalid-credentials errors without revealing whether a workspace is claimed, whether a password exists, or which field failed.
- Add `/api/auth/logout` that deletes the server-side session and clears the browser cookie.
- Log login success, login failure, logout, claim success, and reclaim completion without sensitive values.

### Server-Side Sessions

- Create high-entropy opaque session IDs.
- Store sessions server-side in workspace auth state or the local database.
- Include session creation time, last-used time, expiry time, user agent/IP metadata if useful, and revocation state.
- Make session expiration finite by default.
- Add optional “remember this browser” only if deliberately implemented with separate expiration rules.
- Owner passwords must not be accepted as API keys.
- Existing `CC_SECRET_KEY` must not be the only owner-auth boundary; use dedicated owner auth state and rotatable session material.

### Cookie Behavior

- Send session IDs only through cookies with `HttpOnly`, `SameSite=Lax`, and production-safe `Secure` behavior.
- Cookies must be `Secure` in production and whenever configured public origin is HTTPS.
- Do not store auth tokens in `localStorage` or `sessionStorage`.
- Clear cookies on logout and on invalid session detection where appropriate.

### Session Revocation

- Add service methods to revoke one session, revoke all sessions, and revoke all sessions except the current one.
- Reclaim completion must revoke existing sessions.
- Password change in E7.5 will reuse revoke-all-except-current behavior.

## Out of Scope

- Global backend protection for all routes (E7.3).
- CSRF token issue/validation and origin checks (E7.3), except ensuring session routes are shaped to support CSRF rotation later.
- Frontend claim/login pages and auth bootstrap (E7.4).
- Profile password-change endpoint/UI if not needed for session service tests (E7.5).
- CLI `claim-code` command implementation (E7.6).

## Acceptance Criteria

- Auth status returns only `unclaimed`, `claimed-authenticated`, or `claimed-unauthenticated`.
- An unclaimed workspace can be claimed with a valid claim code and strong confirmed owner password.
- Claiming stores only password hash metadata and invalidates the claim code.
- Claim attempts fail with typed errors for missing, invalid, expired, rotated, or rate-limited claim codes.
- A claimed workspace supports login with the owner password and creates a server-side session.
- Failed login attempts return generic typed errors and are rate-limited.
- Browser sessions use high-entropy opaque IDs in `HttpOnly`, `Secure` when required, `SameSite=Lax` cookies.
- Logout deletes the server-side session and clears the cookie.
- Reclaim with a fresh claim code sets a new owner password and revokes existing sessions.
- Owner passwords are not accepted as API keys or bearer tokens.
- Service and route tests cover claim, reclaim, login success, login failure, logout, session expiration, and session revocation.

## Key Files to Create/Modify

- `packages/shared/src/schemas/owner-auth.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/backend/src/services/owner-access-service.ts`
- `packages/backend/src/routes/owner-auth.ts`
- `packages/backend/src/routes/index.ts`
- `packages/backend/src/lib/owner-session-cookie.ts`
- `packages/backend/src/lib/start-server-runtime.ts`
- `packages/backend/test/services/owner-access-service.test.ts`
- `packages/backend/test/routes/owner-auth.test.ts`

## Reference

- Parent epic: `development/engine-infrastructure/07-owner-claim-and-access-control.md`
- Existing route registration: `packages/backend/src/routes/index.ts`
- Existing typed route patterns: `packages/backend/src/routes/agents.ts`
- Existing API error shape: `packages/backend/src/lib/api-error.ts`
