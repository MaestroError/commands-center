# Dependency Security Audit Remediation

**Status:** Implemented and locally verified. Authored 2026-07-28.

## Goal

Resolve the high-severity advisories reported by:

```sh
pnpm audit --audit-level=high --ignore-registry-errors
```

Keep the security work separate from feature changes, prefer compatible upstream
updates over broad overrides, and verify the CLI, backend, and frontend runtime
paths affected by the upgrades.

## Current High-Severity Findings

| Advisory                                        | Current path                                  | Resolution                                                                   |
| ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `GHSA-83w8-p2f5-377r`                           | CLI → `@fastify/static@9.1.3`                 | Upgrade to `@fastify/static@10.1.1` or newer                                 |
| `GHSA-c96f-x56v-gq3h`                           | Backend → `find-my-way@9.5.0`                 | Resolve to `find-my-way@9.7.0` or newer                                      |
| `GHSA-6g55-p6wh-862q` and `GHSA-r28c-9q8g-f849` | Vite/Vue → PostCSS                            | Resolve every PostCSS copy to `8.5.18` or newer                              |
| `GHSA-chx6-hx7r-mcp5` and `GHSA-qwww-vcr4-c8h2` | Frontend → React Router                       | Upgrade to React Router `8.3.0` or newer                                     |
| `GHSA-mh99-v99m-4gvg`                           | ESLint/tooling and `glob` → `brace-expansion` | Upgrade the v5 copy; temporarily ignore the unpatched legacy v1 tooling path |

## Upgrade Plan

### 1. Refresh compatible patched transitive dependencies

- Refresh the lockfile so Fastify and Middie resolve `find-my-way@9.7.0` or
  newer within their declared ranges.
- Resolve both PostCSS paths to `8.5.18` or newer. Use a narrow root override
  only if Vite and Vue cannot converge on the patched release naturally.
- Update the existing `brace-expansion` v5 override from `5.0.7` to `5.0.8`.
- Confirm the resolved graph with `pnpm why`.

### 2. Upgrade the CLI static-serving plugin

- Upgrade `@fastify/static` from v9 to `10.1.1` or newer.
- Keep Fastify on the supported v5 line unless the plugin requires a newer
  compatible patch.
- Verify CLI static serving, SPA fallback, packaged asset lookup, and CLI build.

### 3. Upgrade React Router to v8

React Router v8 removes `react-router-dom` and requires Node 22.22+, React
19.2.7+, and Vite 7+. CommandsCenter already requires Node 24.

- Replace `react-router-dom` with `react-router@8.3.0` or newer.
- Upgrade `react` and `react-dom` to at least `19.2.7`.
- Upgrade Vite to a supported v7-or-newer release and align
  `@vitejs/plugin-react` if its peer range requires it.
- Replace frontend source and test imports/mocks from `react-router-dom` with
  the appropriate `react-router` or `react-router/dom` entry point.
- Preserve the current declarative `BrowserRouter`/`Routes` architecture; do
  not introduce Framework Mode, loaders, actions, or RSC.
- Run focused navigation, authentication, OAuth callback, workspace, and task
  route tests before the full frontend suite and Playwright flows.

### 4. Record the temporary ESLint-tooling exception

- Add `GHSA-mh99-v99m-4gvg` to `pnpm.auditConfig.ignoreGhsas` only after the
  runtime `brace-expansion@5` path is patched.
- Document why the remaining vulnerable copy is development-only, inherited
  from ESLint tooling, and not safely replaceable with a forced major override.
- Track removal in
  `plans/future-checks/eslint-brace-expansion-advisory.md`.

### 5. Verify the result

```sh
pnpm install
pnpm why postcss find-my-way react-router @fastify/static brace-expansion -r --depth 5
pnpm audit --audit-level=high --ignore-registry-errors
pnpm design-system:audit
pnpm exec eslint packages/backend/src packages/backend/test packages/frontend/src --fix
pnpm typecheck
pnpm test
pnpm build:cli
pnpm --filter @cc/frontend test:e2e
```

## Acceptance Criteria

- The audit command exits successfully with no unignored high-severity
  advisories.
- The only high-severity exception is the documented legacy
  `brace-expansion@1` development-tooling path.
- No vulnerable PostCSS, `find-my-way`, `@fastify/static`, React Router, or
  runtime `brace-expansion` version remains in `pnpm-lock.yaml`.
- CLI static serving and SPA fallback continue to work.
- Existing frontend routes and navigation behave identically after the React
  Router import migration.
- Lint, typecheck, unit/integration tests, CLI build, and Playwright E2E pass.

## Verification Result

- Resolved versions:
  - `@fastify/static@10.1.2`
  - `find-my-way@9.7.0`
  - `postcss@8.5.18`
  - `react-router@8.3.0`
  - `react@19.2.8` and `react-dom@19.2.8`
  - `vite@7.3.6`
  - `brace-expansion@5.0.8` for the patched runtime/tooling path
- `react-router-dom` no longer appears in frontend manifests or source.
- ESLint with fixes, workspace lint, formatting, typecheck, Knip, CLI build,
  design-system audit, and Node-version consistency checks pass.
- Unit and integration suites pass:
  - CLI: 45 tests
  - Shared: 221 tests
  - Backend: 1,350 tests
  - Frontend: 1,473 tests
- Playwright passes 168 tests across desktop and mobile, with 56
  project-configured skips.
- `pnpm audit --audit-level=high --ignore-registry-errors` exits successfully.
  It reports 26 remaining findings: 6 low, 19 moderate, and the single
  explicitly ignored high-severity ESLint-tooling advisory.
