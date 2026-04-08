# U1 App Shell and Dashboard

## Outcome

The dashboard shows runtime health, recent agents, latest automation sessions, and quick actions inside the app shell established by U0.

## Why this is a separate PR

This populates the dashboard with live data and real widgets. The structural shell, navigation, layout system, and theming are already delivered by U0.

## Blockers

- U0 Frontend Foundation
- E3 API and Realtime Foundation

## Unblocks

- No hard blockers. Dashboard content is independent of other feature screens.

## Scope

- Build dashboard cards for engine health, DB health, cron health, and update status using health endpoints from E3
- Add recent agents section: list agents ordered by most recent direct-chat activity, show agent icon and name, link to agent's direct chat, include action to navigate to full agents screen, show empty state when no activity exists
- Add latest automation sessions section: list sessions ordered by most recent execution time, show automation identity, execution status, and execution time, link to the related automation, show empty state when no history exists
- Add dashboard quick actions: create agent, open automations, open file manager, open settings
- Add update state display: running version and update availability with navigation to update flow in settings
- Ensure dashboard cards stack on mobile viewports and are touch-friendly

## Acceptance Criteria

- Behavior matches `design/screens/dashboard/acceptance_criteria.md`
- The dashboard is shown as the default landing screen
- Dashboard status cards reflect backend health APIs for runtime, OpenCode engine, database mode, and automation system
- Recent agents section shows agents ordered by last direct-chat activity with links to direct chat and the full agents screen
- Latest automation sessions section shows sessions with status, execution time, and automation identity
- Quick actions include: create agent, open automations, open file manager, open settings
- Update state shows running version and update availability with navigation to update flow
- Dashboard cards stack on mobile and navigation remains touch-friendly

## Non-Goals

- App shell structure, navigation, sidebar, header (owned by U0)
- Panel layout system (owned by U0)
- Theme infrastructure (owned by U0)
- Full agent CRUD
- Full chat interactions
