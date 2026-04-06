# E3 API and Realtime Foundation

## Outcome

The backend has a production-ready feature foundation: route layout, service boundaries, error handling, websocket infrastructure, and reusable API conventions.

## Why this is a separate PR

This lets all feature PRs plug into a stable backend contract instead of each feature inventing its own route and error patterns.

## Blockers

- E1 Runtime Bootstrap

## Unblocks

- U1 App Shell and Dashboard
- E4 Self-Updating and Version Management
- U4 File Manager and Terminals
- U5 Profile, Settings, and Theming
- I4 Automations

## Scope

- Establish route registration by domain
- Add shared error handler and response conventions
- Add request validation helpers and typed route utilities
- Add websocket server baseline for terminals and realtime updates
- Add PTY output flow-control buffering: batch terminal output into 16ms intervals before broadcasting over WebSocket to prevent network congestion and UI freezing during high-output operations
- Add health/status endpoints for app, DB, engine, and scheduler status
- Establish the responsive panel layout system (sidebar, context pane, bottom pane) with mobile breakpoints, touch-friendly controls, and sheet/overlay behavior for narrow viewports as described in `design/layout.md`

## Acceptance Criteria

- Backend routes follow one consistent registration and validation pattern
- Route errors return typed, predictable API responses
- Websocket infrastructure exists and can be reused by terminal features
- PTY WebSocket output is batched at 16ms intervals to prevent congestion during high-throughput terminal operations
- Health endpoints expose enough information for dashboard and diagnostics use
- New features can add services and routes without restructuring server boot code
- The responsive layout system supports desktop side-by-side panels and mobile sheet/overlay behavior with touch-friendly tabs

## Non-Goals

- Implementing final product screens
- Defining all business entities
