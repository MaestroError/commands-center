# E7. Owner Claim and Access Control

## Goal

Make CommandsCenter safe to run on a VPS, in Docker, or behind a public domain without turning it into a multi-user product. The app remains single-operator, but every internet-facing deployment must have an explicit owner claim flow, login flow, secure browser session, and route protection before files, terminals, agents, secrets, tasks, or API endpoints can be used.

## Decision Summary

- Add a first-run owner claim flow backed by a setup claim code.
- Add a CLI command to generate a fresh claim code when the original code is missed, expired, rotated, or an instance needs to be reclaimed.
- Store owner access state inside `.cc/workspace/auth/` so it follows the Portable Workspace Rule.
- Treat this as owner access control, not registration, teams, roles, or multi-tenancy.
- When the workspace is unclaimed, browser navigation to any app route must lead to `/claim`.
- When the workspace is claimed but the browser is not logged in, browser navigation to any app route must lead to `/login`.
- Protect APIs, SSE streams, and WebSocket upgrades server-side. Frontend redirects are only a user experience layer, not the security boundary.

## Why This Is Needed

CommandsCenter can browse and edit files, run interactive terminals, manage secrets, configure integrations, and operate AI agents. Running that surface on `0.0.0.0` without access control is not acceptable for Docker, VPS, or public-domain use.

The MVP remains a single-user workspace application. The owner claim flow provides a secure first-use boundary without adding organizations, user invitations, billing accounts, or multi-user collaboration.

## Pre-Conditions

- E1 Runtime Bootstrap is complete.
- E3 API and Realtime Foundation is complete.
- U0 Frontend Foundation is complete.
- CLI packaging and Docker entrypoints are stable enough to print or expose first-run setup instructions.

## Scope

### Owner Claim Flow

- On first run for an unclaimed workspace, generate a one-time claim code and store only a hash of it under `.cc/workspace/auth/`.
- Show the initial claim code in CLI output, Docker logs, and service logs with clear instructions to open `/claim`.
- Add `ccenter claim-code` or equivalent CLI command that rotates and prints a fresh one-time claim code for the active workspace.
- Require the claim code on `/claim` before accepting owner password setup.
- Invalidate old claim codes when a new claim code is generated.
- Invalidate the claim code immediately after the workspace is successfully claimed.
- Rate-limit claim attempts so the code cannot be brute-forced from the internet.
- Keep the claim screen focused on ownership language: "Secure Your CommandsCenter" and "This instance controls files, terminals, agents, and secrets."

### Login and Session Flow

