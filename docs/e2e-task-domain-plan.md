# E2E Task-Domain Coverage — Implementation Plan

Status: in progress. Covers e2e tests for the task domain (board, templates, runs,
feedback), driven by stable `data-testid` selectors, separated so the task suite can
run exclusively and in parallel with the rest of the e2e suite in CI.

## Decisions (locked)

1. **Task specs run on chromium only** — via `--project=chromium` in the task script
   (the frontend Playwright config also defines a `mobile` / Pixel 7 project, which
   continues to run for non-task specs).
2. **Drag coverage stays simple** — status transitions are covered primarily through
   the visible action buttons (Queue / Accept / Review / Reopen), with a single
   native-HTML5-DnD smoke test. No exhaustive drag matrix.
3. This plan is persisted here for review/tracking.

## Codebase realities that shape the plan

1. **Two Playwright configs exist; CI uses the frontend one.**
   - `playwright.config.ts` (root): baseURL `:5173`, boots real backend + frontend,
     chromium only. Effectively legacy — `pnpm test:e2e` does **not** use it.
   - `packages/frontend/playwright.config.ts`: baseURL `127.0.0.1:4173`, boots vite
     only (no backend), projects **chromium + mobile (Pixel 7)**.
   - `pnpm test:e2e` → `pnpm --filter @cc/frontend test:e2e` → `playwright test` from
     `packages/frontend` → uses the frontend config. All existing specs mock the API
     via `page.route` (`e2e/fixtures.ts`); no real backend is hit. New specs follow
     the same mocked pattern.
2. **The board uses native HTML5 drag-and-drop** (`draggable` + `dataTransfer` +
   `onDrop`), not dnd-kit. Playwright `locator.dragTo()` uses synthetic mouse events
   that do **not** fire native HTML5 drag events — hence a dedicated drag helper for
   the one smoke test. Columns already expose `data-board-status` / `data-drop-state`.
3. **Established `data-testid` convention:** kebab-case, domain-prefixed, dynamic IDs
   interpolated (`file-row-${path}`, `terminal-tab-${id}`), plus a `testId` prop on
   shared `LoadingState` / `ErrorState` components. New testids match this.
4. **Mobile project matters for non-task specs** (some branch on viewport width).
   Task specs sidestep this by running chromium-only.
5. **Unit coverage is already deep** (`TasksPage.test.tsx`, ~100 cases). E2E targets
   critical happy-path journeys, not every edge case.

## Part A — `data-testid` strategy & inventory

Convention: kebab-case, domain-prefixed, dynamic IDs interpolated. All additions are
purely additive (attribute only, no behavior/markup changes). Existing `aria-label`s
stay. Several elements route through ~3 shared components (`TaskCardIconButton`, the
section tab bar, `LoadingState`); adding a `testId` prop there covers many rows at once.

### A1. Board view (`TasksPage.tsx`)

| Element                                    | testid                                |
| ------------------------------------------ | ------------------------------------- |
| Board section                              | `tasks-board` (exists)                |
| View nav buttons (Board/Templates/Archive) | `task-view-tab-${view}`               |
| Filter toggle                              | `task-filter-toggle`                  |
| Filter input                               | `task-filter-input`                   |
| Column container                           | `task-column-${status}`               |
| Column count badge                         | `task-column-count-${status}`         |
| Board card                                 | `task-card-${task.id}`                |
| Card title link                            | `task-card-title-${task.id}`          |
| Card action buttons                        | `task-card-action-${slug}-${task.id}` |

### A2. Detail slide-over panel (`TasksPage.tsx`)

| Element                            | testid                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| Panel root                         | `task-detail-panel` (backdrop `task-detail-backdrop` exists)                  |
| Tabs (overview/subtasks/runs)      | `task-detail-tab-${id}`                                                       |
| Title edit / input / save / cancel | `task-title-edit`, `task-title-input`, `task-title-save`, `task-title-cancel` |
| Prompt edit / textarea / save      | `task-prompt-edit`, `task-prompt-input`, `task-prompt-save`                   |
| Footer status actions              | `task-detail-action-${slug}`                                                  |

### A3. Feedback (`TasksPage.tsx` panel + `TaskDetailPage.tsx`)

| Element                 | testid                        |
| ----------------------- | ----------------------------- |
| Feedback section        | `task-feedback-section`       |
| "Leave comment" trigger | `task-feedback-open`          |
| Composer textarea       | `task-feedback-input`         |
| Submit button           | `task-feedback-submit`        |
| Rendered comment item   | `task-feedback-comment-${id}` |

### A4. Templates view (`TasksPage.tsx`, `TaskTemplatesView`)

| Element                               | testid                               |
| ------------------------------------- | ------------------------------------ |
| Template card                         | `task-template-card-${id}`           |
| Create-task / Run-now / Edit / Delete | `task-template-action-${slug}-${id}` |
| Template edit form save               | `task-template-save`                 |

### A5. Runs / full-page detail (`TaskDetailPage.tsx`)

