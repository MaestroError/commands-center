# E1 Runtime Bootstrap

## Outcome

The app starts reliably in development and production, initializes `.cc/` on first run, validates runtime configuration, and shuts down cleanly.

## Why this is a separate PR

This is the platform entry point for every other feature. Once merged, all later PRs can assume stable paths, config, logging, and startup behavior.

## Blockers

- None

## Unblocks

- E2 OpenCode Orchestrator
- E3 API and Realtime Foundation
- C1 Database and Workspace Foundation

## Scope

- Add a typed runtime config module with Zod validation
- Support `CC_PORT`, `CC_HOST`, `CC_DATA_DIR`, `CC_WORKSPACE_DIR`, engine timeouts, auth timeouts, and log level
- Implement first-run bootstrap for `.cc/`, `.cc/local.db`, and workspace root folders
- Add structured logging setup and request correlation IDs
- Implement graceful shutdown as a reusable drain protocol: stop accepting connections, cancel pending scheduled jobs, SIGTERM child processes with configured grace period, flush logs, close DB connections, sync final state to SQLite, exit 0
- Align CLI startup behavior with `GOAL.md` first-run flow

## Acceptance Criteria

- Starting the app in an empty workspace creates the required local runtime folders
- Invalid environment configuration fails fast with actionable errors
- The app logs startup configuration without leaking secrets
- `SIGINT` and `SIGTERM` trigger the full drain protocol: stop listeners, cancel jobs, terminate child processes, flush and close resources, then exit cleanly
- The drain protocol is reusable by the self-updating flow (E4) for post-update restart
- CLI and dev startup paths use the same config/bootstrap code path

## Non-Goals

- Spawning OpenCode
- Defining business entities
- Building any user-facing screens beyond health confirmation