- Add `/login` for claimed workspaces.
- Require a strong owner password during claim setup.
- Hash the owner password with `argon2id` using conservative production parameters. If dependency constraints make Argon2 impractical on supported install targets, use Node `scrypt` as the explicit fallback and document the tradeoff.
- Store password hash metadata in `.cc/workspace/auth/owner-access.json` or an equivalent auth-owned file.
- Create browser sessions using high-entropy opaque session IDs stored server-side in workspace auth state or the local database.
- Send session IDs only through `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
- Do not store auth tokens in localStorage or sessionStorage.
- Support logout by deleting the server-side session and clearing the cookie.
- Expose an auth status endpoint that tells the frontend only whether the workspace is `unclaimed`, `claimed-authenticated`, or `claimed-unauthenticated`.
- Keep password reset/reclaim as an operator action through the CLI, not an unauthenticated web flow.

### Owner Password Management

- Add a password change form to the profile page for authenticated owners.
- Require current password, new password, and confirm new password.
- Validate the current password before changing the owner password.
- Apply the same strong-password rules used during the claim flow.
- Reject new passwords that match the current password.
- After successful password change, revoke other active sessions and keep or refresh only the current session.
- Log password changes without logging plaintext passwords, password hashes, session IDs, or CSRF tokens.
- Do not expose unauthenticated password reset in the web UI. Lost-password recovery remains `ccenter claim-code` plus reclaim flow.

### Route Protection and Redirect Behavior

- Add a global backend auth guard that runs before protected routes.
- Leave only minimal public endpoints available: health needed for uptime checks, auth status, claim, login, logout, CSRF token bootstrap if separate, and static assets needed to render claim/login.
- When unclaimed, direct browser navigations to any app route must render or redirect to `/claim`.
- When claimed but unauthenticated, direct browser navigations to any app route must render or redirect to `/login`.
- API requests made without a valid session must return typed `401` or `403` responses instead of returning the frontend HTML shell.
- `ccenter serve` API-only mode must enforce the same auth guard as `ccenter start`.
- WebSocket upgrades, especially terminal connections, must validate the owner session before accepting the upgrade.
- SSE or event-stream routes must validate the owner session before opening the stream.
- File manager, terminal, secrets, providers, integrations, MCP management, tasks, and agent routes must all be protected by default.

### CSRF and Browser Request Safety

- Add CSRF protection for cookie-authenticated mutating requests.
- Use a double-submit token or server-issued CSRF token that the frontend sends in a custom header for `POST`, `PUT`, `PATCH`, and `DELETE` requests.
- Do not require CSRF tokens for safe `GET` requests, but do require a valid session where the route is protected.
- Rotate CSRF material on login and logout.
- Ensure API clients have one shared place that attaches CSRF headers so feature code does not reimplement it.

### Origin and Host Checks

- Validate `Origin` on browser mutating requests, SSE, and WebSocket upgrades.
- Validate forwarded host/proto information against the configured public origin when running behind a reverse proxy.
- Allow configured public origins through an explicit environment variable such as `CC_PUBLIC_ORIGIN` or `CC_ALLOWED_ORIGINS`.
- In development, allow localhost origins for the configured Vite and API ports.
- Reject cross-site WebSocket upgrades even if the browser sends cookies.
- Document reverse proxy requirements for `X-Forwarded-Proto`, HTTPS, and cookie `Secure` behavior.

### Deployment and Setup Paths

#### NPM Global

- User installs with `npm install -g commandscenter`.
- User starts with `ccenter start`.
- If the workspace is unclaimed, CLI output prints the local URL, public binding warning, and one-time claim code.
- User opens `/claim`, enters the claim code, sets a strong owner password, then lands in the app.
- If the user missed the code, they run `ccenter claim-code` from the same workspace context to rotate and print a fresh code.

#### Bash Service Installer

- Installer creates or confirms the env file and workspace directory.
- Installer starts the service and prints where to read service logs for the first claim code.
- Installer optionally runs the claim-code command once after service setup and prints the code directly if it has access to the same workspace.
- Generated service docs tell the operator to claim before exposing DNS publicly.
- Reclaim uses the same CLI command under the service user so the active workspace is targeted correctly.

#### Docker

- Container startup generates a claim code for an unclaimed mounted workspace and writes it to container logs.
- The claim code must not be baked into the image.
- Reclaim is done with `docker exec <container> ccenter claim-code` or a documented one-shot command using the same mounted volume.
- Docker documentation must emphasize persistent volume mounting for `.cc/workspace/auth/`, database, agents, and all portable state.
- Reverse proxy examples must include HTTPS, forwarded proto headers, and websocket upgrade forwarding.

#### VPS and Public Domain

- Recommended path is HTTPS through a reverse proxy such as Caddy, nginx, Traefik, or a platform load balancer.
- CommandsCenter still enforces its own owner session even when the reverse proxy also has access control.
- The setup guide should direct operators to start the app, retrieve the claim code from logs or CLI, claim the instance at `https://domain/claim`, then use normal login afterward.
- If `CC_PUBLIC_ORIGIN` or allowed origins are configured, examples should show the public `https://` origin.

### Reclaim and Recovery

- `ccenter claim-code` must work for unclaimed workspaces and for claimed workspaces when run locally by the operator with filesystem access.
- For claimed workspaces, generating a claim code should not immediately remove the existing owner password unless the operator completes the reclaim flow.
- Reclaim flow should require the fresh claim code and then allow setting a new owner password.
- Completing reclaim should revoke existing sessions.
- CLI output must warn that claim-code generation gives temporary owner recovery power to whoever can read the code.

### Security Defaults

- Strong password validation: minimum length, reject common weak passwords, reject passwords matching the claim code, and provide clear UI guidance.
- Session expiration should be finite by default, with a practical "remember this browser" option only if implemented deliberately.
- Cookies must be `Secure` in production and when the public origin is HTTPS.
- Failed login and claim attempts must be rate-limited per IP and per workspace.
- Auth logs should record claim, login success, login failure, logout, claim-code rotation, and reclaim completion without logging passwords, claim codes, session IDs, CSRF tokens, or hashes.
- Existing `CC_SECRET_KEY` must not be the only auth boundary for owner sessions. Use dedicated owner auth state and rotatable session material.

## Out of Scope

- Multi-user accounts, teams, invitations, roles, or permissions.
- Email-based password reset.
- OAuth login as the primary access method.
- Hosted identity providers as a required dependency.
- Sharing an instance with other operators.
- Public unauthenticated API access.

## Acceptance Criteria