| Element                  | testid                                     |
| ------------------------ | ------------------------------------------ |
| Page root                | `task-detail-page`                         |
| Section tabs             | `task-detail-tab-${id}` (shared component) |
| Run-history row          | `task-run-row-${runId}`                    |
| Run inspection root      | `task-run-inspector`                       |
| Session/Details sub-tabs | `task-run-tab-${id}`                       |
| Session log container    | `task-run-session-log`                     |

## Part B — Separating task-domain specs for exclusive runs

Directory layout:

```
packages/frontend/e2e/
  fixtures.ts                  # shared base fixture
  agents.spec.ts               # non-task (unchanged)
  custom-tools.spec.ts         # non-task (unchanged)
  provider-connections.spec.ts # non-task (unchanged)
  terminal/…                   # non-task (unchanged)
  tasks/                       # task domain only
    fixtures.ts                #   task mock state + route helpers + drag helper
    board.spec.ts
    templates.spec.ts
    runs.spec.ts
    feedback.spec.ts
```

Selection mechanism — tag-based (primary), directory (organization): every task spec
wraps tests in `test.describe("…", { tag: "@tasks" }, …)`. "Everything else" is the
clean inverse, so new non-task specs are picked up automatically by the "other" job.

Scripts in `packages/frontend/package.json`:

```jsonc
"test:e2e": "playwright test",
"test:e2e:tasks": "playwright test --grep @tasks --project=chromium",
"test:e2e:other": "playwright test --grep-invert @tasks"
```

Root `package.json` pass-throughs:

```jsonc
"test:e2e:tasks": "pnpm --filter @cc/frontend test:e2e:tasks",
"test:e2e:other": "pnpm --filter @cc/frontend test:e2e:other"
```

## Part C — New spec files & scenarios

