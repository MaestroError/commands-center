# Separate Human Review from System Failure (and stop the feedback re-queue loop)

> **Status: ✅ Completed.** Implemented across shared schemas, backend services/routes, and
> frontend pages, with backend (610) and frontend (849) test suites passing. Blocked
> interactions route to `review` (human-needed); system failures auto-retry up to the
> configurable `taskRunMaxAutoRetries` cap (default 10) before settling in `failed`.

## Goal

Today a task run that ends in **intentional human review** and a task run that ends in a
**system error/failure** are collapsed into a single `review` board status, and the feedback
sub-task re-queue logic treats "not successful" as "retry forever". Together these caused an
unbounded loop: a specialist that correctly finished a feedback run by calling
`mark_needs_human_review` was re-queued after every terminal run, ran again, marked review
again, and looped (observed 10+ times until cancelled manually).

We will:

1. **Separate concerns** — make _human review_ and _system error/failure_ two distinct
   statuses. Human review is set **only intentionally** (specialist via
   `mark_needs_human_review`, or the user). Error/failure is set **only by the system**.
2. **Stop the loop** — a `needs_human_review` run is terminal and is never auto-re-queued.
3. **Cap auto-retries** — any automatic re-queue chain stops after a configurable limit
   (default `10`), surfaced on the Settings page, as a defense-in-depth safety net.
4. **Add an "Accept" recommended action** in the human-review status, on both the task panel
   and the board task card.

## Root cause (confirmed)

