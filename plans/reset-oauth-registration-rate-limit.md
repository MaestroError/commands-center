# Reset OAuth Registration Rate Limit

**Status:** Implemented and verified. Authored 2026-07-24.

## Goal

Make the owner-authenticated **Reset OAuth connections** recovery action allow
an OAuth client to register immediately after the dynamic-client-registration
quota has been exhausted.

## Scope

- Preserve the existing limit of 10 registration attempts per observed source
  in 10 minutes.
- Reset only the in-memory dynamic-client-registration limiter when the owner
  resets OAuth runtime state.
- Continue clearing all persisted OAuth provider records while preserving
  CommandsCenter API tokens.
- Document that the recovery action also clears the registration retry limit.

## Implementation

1. Add a regression test that exhausts dynamic client registration, confirms a
   further registration is rejected, performs the authenticated OAuth reset,
   and confirms a new registration succeeds.
2. Expose a narrow OAuth-provider operation that replaces the registration
   limiter with a fresh limiter using the existing configuration.
3. Invoke that operation from the OAuth runtime reset route alongside the
   provider-record clear.
4. Update the public MCP authentication recovery documentation and API-screen
   copy.

## Verification

- `pnpm exec eslint packages/backend/src packages/backend/test packages/frontend/src --fix`
- Focused backend OAuth tests
- Focused frontend API-screen tests
- `pnpm typecheck`
- `pnpm test`
