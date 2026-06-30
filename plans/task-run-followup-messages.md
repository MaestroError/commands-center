# Task-run follow-up messages (replies + review questions)

> **Status: 🚧 In progress.** Phases 1-13 (shared schemas + DB + backend follow-up service + continuation path + backend routes + MCP/activity/API/query wiring + notification UI + task panel UI + tests) are complete.

## Goal

Add a first-class mechanism for **follow-up messages on a task run**: short operator-authored
messages that are attached to an existing run, sit in a `pending` state, and are delivered into
that run's **existing OpenCode session** the next time the run is **requeued**. This continues the
same conversation (the agent keeps all of its prior context) instead of starting a fresh run with
only a rendered history block.

This is the generic primitive. Its first three consumers:

1. **Review questions.** A specialist calling `mark_needs_human_review` may attach an optional
   **question** with **suggested replies**. The "needs review" notification then shows the question
   - suggested-reply chips + a manual reply textbox (instead of just the reason). The operator's
     chosen/typed reply becomes a follow-up message on that run, delivered only on requeue.
2. **Reply to a run** (task panel — Runs section and the run comments in the Feedback section). A
   reply is a follow-up to the **current run** (same session). It does **not** create a subtask.
3. **Feedback comment** keeps its existing behavior — it creates a **new subtask** (which becomes
   its own run on the next queue).

Both replies and feedback comments expose an optional **"Send & requeue"** button next to **"Send"**
to make it explicit that _the task must be queued for the message to actually be sent_.

## Acceptance criteria

- **Data**: a run can hold zero or more follow-up messages, each `pending` → `sent` (or `failed`),
  ordered, and queryable per run.
- **Editable while pending**: a follow-up message (reply) can be **edited or deleted while it is
  still `pending`** (not yet sent), from every surface that shows it — notification, task panel Runs
  tab, and task panel Feedback section. A `sent` message is immutable. Likewise a **feedback comment
  can be edited before its subtask has run** (no run started yet); editing updates both the feedback
  body and the derived subtask description(s).
- **Delivery semantics**: a follow-up message is never delivered at creation time. It is delivered
  only when its run is requeued; on requeue all `pending` follow-ups for that run are sent **in
  order into the run's existing OpenCode session** (same conversation/run row), the run resumes
  (status `running`, monitor restarted), and each delivered message is marked `sent`.
- **Review question**: `mark_needs_human_review` accepts optional `question` + `suggestedReplies`
  (≤ N short strings). They are persisted on the run and surfaced in the `task_needs_review` /
  `subtask_needs_review` activity payload.
- **Notification UI**:
  - question present → reason hidden in favor of: question text, suggested-reply chips (clicking
    one prefills/sends it), and a manual reply textbox.
  - question absent → reason text + a manual reply textbox (current reason display preserved).
  - primary action is **Reply & requeue** (sends the reply as a follow-up and requeues the run);
    secondary **Reply** (saves the follow-up without requeuing) and **Open task** remain.
- **Task panel**:
  - each run comment / run-history entry gets a **Reply** affordance whose submit adds a follow-up
    to _that_ run, with **Send** and **Send & requeue** buttons.
  - the Feedback composer (which creates a subtask) gets the same **Send** / **Send & requeue**
    button pair; "Send & requeue" creates the feedback subtask **and** queues the task.
- Requeueing a `review` / `ready_to_check` / `failed` task with pending follow-ups moves it back to
  the active (`queued`/running) board status, and the agent receives the operator's message(s) in
  the same chat thread.
- Backend + frontend test suites pass; `pnpm format:fix && pnpm lint && pnpm typecheck` clean.

## Key facts about the current code (confirmed)