- An unclaimed workspace always leads browser users to `/claim` before any app feature can be used.
- A claimed workspace always leads unauthenticated browser users to `/login` before any app feature can be used.
- Protected API requests without a valid session return typed unauthorized responses.
- Terminal WebSocket upgrades cannot be established without a valid owner session.
- SSE/event-stream routes cannot be opened without a valid owner session.
- A first-run claim code is generated and visible through CLI or container/service logs.
- A CLI command exists to rotate and print a fresh claim code for the active workspace.
- Owner passwords are strongly validated and stored only as password hashes using `argon2id` or the documented fallback.
- Authenticated owners can change their password from the profile page by entering old password, new password, and confirmation.
- Changing the owner password revokes other active sessions.
- Owner passwords are not accepted as API keys for external clients.
- Sessions use `HttpOnly`, `Secure`, `SameSite=Lax` cookies and server-side session validation.
- Mutating cookie-authenticated requests require CSRF protection.
- Browser mutating requests and websocket upgrades enforce origin checks.
- Auth state is stored inside `.cc/workspace/auth/` and remains portable with the workspace.
- Reclaiming revokes existing sessions after a new owner password is set.
- Deployment docs cover npm-global, Bash service installer, Docker, and VPS/public-domain setup paths.

## Testing Strategy

### Backend Unit and Service Tests

- Test claim state creation for a fresh workspace.
- Test claim-code rotation invalidates previous codes.
- Test successful claim stores only password hash metadata and invalidates the claim code.
- Test weak password rejection and clear validation errors.
- Test login success, login failure, logout, session expiration, and session revocation.
- Test profile password change requires the current password.
- Test profile password change rejects weak, mismatched, reused, or incorrectly confirmed new passwords.
- Test successful profile password change revokes other active sessions.
- Test reclaim sets a new owner password and revokes existing sessions.
- Test auth state remains under the configured workspace auth directory.

### Backend Route and Security Tests

- Test every API route is protected by default unless explicitly listed as public.
- Test unclaimed protected browser navigation resolves to `/claim` behavior.
- Test claimed unauthenticated browser navigation resolves to `/login` behavior.
- Test unauthenticated API requests return typed `401` or `403`, not `index.html`.
- Test mutating requests without CSRF token fail.
- Test mutating requests with invalid `Origin` fail.
- Test allowed origin requests pass with valid session and CSRF token.
- Test terminal WebSocket upgrade without session fails.
- Test terminal WebSocket upgrade with invalid origin fails.
- Test SSE/event-stream endpoints reject unauthenticated requests.

### Frontend Tests

- Test auth bootstrap renders `/claim` for unclaimed status.
- Test auth bootstrap renders `/login` for claimed unauthenticated status.
- Test authenticated status renders the requested app route.
- Test login form handles invalid credentials without revealing whether the password exists.
- Test claim form requires claim code, strong password, and password confirmation.
- Test profile password form requires old password, new password, and confirm password.
- Test profile password form surfaces validation errors without exposing sensitive details.
- Test API client attaches CSRF headers to mutating requests.
- Test logout clears client-visible authenticated state.

### CLI and Deployment Tests

- Test `ccenter claim-code` creates a code for an unclaimed workspace.
- Test `ccenter claim-code` rotates a code for an existing workspace.
- Test the command respects `--cc-env-file`, `CC_WORKSPACE_DIR`, and service/Docker workspace paths.
- Add Docker smoke coverage that confirms first-run logs include claim instructions without leaking secrets after claim completion.
- Add installer smoke coverage that confirms service instructions point to the correct logs and workspace.

### E2E Tests

- Fresh workspace: open `/`, land on `/claim`, claim with setup code, reach dashboard.
- Claimed workspace: open `/`, land on `/login`, login, reach dashboard.
- Unauthenticated user cannot open file manager, terminal, agents, tasks, settings, or protected deep links.
- Authenticated user can create a terminal session and connect websocket successfully.
- Authenticated owner can change password from profile and then log in with the new password.
- Password change invalidates a second active browser session.
- Logout prevents returning to protected pages via browser back navigation.
- Reclaim flow with CLI-generated code lets the operator reset the password and invalidates the old session.

### Regression Guardrails

- Maintain an explicit list of public routes in one backend module and test that no protected route is accidentally added to it.
- Add tests for new route registration patterns so future features are protected by default.
- Add CI checks that run auth route tests whenever backend route files change.
- Include security-sensitive assertions in both unit and e2e suites because redirect-only tests do not prove API protection.

## Recommended Sub-Epics

