# U1 App Shell and Dashboard

## Outcome

The frontend has a real app shell with navigation, recent-agent entry points, and a dashboard showing runtime health and quick actions.

## Why this is a separate PR

This gives the product a usable top-level structure and makes platform health visible before the deeper workflows are complete.

## Blockers

- E3 API and Realtime Foundation

## Unblocks

- No hard blockers. This is a shared shell for later UX work.

## Scope

- Build the main layout, navigation, and routing structure using the responsive panel system established in E3
- Add dashboard cards for recent agents, recent chats, engine health, DB health, cron health, and update status
- Add latest automation sessions section showing execution status, execution time, and automation identity with links to the related automation
- Add dashboard quick actions: create agent, open automations, open file manager, open settings
- Add loading, error, and empty states for the shell
- Add shared frontend data-fetching primitives and page-level state handling
- Ensure dashboard and navigation are fully usable on mobile viewports with stacked cards and touch-friendly navigation

## Acceptance Criteria

- The app no longer renders a placeholder root screen
- The user can navigate to dashboard, agents, chat, integrations, automations, settings, and profile routes
- Dashboard status cards reflect backend health APIs
- Dashboard includes a latest automation sessions section with status, execution time, and automation identity
- Quick actions include: create agent, open automations, open file manager, and open settings
- Recent agent and recent chat entry points are visible when data exists
- Layout is responsive: dashboard cards stack on mobile, sidebar becomes an overlay, and navigation is touch-friendly

## Non-Goals

- Full agent CRUD
- Full chat interactions
