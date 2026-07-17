# Tab Consumer Classification

- Task: [DS-0307](../07-tabs.md)
- Status: Complete

## Migrated ordinary consumers

The shared `TabBar` remains the adapter used by ActivityPanel, API, Settings,
Tasks, task detail, task templates, task-run detail, and ordinary
WorkspaceLayout section selectors. These consumers use controlled tab IDs and
do not own close, dirty, drag, or pane lifecycle behavior.

The adapter now composes CC-owned Radix Tabs with horizontal automatic
activation. Arrow keys and Home/End move focus and request the corresponding
controlled value. Existing `tabs`, `activeTabId`, `onTabChange`, icons,
icon-only accessible names, test IDs, and horizontal overflow remain supported.
Optional `panelId` and `triggerId` fields allow accurate external panel
relationships; absent panel IDs do not produce fabricated `aria-controls`.

## Retained domain-specific exclusions

- `components/terminal/TerminalTabBar.tsx`: terminal sessions, close actions,
  and terminal surface lifecycle.
- `components/workspace/EditorTabBar.tsx`: dirty state, close actions, pane
  movement, and editor lifecycle.
- Composer suggestions, global search, file pickers, and model selection are
  not tab consumers and remain outside this migration.