This epic should be split into sub-epics. It is security-sensitive and crosses backend auth services, global route guards, browser sessions, CSRF, origin checks, SSE/WebSocket protection, frontend routing, profile UX, CLI recovery commands, Docker/service setup, and deployment documentation.

1. **E7.1 Owner Auth State and Claim Code Service** — `development/engine-infrastructure/07-owner-claim-and-access-control-sub-epics/01-owner-auth-state-and-claim-code-service.md`
   - Create portable `.cc/workspace/auth/` state, claim-code generation/rotation, reclaim primitives, password validation, hashing decision, rate-limit state, and audit-safe logging.

2. **E7.2 Claim, Login, Logout, and Session API** — `development/engine-infrastructure/07-owner-claim-and-access-control-sub-epics/02-claim-login-logout-and-session-api.md`
   - Add auth status, claim, reclaim completion, login, logout, server-side sessions, secure cookies, session expiration, and revocation behavior.

3. **E7.3 Backend Route Protection, CSRF, Origin, and Realtime Security** — `development/engine-infrastructure/07-owner-claim-and-access-control-sub-epics/03-backend-route-protection-csrf-origin-and-realtime-security.md`
   - Add protected-by-default backend guard, public route allowlist, typed unauthorized responses, CSRF, origin/host checks, terminal WebSocket protection, SSE protection, and regression guardrails.

4. **E7.4 Frontend Auth Bootstrap, Claim/Login UX, and API Client** — `development/engine-infrastructure/07-owner-claim-and-access-control-sub-epics/04-frontend-auth-bootstrap-claim-login-and-api-client.md`
   - Add `/claim`, `/login`, auth bootstrap, protected app routing, logout state handling, centralized CSRF API-client behavior, and frontend/e2e coverage.

5. **E7.5 Profile Password Management** — `development/engine-infrastructure/07-owner-claim-and-access-control-sub-epics/05-profile-password-management.md`
   - Add authenticated password change from the profile page, current-password validation, strong-password reuse rules, session revocation, logging, and tests.

6. **E7.6 CLI, Deployment, and Public-Origin Hardening** — `development/engine-infrastructure/07-owner-claim-and-access-control-sub-epics/06-cli-deployment-and-public-origin-hardening.md`
   - Add `ccenter claim-code`, first-run setup output, npm-global/service/Docker/VPS docs, reverse proxy requirements, public origin env docs, and smoke coverage.

Recommended order: E7.1 → E7.2 → E7.3 → E7.4 → E7.5 → E7.6. E7.6 may start after E7.1 for CLI shape, but final deployment docs should land after E7.3 defines origin and cookie behavior.

## Key Files to Create/Modify

- `packages/backend/src/services/owner-access-service.ts`
- `packages/backend/src/routes/owner-auth.ts`
- `packages/backend/src/lib/owner-auth-guard.ts`
- `packages/backend/src/lib/csrf.ts`
- `packages/backend/src/lib/origin-check.ts`
- `packages/backend/src/server.ts`
- `packages/backend/src/routes/terminal.ts`
- `packages/cli/src/cli.ts`
- `packages/frontend/src/pages/ClaimPage.tsx`
- `packages/frontend/src/pages/LoginPage.tsx`
- `packages/frontend/src/pages/ProfilePage.tsx`
- `packages/frontend/src/app/routes.tsx`
- `packages/frontend/src/lib/api.ts`
- `.env.prod.example`
- `README.md`
- `CONTRIBUTING.md`
- Docker and installer docs/scripts

## Reference

- Product goal: `GOAL.md`
- Runtime startup: `packages/backend/src/lib/start-server-runtime.ts`
- Server hooks: `packages/backend/src/server.ts`
- Route registration: `packages/backend/src/routes/index.ts`
- Terminal websocket upgrade path: `packages/backend/src/routes/terminal.ts`
- CLI startup and env-file generation: `packages/cli/src/cli.ts`
- Portable workspace rule: `.cc/workspace/` auth state must travel with the workspace

### Note on Future External API Access

- Do not use the owner password as an API key for custom clients, automation platforms, n8n, or external integrations.
- Owner passwords are for interactive browser login only.
- Future external API access should use separately generated API tokens with clear names, scopes, creation timestamps, last-used timestamps, and revocation controls.
- API tokens must be stored hashed, shown only once at creation time, and managed from an authenticated settings or profile surface.
- External clients should authenticate with an `Authorization: Bearer <token>` header instead of cookies, so CSRF protections remain browser-specific and API clients do not need cookie sessions.
- Initial token scopes can be intentionally small, such as task trigger/read access, rather than full owner-equivalent access by default.
