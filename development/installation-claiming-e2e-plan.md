# Installation And Claiming E2E Plan

## Goal

Add a separate real-server E2E suite that verifies a fresh CommandsCenter installation can generate a claim code, claim the workspace through the browser, log in again, and preserve owner access when the workspace directory is copied.

## Scope

- Run against the built CLI/static app, not the mocked Vite frontend E2Es.
- Use a temporary workspace directory per test run.
- Use SQLite local state inside the temporary workspace.
- Keep this suite separate from fast mocked frontend tests because it exercises process startup, static serving, cookies, CSRF, and persisted auth state.

## Proposed Test Flow

1. Build the CLI package with `pnpm build:cli`.
2. Create a temporary directory and `.env` file with `CC_WORKSPACE_DIR`, `CC_SECRET_KEY`, `CC_UPDATE_CHECK=false`, and a test-only port.
3. Run `node packages/cli/dist/bin.mjs claim --yes --cc-env-file <tmp>/.env` and parse `CLAIM code: <code>` from stdout.
4. Start `node packages/cli/dist/bin.mjs start --host 127.0.0.1 --port <port> --cc-env-file <tmp>/.env` as the Playwright web server.
5. Navigate to `/` and assert redirect to `/claim`.
6. Submit the claim code, owner password, and confirmation.
7. Assert the app redirects to the authenticated shell and the dashboard is visible.
8. Open a fresh browser context with no cookies, navigate to `/`, and assert redirect to `/login`.
9. Log in with the owner password and assert the dashboard is visible.
10. Stop the server, copy the temporary workspace directory, restart the CLI with the copied workspace, and verify the same owner password still logs in.

## Suggested Structure

- `packages/frontend/playwright.real.config.ts` for real-server E2E config.
- `packages/frontend/e2e-real/installation-claiming.spec.ts` for the flow above.
- A small Node helper for temp env creation, free-port allocation, CLI stdout parsing, and process cleanup.

## CI Command

Use a separate CI step after build:

```bash
pnpm build:cli
pnpm --filter @cc/frontend test:e2e:real
```

## Notes

- Do not reuse mocked API routes in this suite.
- Keep `CC_UPDATE_CHECK=false` to avoid network-dependent startup behavior.
- The portability assertion should copy the workspace directory only, not global machine state.
