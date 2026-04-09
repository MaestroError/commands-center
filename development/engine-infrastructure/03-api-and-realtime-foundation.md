# E3 API and Realtime Foundation

## Outcome

The backend has a production-ready feature foundation: route layout, service boundaries, error handling, health/status services, and reusable API conventions.

## Why this is a separate PR

This lets all feature PRs plug into a stable backend contract instead of each feature inventing its own route and error patterns.

## Blockers

- E1 Runtime Bootstrap

## Unblocks

- U0 Frontend Foundation
- U1 App Shell and Dashboard
- E4 Self-Updating and Version Management
- U4 File Manager and Terminals
- U5 Profile, Settings, and Theming
- I4 Automations

## Scope

- Establish route registration by domain
- Establish service-first architecture convention: all business logic lives in services, exposed via REST API routes — services are decoupled so they can be surfaced through additional interfaces (MCP tools, CLI) in the future without reimplementing logic
- Add shared error handler and response conventions
- Add request validation helpers and typed route utilities
- Add health/status endpoints for app, DB, engine, and scheduler status
- Establish the backend contract that later realtime and terminal features plug into without restructuring server boot code
- Defer terminal PTY transport to OpenCode's upstream PTY endpoints, integrated in U4 instead of reimplemented here

## Acceptance Criteria

- Backend routes follow one consistent registration and validation pattern
- Route errors return typed, predictable API responses
- Health endpoints expose enough information for dashboard and diagnostics use
- New features can add services and routes without restructuring server boot code
- All business logic is encapsulated in services, decoupled from transport, so additional surfaces (MCP tools, CLI) can reuse the same logic without reimplementation
- Terminal and realtime features can be added later against the shared API and service foundation without server boot rewrites

## Non-Goals

- Implementing final product screens
- Defining all business entities
- Frontend panel layout system (owned by U0 Frontend Foundation)
- Reimplementing PTY transport already provided by OpenCode
