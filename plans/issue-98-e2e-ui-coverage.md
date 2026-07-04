# Issue 98 E2E UI Coverage Plan

## Assumptions

- Issue 98 is a test-coverage issue; no production behavior change is needed unless a test exposes a broken mock or selector.
- The existing Playwright pattern is route-level in-memory API mocks, so new suites should reuse that pattern for fast, deterministic UI coverage.
- "Every sidebar route" means at least one Playwright spec for each route with `navLabel` in `packages/frontend/src/app/routes.tsx`; existing suites already cover specialists, skills, tasks, terminal, tools, and providers.

## Todo

1. [x] Add shared Playwright mock helpers for common sidebar pages and chat.
   - Verify: TypeScript compiles and new specs can import helpers without circular fixtures.
2. [x] Add chat E2E coverage for send/streaming, tool rendering, attachment upload, conversation switching, and degraded/error state.
   - Verify: `pnpm --filter @cc/frontend test:e2e -- --project=chromium --grep @chat`.
3. [x] Add sidebar smoke coverage for missing routes: dashboard, documents, files, integrations, API, settings, plus claim/login flow.
   - Verify: `pnpm --filter @cc/frontend test:e2e -- --project=chromium --grep @smoke`.
4. [x] Add task board E2E coverage for scheduled drag dialog, archive restore/delete, review accept, subtask progress, cancel running card, and empty/overflow columns.
   - Verify: `pnpm --filter @cc/frontend test:e2e:tasks`.
5. [x] Run required quality checks.
   - Verify: `pnpm --filter @cc/frontend lint -- --fix`, `pnpm test`, and relevant Playwright suites.
6. [x] Commit, push, and open a draft PR linked to issue 98.
   - Verify: pushed branch and PR URL.
