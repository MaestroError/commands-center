# Domain Batch Contract (DS-0401)

- Task: [DS-0401](../01-phase-3-handoff.md)
- Phase: [Phase 4](../README.md)
- Inventory: [live-migration-inventory.md](live-migration-inventory.md)

## Primary file ownership (non-overlapping)

| Task    | Domain                 | Primary files (owner)                                                                                                      |
| ------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| DS-0402 | shell/global           | `components/shell/*`, global search/activity/profile chrome                                                                |
| DS-0403 | specialists            | `components/specialists/*`, specialist pages                                                                               |
| DS-0404 | task authoring         | `components/tasks/TaskPromptComposer`, task/template forms, `components/tasks/task-ui`                                     |
| DS-0405 | task operations        | `pages/tasks/TaskBoard`, `pages/TaskDetailPage`, run/detail cards                                                          |
| DS-0406 | integrations/providers | `pages/IntegrationsPage`, `pages/integrations/*`                                                                           |
| DS-0407 | settings/API/tools     | `pages/SettingsPage`, `pages/CustomToolsPage`, API/token/tool controls                                                     |
| DS-0408 | chat/media             | `components/chat/*` (chrome only; protected/composer surfaces excluded)                                                    |
| DS-0409 | workspace/docs/files   | `components/layout/WorkspaceLayout`, `components/workspace/*`, `pages/file-manager/*`, `pages/FileManagerPage`, doc chrome |

## Shared-helper sequencing

- `pages/tasks/task-helpers.ts` and `components/tasks/task-ui.tsx` are shared by
  DS-0404 and DS-0405 → DS-0405 is blocked by DS-0404 (as sequenced in the phase
  README). Whichever task first touches the shared helper owns its token
  decision; the other consumes it.
- `integration-helpers.ts` is owned by DS-0406 exclusively.
- All other files have single-task ownership, so DS-0403/0404/0406/0407/0408/0409
  may run in parallel after DS-0401.

## Critical user flows to preserve (per task)

- DS-0402: Light/Dark/System selection + persistence, global search, activity,
  profile menu, navigation, engine status, narrow-header layout, shortcuts.
- DS-0403: specialist create/edit/validation, avatar controls.
- DS-0404/0405: task/template authoring, board drag/status, run detail.
- DS-0406: connection dialogs, provider/integration cards, brand artwork.
- DS-0407: dense settings forms, token/tool controls, API tri-state.
- DS-0408: chat chrome/actions without touching Markdown or composer suggestion
  behavior.
- DS-0409: workspace/document/file chrome up to the Phase 5 bridge boundary.

## Support-primitive rule

A domain batch may add a `components/ui` primitive only for a concrete consumer
in that batch (e.g., DropdownMenu/Tooltip for DS-0402 ThemeMenu/icon actions),
with focused tests and gallery coverage, and must keep Radix/`cmdk` imports
inside `components/ui/`.

## Color-token policy (approved 2026-07-18)

For raw palette values carrying status or category meaning:

- **Status roles** (e.g. running/queued/failed/done, healthy/degraded) reuse the
  existing semantic state tokens — `success`, `warning`, `danger`, `accent`, and
  the information role — rather than introducing new tokens.
- **Genuinely brand/category-specific colors** (per-provider artwork, product
  category identity that is not a state) are registered as exceptions and left as
  raw values, not tokenized.
- A new named token is added only when a status role has no existing home.

This keeps the token set lean while still theming every status color. Category
maps in `task-helpers.ts` and `integration-helpers.ts` are classified against
this policy by their owning tasks (DS-0404/0405, DS-0406) before any change.

## No-business-refactor rule

Visual migration must not change API calls, query keys, mutations, navigation,
persistence, or business logic. Domain state ownership stays in the domain layer.

## Execution order

DS-0401 → DS-0402 first (frames every domain) → DS-0403/0404/0406/0407/0408/0409
in parallel by ownership → DS-0405 after DS-0404 → DS-0410 ratchet → DS-0411
baselines → DS-0412 sign-off.