- **Runs**: `task_runs` ([schema/tasks.ts:148](../packages/backend/src/db/schema/tasks.ts#L148))
  hold `opencode_session_id`, `status`, `needs_human_review`, `human_review_reason`, `outcome`,
  `retry_of_run_id`.
- **Conversations are keyed to a run** via `conversations.task_run_id`
  (`getTaskRunConversationRow`, [conversation-service.ts:928](../packages/backend/src/services/conversation-service.ts#L928)).
  → reusing a session under a _new_ run id would orphan the conversation, so follow-ups must reuse
  the **same run row** (this is also what "the same run" / "current run" in the request implies).
- **Sending into an existing session** already exists: `startTaskRunPrompt(conversationId, { text })`
  appends a new user turn to the run's OpenCode session and returns a fresh `baselineMessageCount`
  - `promptAcceptedAt` ([conversation-service.ts:313](../packages/backend/src/services/conversation-service.ts#L313)).
- **Requeue today** = `executionService.queue(taskId)` → `queueTask`
  ([task-execution-service.ts:308](../packages/backend/src/services/task-execution-service.ts#L308))
  → always **creates a new run** (`createId()`) with a **new session**; prior context is replayed
  only as a rendered `<history>` block ([task-run-context-service.ts:363](../packages/backend/src/services/task-run-context-service.ts#L363)).
  This stays as-is for "fresh" runs and feedback subtasks; follow-up delivery is a **new path** that
  continues an existing run.
- **`mark_needs_human_review`** ([task-run-outcome-tools.ts:96](../packages/backend/src/mcp/cc-managed/groups/cc-default/tools/task-run-outcome-tools.ts#L96))
  → `markRunNeedsHumanReview` ([task-service.ts:1665](../packages/backend/src/services/task-service.ts#L1665))
  sets `needs_human_review` + reason while the run is still `running`; the run later goes terminal
  (`completed`, `needsHumanReview=true`).
- **Activities**: `buildTerminalActivity` ([task-activity.ts:40](../packages/backend/src/services/task-activity.ts#L40))
  maps a terminal review run → `task_needs_review` / `subtask_needs_review` with `body = reason` and
  `payload = { taskId, taskRunId, subtaskId? }`. UI: `ActivityCard` renders `body` + actions;
  `ActivityActions` `task_needs_review` branch = Accept / Open task
  ([ActivityActions.tsx:105](../packages/frontend/src/components/activities/ActivityActions.tsx#L105)).
- **Feedback** `createFeedback` ([task-service.ts:815](../packages/backend/src/services/task-service.ts#L815))
  inserts `task_feedback` + one `task_subtasks` per target agent; it does **not** auto-queue. The
  subtask runs only when the task is next queued (`listRunnableSubtasks`/`manualRunnableSubtasks`,
  [task-execution-service.ts:1137](../packages/backend/src/services/task-execution-service.ts#L1137)).
  → the "Send vs Send & requeue" split maps cleanly onto "create-only" vs "create + queue".

## Design decisions

- **Follow-ups live in a new table `task_run_followups`**, not on `task_runs`, because a run can
  accumulate several and we need per-message status/ordering. One row = one operator message.
- **Follow-ups reuse the same run + same OpenCode session.** Delivery is a dedicated execution path
  (`continueRunWithFollowups`) that pushes pending messages via `startTaskRunPrompt`, resets the
  monitor metadata, flips the run back to `running`, restarts the monitor, and re-derives task
  status. We do **not** route follow-ups through `queueSingleRun` (that makes a new run/session).
- **Multiple pending follow-ups** are concatenated into a single user turn (in `created_at` order,
  separated by blank lines) for the continuation prompt, then all marked `sent`. (Simpler and
  cheaper than N sequential prompts; one operator answer is the common case anyway.)
- **Review question stored on the run** as a nullable JSON column `review_question_json`
  (`{ question: string, suggestedReplies: string[] }`). Surfaced into the activity payload so the
  notification renders without an extra fetch. `suggestedReplies` capped (e.g. ≤ 6, each ≤ 200 chars).
- **A suggested reply is just a prefilled manual reply** — selecting one fills the textbox (operator
  can edit) and/or submits; there is no separate "structured answer" type. Keeps the model trivial.
- **Reply ≠ feedback.** Reply → `task_run_followups` on the chosen run (no subtask). Feedback →
  unchanged subtask creation. Both share the Send / Send & requeue button pair.
- **"Requeue" verb**: for a run with pending follow-ups, requeue means _continue this run_. We add an
  endpoint dedicated to that so the frontend never has to guess between "new run" and "continue".

### Delivery flow (review question example)

| Step | Actor      | Effect                                                                                                                        |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | specialist | `mark_needs_human_review(reason, question?, suggestedReplies?)` → run flagged, question persisted                             |
| 2    | system     | run goes terminal → `task_needs_review` activity emitted with question + suggestedReplies in payload                          |
| 3    | operator   | notification shows question + chips + textbox; picks/edit a reply                                                             |
| 4    | operator   | **Reply & requeue** → POST follow-up (status `pending`) + POST continue-run                                                   |
| 5    | system     | continuation: send pending follow-ups into run's session, mark `sent`, run → `running`, monitor restart, task → active status |
| 6    | specialist | receives the operator's answer as the next user turn in the same chat and continues                                           |

## Implementation plan

### 1. Shared schemas — `packages/shared/src/schemas/tasks.ts`

- [x] Add `taskRunFollowupKindSchema = z.enum(["operator_reply", "review_answer"])` and
      `taskRunFollowupStatusSchema = z.enum(["pending", "sent", "failed"])`.
- [x] Add `taskRunFollowupSchema` (`id, taskId, runId, kind, status, body, createdAt, sentAt?`).
- [x] Add `createTaskRunFollowupInputSchema` (`body: z.string().trim().min(1)`,
      `kind: taskRunFollowupKindSchema.default("operator_reply")`).
- [x] Add `updateTaskRunFollowupInputSchema` (`body: z.string().trim().min(1)`) for editing a
      still-`pending` followup.
- [x] Add `updateTaskFeedbackInputSchema` (`body: z.string().trim().min(1)`) for editing a feedback
      comment before its subtask has run.
- [x] Add `reviewQuestionSchema = z.object({ question: z.string().trim().min(1),
suggestedReplies: z.array(z.string().trim().min(1).max(200)).max(6).default([]) })`.
- [x] Extend `markTaskRunNeedsReviewInputSchema`
      ([tasks.ts:368](../packages/shared/src/schemas/tasks.ts#L368)) with optional
      `question` + `suggestedReplies` (or an optional `review` object using `reviewQuestionSchema`).
- [x] Extend `taskRunSchema` ([tasks.ts:~510-530](../packages/shared/src/schemas/tasks.ts#L510))
      with optional `reviewQuestion: reviewQuestionSchema.optional()` and (optional)
      `pendingFollowupCount: z.number().int().nonnegative().default(0)`.
- [x] Export the new types alongside the existing task exports.

### 2. Shared schemas — `packages/shared/src/schemas/activities.ts`

- [x] Document/extend the `task_needs_review` & `subtask_needs_review` payload to optionally carry
      `question: string` and `suggestedReplies: string[]` (payload is `z.record` so no breaking change;
      add a typed helper/comment for producers + consumers).

### 3. DB — migration + Drizzle schema (`packages/backend/src/db/...`)

- [x] New migration `0027_*` (via the project's drizzle workflow) adding:
  - `task_run_followups` table: `id` (pk), `task_id` (fk tasks), `run_id` (fk task_runs),
    `kind` text, `status` text, `body` text, `created_at`, `sent_at` (nullable),
    `error_message` (nullable). Indexes on `run_id`, `(run_id, status)`, `task_id`.
  - `task_runs.review_question_json` text nullable.
- [x] Mirror both in `schema/tasks.ts` (`task_run_followups` table def + new column on `task_runs`),
      export from `schema/index.ts`.

### 4. Backend service — follow-ups (new `services/task-run-followup-service.ts` or extend `task-service.ts`)

- [x] `createFollowup(runId, input)` → insert a `pending` row (validate run exists; allow on any run
      that has an `opencode_session_id`). Return the mapped followup.
- [x] `listFollowups(runId)` and `listPendingFollowups(runId)` (ordered by `created_at`).
- [x] `updateFollowup(followupId, body)` → update body **only when `status === "pending"`** (throw
      `ConflictError` otherwise). `deleteFollowup(followupId)` → hard/soft delete, also pending-only.
- [x] `markFollowupsSent(ids, sentAt)` / `markFollowupFailed(id, error)`.
- [x] `mapTaskRun` ([task-service.ts:~2260](../packages/backend/src/services/task-service.ts#L2260))
      reads `review_question_json` → `reviewQuestion`; surface `pendingFollowupCount` where runs are
      returned (or compute lazily in the route).
- [x] **Feedback edit** (`task-service.ts`): `updateFeedback(taskId, feedbackId, body)` updates
      `task_feedback.body` **and** the description of its derived `task_subtasks`, guarded so it is only
      allowed **before any subtask run has started** (no run with `subtask_id` in
      `queued`/`running`/terminal). Reuse the existing run-state helpers
      (`listRunnableSubtasks`/`hasTerminalSubtaskRun`, [task-execution-service.ts:1137](../packages/backend/src/services/task-execution-service.ts#L1137))
      or an equivalent check in `task-service`. Throw `ConflictError` once it has run.

### 5. Backend service — review question persistence (`task-service.ts`)

- [x] `markRunNeedsHumanReview` ([task-service.ts:1665](../packages/backend/src/services/task-service.ts#L1665))
      gains optional `question`/`suggestedReplies`; persist to `review_question_json` (validated via
      `reviewQuestionSchema`) alongside `needsHumanReview`/`humanReviewReason`.

### 6. Backend execution — continuation path (`services/task-execution-service.ts`)

- [x] New exported method `continueRunWithFollowups(runId)`:
  1. Load run; require `opencode_session_id` and a non-active status (`completed`/`review`/`failed`,
     i.e. not already `queued`/`running`).
  2. `listPendingFollowups(runId)`; if none, no-op/return run.
  3. Resolve the run's conversation (`getTaskRunConversationRow`); concatenate pending bodies into
     one prompt text.
  4. `tryStartQueuedRun`-style transition to `running` (reuse `setRunStatus`/`updateRun`), clearing
     `needsHumanReview`/`humanReviewReason`/`reviewQuestion`.
  5. `conversationService.startTaskRunPrompt(conversationId, { text, model: run.model })`; on success
     store fresh monitor metadata (`mergeOpencodeMonitorMetadata` with new `baselineMessageCount` /
     `promptAcceptedAt`), `markFollowupsSent`, and `monitorService.start(run.id)`.
  6. On transport error reuse the existing fallback/retry handling (`startTaskRunPromptWithRetry`,
     `queueFallbackRun`); mark followups `failed` if delivery is abandoned.
  7. Ensure **task status returns to active** — add/confirm a helper that moves the task out of
     `review`/`ready_to_check`/`failed` to `queued` when a run resumes (mirror of
     `applyTaskStatusForTerminalRun`).
- [x] Reuse `scheduleAgentDrain` / monitor wiring already present.
- [x] Decide single entry point for the route: either `continueRunWithFollowups` directly, or a thin
      `requeueRun(runId)` wrapper.

### 7. Backend routes — `routes/tasks.ts`

- [x] `GET  /api/tasks/:id/runs/:runId/followups` → `listFollowups`.
- [x] `POST /api/tasks/:id/runs/:runId/followups` (body `createTaskRunFollowupInputSchema`) →
      `createFollowup` (status 201). Used by **Send**.
- [x] `PATCH  /api/tasks/:id/runs/:runId/followups/:followupId` (body
      `updateTaskRunFollowupInputSchema`) → `updateFollowup` (pending-only). Used by **edit reply**.
- [x] `DELETE /api/tasks/:id/runs/:runId/followups/:followupId` → `deleteFollowup` (pending-only).
- [x] `POST /api/tasks/:id/runs/:runId/continue` → `executionService.continueRunWithFollowups`.
      Used by **Reply & requeue** / **Send & requeue** for a run.
  - **RESOLVED**: continue is a separate endpoint (not `?requeue=true` on the POST) — client calls
    create-followup then continue.
- [x] `PATCH /api/tasks/:id/feedback/:feedbackId` (body `updateTaskFeedbackInputSchema`) →
      `updateFeedback` (before-run-only). Used by **edit feedback comment**. (Subtask-only edits can
      still use the existing `PATCH …/subtasks/:subtaskId`.)
- [x] Feedback "Send & requeue" needs no new route: client calls existing
      `POST /api/tasks/:id/feedback` then `POST /api/tasks/:id/queue`.

### 8. MCP tool — `mark_needs_human_review`

- [x] `task-run-outcome-tools.ts` ([:96](../packages/backend/src/mcp/cc-managed/groups/cc-default/tools/task-run-outcome-tools.ts#L96))
      pass `parsed.question` / `parsed.suggestedReplies` through to `markRunNeedsHumanReview`.
- [x] Update the tool description and the global-task system prompt
      ([system-prompts/definitions/global-task.ts:33](../packages/backend/src/system-prompts/definitions/global-task.ts#L33))
      to mention the optional question + suggested replies.

### 9. Backend activity payload — `services/task-activity.ts`

- [x] In the `needsReview` branches of `buildTerminalActivity`
      ([:98](../packages/backend/src/services/task-activity.ts#L98)), include `question` and
      `suggestedReplies` in `payload` when the run has a `reviewQuestion`. `body` stays the reason
      (used as fallback when no question). Extend the `TerminalRun` pick type with `reviewQuestion`.

### 10. Frontend API client + hooks (`lib/api.ts`, `hooks/use-tasks-query.ts`)

- [x] `lib/api.ts`: `listRunFollowups`, `createRunFollowup`, `updateRunFollowup`, `deleteRunFollowup`,
      `continueRun`, `updateFeedback` (and types).
- [x] `use-tasks-query.ts`: `useTaskRunFollowupsQuery`, and mutations `createRunFollowup`,
      `updateRunFollowup`, `deleteRunFollowup`, `continueRun`, `updateFeedback`; on success invalidate
      `taskRuns`, `task`, the run-followups query, `activeTaskRuns`, `taskSubtasks`,
      `task-subtask-progress` (mirror existing `queue`/`createFeedback` invalidations,
      [:330](../packages/frontend/src/hooks/use-tasks-query.ts#L330)).

### 11. Frontend — notification (`components/activities/ActivityActions.tsx`, `ActivityCard.tsx`)

- [x] New `ReviewReplyActions` for `task_needs_review` / `subtask_needs_review`:
  - read `question` + `suggestedReplies` from `activity.payload` (+ `taskId`, `taskRunId`).
  - render suggested-reply chips (click → fill textbox) + a manual reply textarea.
  - **Reply & requeue** (primary): `createRunFollowup({ body })` then `continueRun(taskId, runId)`,
    then `onArchive(activity.id)`.
  - **Reply** (secondary): `createRunFollowup` only — **RESOLVED**: leaves the activity
    action-required (still needs requeue).
  - After a reply is saved (not yet requeued), show the **pending followup(s) inline with Edit /
    Delete affordances** (`updateRunFollowup` / `deleteRunFollowup`) so the operator can revise
    before requeuing from the notification.
  - **Open task** unchanged.
- [x] `ActivityCard`: when `question` present, render the question prominently and **suppress the raw
      reason `body`** (keep `body`/reason when absent). Acceptance-criteria block behavior unchanged.
- [x] Route `subtask_needs_review` to the new actions component too (currently falls into
      `InfoActions`, [ActivityActions.tsx:27](../packages/frontend/src/components/activities/ActivityActions.tsx#L27)).

### 12. Frontend — task panel (`pages/TaskDetailPage.tsx`)

- [x] **Run comments** in `TaskFeedbackSection` ([:773](../packages/frontend/src/pages/TaskDetailPage.tsx#L773))
      and **run history rows** in the Runs section ([:327](../packages/frontend/src/pages/TaskDetailPage.tsx#L327)):
      add a **Reply** affordance that opens a small composer bound to that `run.id`, with **Send**
      (`createRunFollowup`) and **Send & requeue** (`createRunFollowup` + `continueRun`).
  - List the run's pending follow-ups (via `useTaskRunFollowupsQuery`) each with inline **Edit /
    Delete** (`updateRunFollowup` / `deleteRunFollowup`); `sent` followups render read-only.
- [x] **Feedback composer** `TaskFeedbackSection` form ([:707](../packages/frontend/src/pages/TaskDetailPage.tsx#L707)):
      replace the single "Add feedback" button with **Send** (current `onSubmit`) and **Send & requeue**
      (`onSubmit` then `queue` mutation on the task). Keep the "creates a subtask" helper text.
  - Each existing feedback comment ([:743](../packages/frontend/src/pages/TaskDetailPage.tsx#L743))
    gets an **Edit** affordance (`updateFeedback`) shown only while it has not yet run; hide/disable
    once the subtask is queued/running/terminal (derive from `entry.subtasks` status +
    `props.parentRuns`).
- [x] Add a tiny shared `SendButtons` helper (Send / Send & requeue) reused by replies + feedback for
      consistent labels and disabled/pending states.

### 13. Tests

- [x] **Backend**
  - `task-run-followup-service`: create/list/markSent/markFailed; ordering; `updateFollowup` and
    `deleteFollowup` succeed while `pending` and `ConflictError` once `sent`.
  - `updateFeedback`: edits body + subtask description before run; `ConflictError` after the subtask
    has run.
  - `markRunNeedsHumanReview` persists/validates question + suggestedReplies; rejects > cap.
  - `continueRunWithFollowups`: pending followups → single prompt into existing session, marked
    `sent`, run → `running`, monitor started, task status leaves `review`/`failed`/`ready_to_check`;
    no-op when no pending; error path marks `failed` and surfaces.
  - `buildTerminalActivity`: review run with question → payload carries question + suggestedReplies;
    without question → body=reason, no question payload.
  - routes: followups GET/POST/PATCH/DELETE, feedback PATCH, continue endpoint happy + 404/conflict
    paths.
- [x] **Frontend**
  - `ActivityActions`/`ActivityCard`: question renders chips + textbox and hides reason; no-question
    renders reason + textbox; Reply & requeue calls create-followup then continue then archive.
  - [x] `TaskDetailPage`: run Reply composer posts a followup to the right run; Send vs Send & requeue;
        feedback Send & requeue creates feedback then queues; **editing a pending followup** and
        **editing an un-run feedback comment** call the update mutations and the edit affordance is
        hidden once sent/run.
  - notification: editing/deleting a pending followup inline works and is gone after requeue.

### 14. Verify

- [x] `pnpm format:fix && pnpm lint && pnpm typecheck`.
- [x] Focused: backend task-service / task-execution-service / task routes / task-activity; frontend
      activities + TaskDetailPage suites.
- [ ] Manual: specialist marks needs-review with a question + 2 suggested replies → notification shows
      them → pick one → Reply & requeue → task returns to active and the agent answers in the same chat;
      separately, a Reply from the task panel Runs section continues the run; a Feedback "Send & requeue"
      runs the new subtask.

Verification notes:

- [x] `pnpm format:fix`
- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test` (first sandboxed run hit `listen EPERM 127.0.0.1`; escalated rerun passed)
- [ ] `pnpm test:e2e` (58/60 passed; repeated failures are unrelated mobile pointer-interception
      timeouts in `provider-connections.spec.ts:48` and `tasks/templates.spec.ts:61`)

## Files touched (summary)

- `packages/shared/src/schemas/tasks.ts`, `activities.ts`
- `packages/backend/src/db/migrations/0027_*`, `db/schema/tasks.ts`, `db/schema/index.ts`
- `packages/backend/src/services/task-service.ts` (+ new `task-run-followup-service.ts`),
  `task-execution-service.ts`, `task-activity.ts`
- `packages/backend/src/routes/tasks.ts`
- `packages/backend/src/mcp/cc-managed/groups/cc-default/tools/task-run-outcome-tools.ts`,
  `system-prompts/definitions/global-task.ts`
- `packages/frontend/src/lib/api.ts`, `hooks/use-tasks-query.ts`,
  `components/activities/ActivityActions.tsx`, `ActivityCard.tsx`, `pages/TaskDetailPage.tsx`
- Tests alongside each.

## Open questions for review

1. **RESOLVED — Continue endpoint shape**: a **separate** `POST …/continue` drains all pending
   followups; `POST …/followups` only saves (pending). The notification, run replies, and feedback
   all share the one "continue/queue" verb.
2. **RESOLVED — Lost OpenCode session**: when the run's session is archived/evicted, **fall back to a
   fresh run** (current `queue` behavior) and inject the pending followups into the rendered
   prompt/history so the message is never lost (rather than erroring).
3. **RESOLVED — "Reply" (no requeue) on a notification**: saving a reply without requeue **leaves the
   activity action-required** as a reminder that it still needs requeuing to be delivered.
4. **Multiple pending followups** — concatenate into a single user turn (proposed) vs. send each as
   its own sequential turn? Concatenation is simpler; sequential preserves authoring boundaries.
5. **Should `failed` runs accept follow-ups/continue?** Proposed yes (continue reuses the session for
   a recovery turn). Confirm we don't want `failed` restricted to a fresh retry only.
6. **Suggested-reply cap / length** — proposed ≤ 6 replies, ≤ 200 chars each, question required when
   `suggestedReplies` is non-empty. OK?

## PR Review Follow-Up 2026-06-30

- [x] Add explicit Drizzle `.run()` calls when reactivating a run and task for follow-up continuation.
- [x] Guard `markFollowupFailed` so only pending follow-ups can transition to failed.
- [x] Disable the run reply panel composer/actions when a run has no recorded OpenCode session.
- [x] Add focused tests for the guarded failure transition and no-session reply panel state.
- [x] Re-run lint, typecheck, and tests before resolving the new review threads.

## PR Review Follow-Up 2026-06-30 Running-Agent Guard

- [x] Guard follow-up continuation when the same agent already has another running run.
- [x] Translate a race-time running-run SQLite unique constraint into `ConflictError`.
- [x] Add a focused regression test and rerun checks before resolving the linked thread.

## CI Coverage Follow-Up 2026-06-30

- [x] Wait for task-run inspection messages in async prompt tests before asserting conversation details.
- [x] Run focused backend test and backend coverage before pushing the CI fix.

## PR Review Follow-Up 2026-06-30 Lazy Followups

- [x] Return `409 Conflict` consistently when continuing a run without an OpenCode session.
- [x] Preserve blocking `runId` details when the running-run SQLite constraint fires during continuation.
- [x] Lazy-load run follow-ups in the task detail reply panel unless the composer is open or pending replies exist.
- [x] Add focused backend/frontend regression tests and rerun checks.

## PR Review Follow-Up 2026-06-30 Scoped Followups

- [x] Restrict follow-up continuation to `completed`, `failed`, and `error` runs.
- [x] Scope follow-up update/delete service methods by `runId` and remove route-side list checks.
- [x] Add focused service/route regression tests and rerun checks.
