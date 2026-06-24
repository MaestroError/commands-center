# Phase 2 — Producers: emit the 6 kinds at their source

Wire `ActivityService.emit` into the real source points so the 6 in-scope kinds
appear, and rework `add_secret` into a non-blocking `secret_request`. Depends on
Phase 1. UI cards/actions for these kinds land in Phase 3 — this phase just makes
the data flow and the secret-fill effect work end to end.

Read [`00-overview.md`](00-overview.md).

## 2.1 — Task & feedback run-terminal producers

Single emit point: the run-terminal hook `onRunTerminal(run)`
(`task-execution-service.ts`, also reachable via scheduler `handleRunTerminal`).
Inject `activityService` into the execution service and branch:

- [ ] Resolve whether the run is a **feedback subtask run**: it has `subtaskId`
      and that subtask has a `feedbackId` (look up via the task service). Plain
      run = no `subtaskId`.
- [ ] Branch on `run.outcome` / terminal `status`:
  - plain run, `success` → `task_completed` (`action_required`); `body` = run
    result text (markdown); payload `{ taskId, taskRunId }`.
  - plain run, `needs_human_review` → `task_needs_review` (`action_required`);
    `body` = review reason; payload `{ taskId, taskRunId }`.
  - feedback subtask run, `success` → `feedback_resolved` (`info`); payload
    `{ taskId, taskRunId, subtaskId, feedbackId }`.
  - feedback subtask run, `needs_human_review` → `subtask_needs_review`
    (`action_required`); payload `{ taskId, taskRunId, subtaskId, feedbackId }`.
  - **any** run, terminal `failed`/`error` → `task_run_failed`
    (`action_required`); `body` = failure reason; payload `{ taskId, taskRunId, subtaskId? }`.
- [ ] `dedupeKey` per run+kind (e.g. `task_completed:<runId>`) so a re-emitted
      terminal event updates rather than duplicates.
- [ ] **Decision to confirm:** a _fresh_ (non-feedback) subtask run — `subtaskId`
      set, no `feedbackId`. Proposed: emit **no** separate activity; it rolls up
      into the parent task's `task_completed`/`task_needs_review`/`task_run_failed`
      when the parent run terminates. (Avoids a card per chained subtask.) Flag
      for review.
- [ ] `cancelled` / `skipped` runs emit nothing.

> Producers must never block the run path: emit is fire-and-forget relative to
> the agent (the run is already terminal here), and failures to emit must only be
> logged, never throw into `onRunTerminal`.

## 2.2 — `secret_request` (rework `add_secret`)

Replace the blocking interactive `cc_app_add_secret` (which opens a live request,
waits, then restarts the engine and kills its own turn) with a **non-blocking
request**:

- [ ] New cc-managed tool `request_secret` (chat context; in `cc_default` so it
      is available by default — non-interactive, quick). Input: `key` (required),
      optional `reason`/`description`. Effect: register the desired secret key as
      **unset/empty** in the secret store (so it shows as "needs a value" in
      Settings → Secrets) and `activityService.emit` a `secret_request`
      (`action_required`, payload `{ secretKey }`, dedupeKey
      `secret_request:<key>`). Returns immediately with text telling the
      specialist the operator has been asked to provide it and that it will not
      be available until then.
- [ ] **Remove** `createShowFileToUserDefinition`'s sibling interactive
      `add_secret` from `cc_app` (tool def, catalog entry, `add-secret.ts`), and
      its tests. (If we want to keep an operator-facing "add secret from chat"
      affordance, that is the Settings UI, not an agent tool.)
- [ ] Secret-fill endpoint `POST /api/activities/:id/fill-secret`
      (owner-guarded): validate the activity is a `pending` `secret_request`,
      read `{ value }` (and confirm key from payload), `secretService.set(key,
    value)`, trigger `orchestrator.restart("secret updated")` (now safe — no
      agent turn is blocked on it), then `archive` the activity. Returns the
      updated record.
  - Reuse the existing secret-set + restart semantics from the current
    `add-secret.ts` (only the _trigger_ moves from a blocking tool to an
    operator-driven endpoint).
- [ ] **Decision to confirm:** whether to actually create an empty/unset secret
      row (so it appears in Settings → Secrets as pending) or to represent the
      pending secret purely by the activity. Proposed: create the unset entry so
      both surfaces agree; needs a small "unset" concept in the secret
      schema/service if one does not exist. Flag for review.

## 2.3 — Update the global-chat system prompt

- [ ] Replace any "add a secret" guidance with: when a credential is missing,
      call `request_secret` with the key name and a clear reason; tell the
      operator it has been requested; do **not** assume the secret is available
      in the same turn (it requires the operator to provide it and an engine
      restart). (Edits `system-prompts/definitions/global-chat.ts`.)

## Files touched / added

- `services/task-execution-service.ts` (inject `activityService`; emit on
  terminal) and `start-server-runtime.ts` wiring.
- `services/secret-service.ts` (+ optional unset-secret support).
- `mcp/cc-managed/groups/cc-default/tools/request-secret.ts` _(new)_ +
  `server-registry.ts` registration; remove `cc-app/tools/add-secret.ts`.
- `routes/activities.ts` (+ `fill-secret` endpoint).
- `system-prompts/definitions/global-chat.ts`.

## Tests

- Execution service: each branch emits the right kind/level/payload from a
  terminal run (plain vs feedback subtask × success/review/failed); dedupe key
  collapses re-emits; emit failure does not break `onRunTerminal`.
- `request_secret` tool: emits `secret_request`, registers the key, returns
  non-blocking text, does not call restart.
- `fill-secret` endpoint: sets the secret, triggers restart, archives the
  activity; rejects non-`secret_request`/archived activities.
- Update/remove the `add_secret` tests and the `cc_app` catalog snapshot.

## Exit criteria

- Finishing a task run (success/review/failed) and a feedback subtask run
  (success/review) produces exactly the mapped activities.
- A specialist calling `request_secret` creates a pending `secret_request` and
  does **not** restart the engine or block; filling it from the API sets the
  secret, restarts the engine, and archives the card.
- Lint, typecheck, backend tests green.
