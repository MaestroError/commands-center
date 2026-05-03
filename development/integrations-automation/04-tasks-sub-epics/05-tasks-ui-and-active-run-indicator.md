# I4.5 Tasks UI and Active Run Indicator

## Goal

Build the user-facing Tasks experience: navigation rename, task list, task editor, task detail, run history, run detail/session links, active runs view, and the top-header active task indicator.

## Pre-Conditions

- I4.1 Task Data Model and Service API is complete.
- I4.2 Scheduler and Execution Lifecycle is complete.
- I4.3 OpenCode Session Persistence and Continuation is complete enough to expose run/session links.
- I4.4 Task-Scoped Tool and MCP Permissions is complete enough to expose permission summaries.
- U0 Frontend Foundation is complete.

## Scope

### Navigation and Naming

- Rename user-facing **Automations** navigation/menu copy to **Tasks**.
- Use Tasks terminology in routes, page titles, empty states, buttons, and help text.
- Keep compatibility redirects only if previous `/automations` routes already shipped.

### Tasks List

- Build a responsive task list page.
- Support filtering by status, trigger mode, agent, and archived state.
- Show title, description summary, assigned agent, status, trigger mode, next run, and latest result summary.
- Provide manual trigger, enable/disable, archive/restore, and delete actions where valid.

### Task Editor and Detail

- Build create/edit task flow with title, description, context, todos, assigned agent, trigger mode, schedule, and permission profile summary.
- Build task detail showing status, next scheduled run, latest run result, todos, context, permission summary, and run history.

### Run History and Run Detail

- Show run status, trigger source, started/completed time, result summary, and error state.
- Run detail shows status timeline, rendered prompt/context, result, error details, effective permissions, and linked OpenCode session.
- Provide a continue/open chat action for valid task-created sessions.

### Active Run Indicator

- Add top-header active task indicator.
- Show count of queued/running task runs.
- Link indicator to active runs or filtered Tasks view.
- Show upgrade/shutdown/refresh-sensitive warnings when active runs exist.

### Responsive UI

- Ensure all Tasks surfaces work on mobile viewports.
- Use stacked layouts, sheets, or drawers where desktop panels do not fit.

## Out of Scope

- Backend task lifecycle behavior beyond consuming existing APIs.
- App MCP task tools (Sub-Epic I4.6).
- Kanban board task/card UX.

## Acceptance Criteria

- Sidebar/menu uses **Tasks**, not **Automations**.
- User can create, edit, view, archive, restore, delete, enable, disable, and manually trigger tasks from the UI.
- Task list supports filters for status, trigger mode, agent, and archived state.
- Task detail exposes context, todos, schedule, permission summary, latest result, and run history.
- Run detail exposes rendered prompt/context, result, errors, effective permissions, and session link.
- Active task indicator appears in the top header when queued/running runs exist.
- UI warns or blocks upgrade/shutdown/refresh-sensitive operations when active runs exist.
- All Tasks screens are usable on mobile.

## Key Files to Create/Modify

- `packages/frontend/src/pages/TasksPage.tsx`
- `packages/frontend/src/pages/TaskDetailPage.tsx`
- `packages/frontend/src/components/tasks/`
- `packages/frontend/src/hooks/` task query/mutation hooks
- `packages/frontend/src/lib/api.ts`
- `packages/frontend/src/app/` route/navigation config
- `packages/frontend/e2e/` task flow tests

## Reference

- Parent epic: `development/integrations-automation/04-automations.md`
- App shell: `packages/frontend/src/components/layout/`
- Settings page tab patterns: `packages/frontend/src/pages/SettingsPage.tsx`
