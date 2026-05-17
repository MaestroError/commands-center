# E7.5 Profile Password Management

## Goal

Let the authenticated owner change their password from the profile page while preserving the single-owner model and revoking other active sessions. After this sub-epic, owners can rotate credentials without using reclaim, and lost-password recovery remains a local CLI operator action.

## Pre-Conditions

- E7.2 Claim, Login, Logout, and Session API is complete.
- E7.3 Backend Route Protection, CSRF, Origin, and Realtime Security is complete.
- E7.4 Frontend Auth Bootstrap, Claim/Login UX, and API Client is complete.
- U5 Profile, Settings, and Theming is complete.

## Scope

### Backend Password Change API

- Add an authenticated owner password-change endpoint.
- Require current password, new password, and confirm new password.
- Validate the current password before changing the password.
- Apply the same strong-password rules used during claim and reclaim.
- Reject new passwords that match the current password.
- Reject mismatched password confirmation.
- Store only updated password hash metadata.
- Revoke other active sessions after successful password change.
- Keep or refresh only the current session after successful password change.
- Rotate CSRF material for the current session if required by the E7.3 CSRF design.

### Profile UI

- Add a password change form to `ProfilePage` for authenticated owners.
- Include fields for current password, new password, and confirm new password.
- Show password-strength guidance consistent with claim/reclaim screens.
- Surface validation errors without exposing sensitive internals.
- Show success state that explains other sessions were signed out.
- Keep the form usable on mobile viewports.

### Session Effects

- Other active browser sessions must become unauthenticated after password change.
- The current browser session remains authenticated or is transparently refreshed.
- If the current session cannot be preserved safely, force a login and document that behavior in the UX copy.

### Audit-Safe Logging

- Log password-change success and failure without logging plaintext passwords, password hashes, session IDs, CSRF tokens, or cookies.
- Include request ID and workspace context when available.

## Out of Scope

- Unauthenticated web password reset.
- Email recovery, OAuth login, teams, roles, invitations, or shared owner accounts.
- CLI reclaim command implementation beyond using E7.1/E7.2 service behavior already built.
- Full session management UI for listing/revoking sessions individually.

## Acceptance Criteria

- Authenticated owners can change their password from the profile page.
- Password change requires current password, new password, and confirmation.
- Incorrect current password is rejected.
- Weak, mismatched, or reused new passwords are rejected.
- Successful password change persists only password hash metadata.
- Successful password change revokes other active sessions.
- Current session is preserved or refreshed according to the implemented session strategy.
- Password-change logs do not include plaintext passwords, hashes, session IDs, CSRF tokens, or cookies.
- Backend service and route tests cover current-password validation, weak/mismatched/reused password rejection, success, and session revocation.
- Frontend tests cover form validation, error display, success state, and mobile-safe layout assumptions.
- E2E tests cover changing the password, logging in with the new password, and invalidating a second active browser session.

## Key Files to Create/Modify

- `packages/shared/src/schemas/owner-auth.ts`
- `packages/backend/src/services/owner-access-service.ts`
- `packages/backend/src/routes/owner-auth.ts`
- `packages/backend/test/services/owner-access-service.test.ts`
- `packages/backend/test/routes/owner-auth.test.ts`
- `packages/frontend/src/pages/ProfilePage.tsx`
- `packages/frontend/src/lib/api.ts`
- `packages/frontend/src/lib/api.test.ts`
- `packages/frontend/src/pages/ProfilePage.test.tsx`
- `packages/frontend/e2e/owner-auth.spec.ts`

## Reference

- Parent epic: `development/engine-infrastructure/07-owner-claim-and-access-control.md`
- Profile surface: `packages/frontend/src/pages/ProfilePage.tsx`
- Auth service from E7.1/E7.2: `packages/backend/src/services/owner-access-service.ts`