Each spec mocks the relevant `/api/tasks*` routes via a stateful `tasks/fixtures.ts`
helper (mirroring `agents.spec.ts`'s `mockAgentApi` + in-memory `state`). Selectors use
the new testids exclusively.

- **`tasks/board.spec.ts`** — columns render with correct counts; free-text + suggestion
  filters; open card → panel; inline-edit title and prompt (assert PATCH); status
  transitions via action buttons; one native-DnD smoke test via `dragCard` helper.
- **`tasks/templates.spec.ts`** — list; create-from-template / Run-now → navigation +
  POST; edit + save (PATCH); delete.
- **`tasks/runs.spec.ts`** — `/tasks/:id` overview metrics + run history; navigate to
  `/tasks/:id/runs/:runId` inspector; Session ↔ Details sub-tabs; session log renders.
- **`tasks/feedback.spec.ts`** — open composer; submit (POST `/feedback`); comment
  appears immediately; one mention flow.

Drag helper lives in `tasks/fixtures.ts`: dispatches synthetic `dragstart`/`dragover`/
`drop` with a shared `DataTransfer`. Validated with a spike before broad use; if flaky
in CI, drag coverage stays a single smoke test and button-based transitions remain
primary.

## Part D — GitHub Actions parallelization

Rewrite `.github/workflows/e2e.yml` to a matrix of two suites running in parallel with
identical setup:

```yaml
strategy:
  fail-fast: false
  matrix:
    suite: [tasks, other]
steps:
  - …setup (checkout, pnpm, node 24, install, build)…
  - run: pnpm test:e2e:${{ matrix.suite }}
  - uses: actions/upload-artifact@v4
    if: failure()
    with:
      name: playwright-report-${{ matrix.suite }}
      path: packages/frontend/playwright-report/
```

- `fail-fast: false` so one suite failing doesn't cancel the other.
- Two jobs on separate runners → true parallelism.
- Per-suite artifact names avoid collisions.
- Branch-protection note: if a required check is configured, point it at the two matrix
  legs instead of the old single `Playwright E2E` check.

### Part D — as-built

- `.github/workflows/e2e.yml` now runs a `strategy.matrix.suite: [tasks, other]` with
  `fail-fast: false`; the job name is `Playwright E2E (tasks|other)` and the run step is
  `pnpm test:e2e:${{ matrix.suite }}`. The two suites run on separate parallel runners.
- Artifacts are uploaded per suite as `playwright-report-{tasks|other}` from
  `packages/frontend/playwright-report/` on failure.
- The frontend Playwright config (`packages/frontend/playwright.config.ts`) — the one
  CI actually uses — previously had **no reporter**, so the failure artifact would have
  been empty. It now sets, under CI only: `reporter: [["html",{open:"never"}],["github"]]`,
  `retries: 2`, `forbidOnly: true`, and `trace`/`screenshot` capture. Verified the HTML
  report lands at `packages/frontend/playwright-report/` when `CI=true`.

## Rollout order

1. [x] Plan persisted (this file).
2. [x] **Part A** — add `data-testid` attributes (additive, shared components first).
3. [x] **Part B** — `e2e/tasks/` dir + scripts (tag plumbing).
4. [x] **Part C** — spec files (board, templates, runs, feedback) + fixtures + drag helper.
5. [x] **Part D** — CI workflow matrix.

## Part C — as-built spec inventory

All specs live in `packages/frontend/e2e/tasks/`, are tagged `@tasks` via
`test.describe(..., { tag: "@tasks" }, ...)`, and select elements by `data-testid`
only. 17 tests, all green on chromium; the existing 26 non-task tests remain green.

`tasks/fixtures.ts` — re-exports the base `test`/`expect`, plus:

- `createTaskState()` — fresh in-memory backend state per test (agents, catalog, tasks
  across statuses, archived task, recurring + manual templates, a completed run with
  session inspection).
- `mockTaskApi(page, state)` — one broad `**/api/tasks**` handler (branches on method +
  pathname, mutates state so re-fetches observe writes) plus agent/mcp/custom-tool/
  workspace-skill stubs.
- `dragCard(page, cardTestId, columnTestId)` — dispatches the synthetic HTML5
  `dragstart/dragenter/dragover/drop/dragend` sequence with one shared `DataTransfer`
  (Playwright's mouse `dragTo` does not trigger native HTML5 DnD).

Scenarios:

- `board.spec.ts` (7) — column counts; free-text filter; open panel + inline-edit title;
  inline-edit prompt; queue via card action; accept via card action; backlog→queued
  drag smoke (the one native-DnD test).
- `templates.spec.ts` (5) — list; create-from-template → opens generated task; run-now
  dialog → opens generated task; edit form → PATCH; delete.
- `runs.spec.ts` (3) — full-page run history; row → inspector navigation; session-log
  toggle + Session/Details sub-tab switch.
- `feedback.spec.ts` (2) — submit → comment renders; submit with `@agent` mention →
  asserts `mentionedAgentIds` in the POST body.

### Behaviours worth noting (discovered while writing specs)

- Deleting a template is issued by the UI as `DELETE /api/tasks/{templateId}` (templates
  and tasks share an id space on delete), not `/api/tasks/templates/{id}`. The card
  disappears because `deleteTask`'s `invalidateTasks()` also invalidates the templates
  query.
- New feedback appears immediately via `setQueryData` from the POST response (no
  refetch), so the mock just needs to return the created thread.
- Board drag backlog→queued and the Queue button both call `queueTask`
  (`POST /api/tasks/{id}/queue`).

## As-built testid reference (Parts A & B)

Authoritative list for spec authors. Card/template action buttons derive their testid
from the button label via the shared `TaskCardIconButton` / `TaskCardIconLink`
components, so they are **scoped within the card** (e.g.
`getByTestId('task-card-<id>').getByTestId('task-card-action-queue')`).

Board / views (`TasksPage.tsx`):

- `tasks-board`, `task-view-tab-{board|templates|archive}`
- `task-filter-toggle`, `task-filter-input`
- `task-column-{status}`, `task-column-count-{status}` (also `data-board-status`/`data-drop-state` on columns)
- `task-card-{id}`, `task-card-title-{id}`
- `task-card-action-{label-slug}` (Queue→`queue`, Accept→`accept`, Review→`review`,
  Retry→`retry`, Reopen→`reopen`, Duplicate→`duplicate`, Archive→`archive`,
  Save as template→`save-as-template`, Details→`details`, Edit→`edit`, etc.)

Detail slide-over (`TasksPage.tsx`):

- `task-detail-panel` (backdrop `task-detail-backdrop`)
- `task-detail-tab-{overview|subtasks|runs}`
- `task-title-edit`, `task-title-input`, `task-title-save`, `task-title-cancel`
- `task-prompt-edit`, `task-prompt-input`, `task-prompt-save`

Feedback (both `TasksPage.tsx` panel and `TaskDetailPage.tsx`):

- `task-feedback-section`, `task-feedback-open`, `task-feedback-input`,
  `task-feedback-submit`, `task-feedback-comment-{id}`

Templates (`TasksPage.tsx`):

- `task-template-card-{id}`, `task-template-title-{id}`
- `task-template-create-task` (list), `task-template-detail-create-task` (panel)
- `task-template-detail-panel`, `task-template-save`
- Template action icons reuse `task-card-action-*` (Run now→`run-now`,
  Edit template→`edit-template`, Delete template→`delete-template`, View details→`view-details`)

Runs / full-page detail (`TaskDetailPage.tsx`):

- `task-detail-page`, `task-detail-tab-{overview|subtasks|runs}`
- `task-run-row-{runId}`
- `task-run-inspector`, `task-run-tab-{session|details}`, `task-run-session-log`

Shared component changes:

- `TabBar` gained an optional `testIdPrefix` prop → emits `data-testid="{prefix}-{tab.id}"`.
- `TaskPromptComposer` gained an optional `testId` prop applied to its textarea.

## Deviations from the original inventory

- Card/template action testids are **label-derived and card-scoped** (no `-{taskId}`
  suffix) because they route through shared components — cleaner and lower-touch than
  threading the id through every button. Tests scope by `task-card-{id}` /
  `task-template-card-{id}`.
- Two "Create task" buttons co-render (list + open detail panel), so they use distinct
  testids: `task-template-create-task` vs `task-template-detail-create-task`.
- Extra convenience testids added beyond the original table: `task-card-title-{id}`,
  `task-template-title-{id}`, `task-template-detail-panel`.
