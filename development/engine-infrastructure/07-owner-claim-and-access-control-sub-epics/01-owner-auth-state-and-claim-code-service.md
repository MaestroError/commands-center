# E7.1 Owner Auth State and Claim Code Service

## Goal

Create the portable owner-access foundation: workspace auth directory layout, claim state, claim-code generation and rotation, reclaim primitives, strong-password validation rules, and audit-safe logging. After this sub-epic, CommandsCenter can determine whether a workspace is unclaimed or claimed and can issue a one-time claim code without exposing plaintext secrets in persisted state.

## Pre-Conditions

- E1 Runtime Bootstrap is complete.
- E3 API and Realtime Foundation is complete.
- Runtime config already resolves `.cc/workspace/auth/` through the Portable Workspace Rule.
- CLI and Docker startup paths are stable enough to surface first-run setup instructions later in E7.6.

## Scope

### Auth State Layout

- Define the auth-owned workspace state under `.cc/workspace/auth/`.
- Store owner access metadata in `owner-access.json` or an equivalent auth-owned file.
- Persist only hashes and non-secret metadata for claim codes and owner passwords.
- Keep all owner auth state portable with the workspace; do not depend on machine-local keychains, host users, or external auth providers.
- Use atomic writes for auth state files to avoid partial state if the process exits mid-write.

### Claim Code Lifecycle

- Generate a high-entropy one-time claim code on first run for an unclaimed workspace.
- Store only a hash of the claim code plus metadata such as created time, expiry if used, rotation timestamp, and attempt counters.
- Invalidate old claim codes when a fresh claim code is generated.
- Invalidate the active claim code immediately after successful claim.
- Support claim-code rotation for unclaimed workspaces and claimed workspaces without immediately deleting the existing owner password.
- Make generated claim codes suitable for CLI, Docker logs, and service logs without persisting plaintext values.

### Reclaim Foundation

- Model reclaim as a fresh claim-code flow for claimed workspaces.
- Generating a reclaim code must not remove or replace the current owner password until the reclaim flow is completed.
- Completing reclaim must be exposed as a service capability that can later set a new owner password and revoke sessions in E7.2/E7.5.
- CLI-facing service output must include a clear warning that whoever reads the code gets temporary owner recovery power.

### Password Rules and Hashing Decision

- Define shared strong-password validation rules used by claim, reclaim, login setup, and profile password change.
- Enforce minimum length, reject common weak passwords, reject passwords matching the claim code, and return clear validation errors.
- Decide password hashing implementation before storing owner passwords:
  - Prefer `argon2id` with conservative production parameters.
  - If Argon2 is impractical for supported install targets, use Node `scrypt` as the explicit fallback and document the tradeoff.
- Store password hash metadata in an algorithm-versioned shape so future rotation is possible.

### Rate Limit State

- Add service-level rate-limit state for claim and reclaim attempts.
- Rate limit by workspace and client IP where request context is available in later route work.
- Keep rate-limit state free of plaintext claim codes or passwords.

### Audit-Safe Logging

- Log claim-code creation/rotation, successful claim, failed claim attempt, and reclaim completion events without logging claim codes, passwords, password hashes, session IDs, CSRF tokens, or raw cookies.
- Include enough structured context for diagnostics: event type, workspace path, request ID when available, and outcome.

## Out of Scope

- HTTP claim, login, logout, and auth status routes (E7.2).
- Browser session cookies and session persistence (E7.2).
- Backend route protection, CSRF, origin checks, SSE, and WebSocket enforcement (E7.3).
- Frontend claim/login screens (E7.4).
- Profile password-change UI (E7.5).
- CLI command parsing and deployment docs (E7.6), except exposing reusable service methods those surfaces will call.

## Acceptance Criteria

- A fresh workspace can initialize portable owner-auth state under `.cc/workspace/auth/`.
- An unclaimed workspace can generate a one-time claim code and persist only a hash plus safe metadata.
- Generating a fresh claim code invalidates previous claim codes.
- Successful claim invalidates the active claim code.
- Claimed workspaces can generate reclaim codes without removing the existing owner password until reclaim completion.
- Strong-password validation is implemented once and reusable by claim, reclaim, and profile password management.
- Password hash metadata uses `argon2id` or a documented `scrypt` fallback.
- Claim/reclaim attempts can be rate-limited using workspace and IP dimensions.
- Auth logs never include plaintext passwords, claim codes, hashes, session IDs, CSRF tokens, or cookies.
- Unit tests cover fresh state creation, claim-code hashing/rotation/invalidation, reclaim-code generation, weak-password rejection, and portable path placement.

## Key Files to Create/Modify

- `packages/backend/src/services/owner-access-service.ts`
- `packages/backend/src/lib/owner-password.ts`
- `packages/backend/src/lib/owner-claim-code.ts`
- `packages/backend/src/lib/auth-state-store.ts`
- `packages/backend/src/lib/start-server-runtime.ts`
- `packages/backend/src/lib/runtime-paths.ts`
- `packages/backend/test/services/owner-access-service.test.ts`
- `packages/backend/test/lib/runtime-paths.test.ts`
- `packages/shared/src/schemas/owner-auth.ts`

## Reference

- Parent epic: `development/engine-infrastructure/07-owner-claim-and-access-control.md`
- Runtime paths: `packages/backend/src/lib/runtime-config.ts`
- Runtime startup: `packages/backend/src/lib/start-server-runtime.ts`
- Portable workspace rule: all auth state must live under `.cc/workspace/auth/` or workspace-local DB state.