- `getTaskStatusAfterTerminalRun` ([task-service.ts:2027](../packages/backend/src/services/task-service.ts#L2027))
  routes _both_ error/failed/cancelled runs and `needs_human_review` runs to `"review"`.
- `hasSuccessfulSubtaskRun` ([task-execution-service.ts:1477](../packages/backend/src/services/task-execution-service.ts#L1477))
  excludes `needs_human_review` (and errors) from "successful", so the subtask is always
  "retryable".
- `listRunnableSubtasks` ([task-execution-service.ts:1094](../packages/backend/src/services/task-execution-service.ts#L1094))
  falls back to "any subtask without a successful run" → a review/errored subtask is always
  runnable.
- `handleTerminalRun` ([task-execution-service.ts:1123](../packages/backend/src/services/task-execution-service.ts#L1123))
  re-queues the next runnable subtask after **every** terminal run and immediately drains it
  → self-sustaining, uncapped loop.
- Conflation also exists at the source: `finalizeBlockedInteraction`
  ([task-execution-service.ts:835](../packages/backend/src/services/task-execution-service.ts#L835))
  sets `needsHumanReview: true` on an `error` run.

## Design decisions

- **Keep `review` as the human-review status string** (no data migration for existing rows)
  and **add a new `failed` board status** for system errors/failures. `failed` already exists
  in `legacyTaskStatusSchema`, so `taskStatusSchema` already accepts it; we promote it into
  `boardTaskStatusSchema` as a real column.
- **`needsHumanReview` becomes a purely intentional signal.** The only writers are
  `markRunNeedsHumanReview` (specialist tool / user) — the system error paths must not set it.
- **Auto-retry applies only to system errors, and only up to the cap.** A `needs_human_review`
  run never auto-retries. After the cap is exhausted, the task lands in `failed` for manual
  retry. The cap reuses the existing `triggerMetadata.requeueCount` carry-forward mechanism
  already used by stall requeues (`readRequeueCount`,
  [task-execution-service.ts:879](../packages/backend/src/services/task-execution-service.ts#L879)).
- **New setting** `taskRunMaxAutoRetries` (default `10`, positive int) added to the existing
  `taskRunMonitorSettingsSchema` / Settings UI, governing all automatic subtask re-queue
  chains (feedback + stall) as a single safety net.

### Resulting status model

| Board status     | Meaning                                                 | Who sets it      | Auto-retry?    | Recommended actions                                |
| ---------------- | ------------------------------------------------------- | ---------------- | -------------- | -------------------------------------------------- |
| `queued`         | queued/running AI work                                  | system           | n/a            | View / Cancel run                                  |
| `failed` _(new)_ | run errored/failed/cancelled, or auto-retries exhausted | system only      | yes, up to cap | Retry, Edit, Preview context                       |
| `review`         | specialist/user asked for human review                  | intentional only | **never**      | **Accept**, Retry, Leave feedback, Preview context |
| `ready_to_check` | run completed successfully                              | system           | n/a            | Accept, Review                                     |
| `done`           | accepted by operator                                    | user             | n/a            | Reopen, Archive                                    |

## Implementation plan

- [x] **Shared schema: add `failed` board status + new derived status.**
  - Add `"failed"` to `boardTaskStatusSchema` ([tasks.ts:13](../packages/shared/src/schemas/tasks.ts#L13)).
  - Add `"failed"` to `taskSubtaskDerivedStatusSchema` ([tasks.ts:68](../packages/shared/src/schemas/tasks.ts#L68)).
  - Add `taskRunMaxAutoRetries: z.number().int().positive().default(10)` to
    `taskRunMonitorSettingsSchema` ([task-run-monitor.ts:16](../packages/shared/src/schemas/task-run-monitor.ts#L16)) and update its doc comment.

- [x] **Backend: stop the system from setting `needsHumanReview`.**
  - In `finalizeBlockedInteraction` ([task-execution-service.ts:831](../packages/backend/src/services/task-execution-service.ts#L831)),
    drop `needsHumanReview: true` / `humanReviewReason`; keep it an `error` run with
    `errorMessage`/`errorDetails` so it routes to `failed`.
  - Audit for any other system writer of `needsHumanReview` (grep confirms only this path and
    `markRunNeedsHumanReview`).

- [x] **Backend: split task status derivation.**
  - `getTaskStatusAfterTerminalRun` ([task-service.ts:2027](../packages/backend/src/services/task-service.ts#L2027)):
    `error/failed/cancelled` → `"failed"`; `completed` + (`outcome === "failed"`) → `"failed"`;
    `completed` + (`needsHumanReview` || `outcome === "needs_human_review"`) → `"review"`;
    `completed` + success → `"ready_to_check"`.
  - `getTaskStatusAfterTerminalSubtaskRun` ([task-service.ts:1714](../packages/backend/src/services/task-service.ts#L1714)):
    after no pending subtasks, resolve to `"failed"` if any subtask's latest run is a system
    failure, else `"review"` if any is needs_human_review, else `"ready_to_check"`.
  - Replace `hasFailedSubtaskRun` ([task-service.ts:2049](../packages/backend/src/services/task-service.ts#L2049))
    with two helpers: `hasErroredSubtaskRun` (latest run status error/failed/cancelled OR
    outcome failed) and `hasReviewSubtaskRun` (latest run needsHumanReview OR outcome
    needs_human_review). Update all callers.
  - `deriveRunSubtaskStatus` ([task-service.ts:2186](../packages/backend/src/services/task-service.ts#L2186)):
    return `"failed"` for system failures, `"review"` only for needs_human_review.
  - Update subtask progress counts ([task-service.ts:919](../packages/backend/src/services/task-service.ts#L919))
    to count `failed` alongside `review`.

- [x] **Backend: fix re-queue logic + enforce the cap.**
  - `hasSuccessfulSubtaskRun` ([task-execution-service.ts:1477](../packages/backend/src/services/task-execution-service.ts#L1477)):
    keep needs_human_review and errors out of "successful".
  - Rework `listRunnableSubtasks` ([task-execution-service.ts:1094](../packages/backend/src/services/task-execution-service.ts#L1094)):
    a subtask is runnable only if it is **unattempted**, or its **latest** run is a _system
    failure_ (not needs_human_review, not success) **and** its chain `requeueCount < cap`.
    Remove the "any subtask without a successful run" fallback so a needs_human_review subtask
    is never runnable.
  - `queueNextFeedbackSubtaskAfter` ([task-execution-service.ts:1132](../packages/backend/src/services/task-execution-service.ts#L1132)):
    only re-queue after a _system-failure_ terminal run; carry/increment
    `triggerMetadata.requeueCount`; do not re-queue when the cap is reached (task then settles
    into `failed`).
  - Read the cap via the monitor settings service (extend `resolveRequeueSettings` or add a
    sibling reader, [task-execution-service.ts:857](../packages/backend/src/services/task-execution-service.ts#L857)),
    defaulting to `10` when unavailable.

- [x] **Backend: settings route.**
  - Add `taskRunMaxAutoRetries` to the PATCH schema in
    [task-run-monitor.ts:11](../packages/backend/src/routes/task-run-monitor.ts#L11). Service
    layer needs no change (generic read/write).

- [x] **Frontend: new `failed` board column + styling.**
  - Add a `failed` entry to `BOARD_COLUMNS` ([TasksPage.tsx:116](../packages/frontend/src/pages/TasksPage.tsx#L116))
    (title "Failed", description e.g. "Runs the system stopped due to errors or exhausted
    retries.") and to `FILTER_SUGGESTIONS` ([TasksPage.tsx:159](../packages/frontend/src/pages/TasksPage.tsx#L159)).
  - Handle `failed` in `readCardClassName` ([:4252](../packages/frontend/src/pages/TasksPage.tsx#L4252)),
    `readResultClassName` ([:4397](../packages/frontend/src/pages/TasksPage.tsx#L4397)),
    `readSubtaskDotClassName` ([:4350](../packages/frontend/src/pages/TasksPage.tsx#L4350)) — distinct
    treatment from `review` (e.g. red for failed, amber for review).
  - `canDropTaskOnStatus` ([:4303](../packages/frontend/src/pages/TasksPage.tsx#L4303)) and
    `handleBoardMove` ([:516](../packages/frontend/src/pages/TasksPage.tsx#L516)): allow Accept
    (→ done) from `review` (and decide whether `failed` may be accepted — see open questions).
  - Mirror the `failed` board status in `TaskDetailPage.tsx`'s `readBoardStatus`
    ([TaskDetailPage.tsx:1446](../packages/frontend/src/pages/TaskDetailPage.tsx#L1446)).

- [x] **Frontend: Accept recommended action in human-review status.**
  - `TaskPanelPrimaryActions` `review` branch ([TasksPage.tsx:1736](../packages/frontend/src/pages/TasksPage.tsx#L1736)):
    render **Accept** (calls `onAccept`) alongside **Retry**.
  - Task card actions `review` branch ([TasksPage.tsx:1150](../packages/frontend/src/pages/TasksPage.tsx#L1150)):
    add an **Accept** icon button (Check, success variant) next to Retry.
  - Add a `failed` branch to both action renderers (Retry + Edit/Preview; no Accept by default).
  - No new API needed — `acceptTask` already sets `done` from any non-archived status
    ([task-service.ts:747](../packages/backend/src/services/task-service.ts#L747)).

- [x] **Frontend: Settings UI for the retry cap.**
  - Add a "Max automatic retries" numeric field to the task-run-monitor settings section
    ([SettingsPage.tsx:655](../packages/frontend/src/pages/SettingsPage.tsx#L655) onward):
    state, load, validate (positive int), and include in the update payload.

- [x] **Docs / prompts.**
  - Confirm specialist authoring guidance still tells agents to call
    `mark_needs_human_review` for genuine review hand-offs (unchanged), and note that the
    system no longer marks review on its own. Update any board-status docs that describe
    `review` as covering failures.

- [x] **Tests.**
  - Backend: status derivation (review vs failed vs ready_to_check) for single runs and
    subtask chains; `needs_human_review` subtask is **not** re-queued; errored subtask
    re-queues up to the cap then settles in `failed`; blocked-interaction routes to `failed`,
    not `review`; settings route accepts `taskRunMaxAutoRetries`.
  - Frontend: `failed` column renders; Accept button present in `review` (panel + card) and
    triggers accept; SettingsPage round-trips the new field.

- [x] **Verify.**
  - `pnpm format:fix`, `pnpm lint`, `pnpm typecheck`.
  - Focused backend tests for task-service, task-execution-service, task routes,
    task-run-monitor route; frontend tests for TasksPage and SettingsPage.
  - Manual: feedback → Retry → run ends in needs_human_review → task sits in **Review** (no
    second auto-run); Accept moves it to Done.

## Files touched (summary)

- `packages/shared/src/schemas/tasks.ts`, `packages/shared/src/schemas/task-run-monitor.ts`
- `packages/backend/src/services/task-service.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/routes/task-run-monitor.ts`
- `packages/frontend/src/pages/TasksPage.tsx`, `TaskDetailPage.tsx`, `SettingsPage.tsx`
- `packages/frontend/src/lib/api.ts` (only if a typed settings field needs surfacing)
- Tests alongside each.

## Open questions for review

1. **Column label/order** — call the human-review column "Review" (keep) and the new one
   "Failed"? Proposed order: `backlog → scheduled → queued → failed → review → ready_to_check
→ done`. OK, or different placement/labels?
2. **Should `failed` be acceptable?** Plan keeps Accept on `review` only; `failed` gets Retry.
   Do you want Accept on `failed` too (to dismiss a failure as done)?
3. **Blocked-interaction routing** — RESOLVED: a run "blocked by a pending OpenCode
   interaction" (the agent insisting on a denied `question`/`plan` tool, or an interaction the
   blanket auto-approve could not clear) genuinely needs a human, so it is flagged
   `needsHumanReview` and routed to `review`, not `failed`. `needsHumanReview` always wins over
   the failure classification, so it is never auto-retried (retrying would re-hit the same
   wall). Note: task runs auto-approve all permissions by default
   (`approvalPolicy: "auto_approve"`), so this path is a rare backstop, not the norm.
4. **Auto-retry on plain errors** — keep the current behavior of auto-re-queuing errored
   subtasks (now bounded by the cap), or make system errors land directly in `failed` with no
   auto-retry (cap then only guards pathological chains)? Fallback-model retry already covers
   transient model errors separately.
5. **Setting name** — `taskRunMaxAutoRetries` (default 10) added to the existing monitor
   settings group, or a separate setting/section?
