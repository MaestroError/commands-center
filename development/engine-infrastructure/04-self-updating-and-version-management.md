# E4 Self-Updating and Version Management

## Outcome

The app detects its installation mode, checks for updates periodically, and supports CLI and UI-triggered updates with rollback safety.

## Why this is a separate PR

GOAL.md dedicates significant scope to self-updating. This is a complete backend feature with version detection, update execution, and rollback that cuts across CLI and API surfaces.

## Blockers

- E1 Runtime Bootstrap
- E3 API and Realtime Foundation

## Unblocks

- U1 App Shell and Dashboard (update banner data)
- U5 Profile, Settings, and Theming (settings update flow)

## Scope

- Implement installation mode auto-detection at startup: Docker (`CC_DOCKER` env or `/.dockerenv` file), npm global (global path is ancestor of `__dirname`), bare metal (`.git` in project root), npm local (fallback)
- Implement periodic version check against the npm registry on startup and at `CC_UPDATE_INTERVAL_MS` intervals
- Expose `GET /api/system/version` returning `{ current, latest, updateAvailable, installMode }`
- Implement `POST /api/system/update` endpoint and `ccenter upgrade` CLI command
- Handle npm update (`npm install -g commandscenter@latest`), git update (`git pull origin main && npm ci && npm run build` with dirty-working-tree abort), and Docker guidance (cannot self-update, return user instructions)
- Implement graceful restart protocol after successful update: stop accepting connections, cancel pending cron jobs, SIGTERM OpenCode engine with `CC_AGENT_SHUTDOWN_TIMEOUT_MS` grace then SIGKILL, flush logs, close DB connections, sync final state to SQLite, exit 0 for process supervisor restart
- Maintain `~/.cc/versions.json` history log of applied updates
- Implement `ccenter upgrade --rollback` to reinstall the previous version from history
- Add pre-update safety checks: warn on active chat sessions, validate DB migration compatibility, check Node.js `engines` field
- Respect `CC_UPDATE_CHECK`, `CC_UPDATE_INTERVAL_MS`, and `CC_AUTO_UPDATE` environment config

## Acceptance Criteria

- Installation mode is correctly detected for npm global, npm local, bare metal, and Docker environments
- Version check runs on startup and at the configured interval without blocking the main event loop
- `GET /api/system/version` returns accurate current version, latest version, update availability, and installation mode
- `ccenter upgrade` and `POST /api/system/update` execute the correct update flow for the detected mode
- Docker mode returns guidance text instead of attempting self-update
- Graceful restart follows the full 5-step drain protocol before exit
- `ccenter upgrade --rollback` reinstalls the previous version recorded in `versions.json`
- Pre-update checks prevent updates when active sessions exist or migration incompatibilities are detected
- `CC_AUTO_UPDATE=true` applies updates automatically for npm and git modes but never for Docker

## Non-Goals

- Settings or dashboard UI rendering (owned by U5 and U1)
- Watchtower or external Docker update automation
