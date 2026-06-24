# Phase 3 — UI: per-kind cards, actions, and lifecycle

Give each of the 6 kinds a real card renderer with the right actions, wired to
existing endpoints + the generic archive (and the Phase 2 secret-fill endpoint).
Depends on Phases 1–2. Read [`00-overview.md`](00-overview.md).

## Renderer registry

Extend the `kind → { icon, renderActions, accent }` registry from Phase 1
(`components/activities/`). Each `renderActions(activity)` returns the card's
buttons; handlers call the appropriate API and then archive the activity
(optimistically removing it from the thread + decrementing the badge). Action
buttons disable while in flight.

## Per-kind cards

- [ ] **`secret_request`** (action_required): shows the requested key + reason.
      Primary action **Fill secret** opens a small form (reuse the
      `live-request` field components / `password` field) collecting `value`;
      submit → `POST /api/activities/:id/fill-secret` → on success the card
      archives. Secondary **Dismiss** (archive without setting). Note in the card
      that saving restarts the AI engine.
- [ ] **`task_completed`** (action_required): renders the result `body` as
      markdown (reuse the chat `Markdown` component). Actions: **Accept (move to
      done)** → existing task board-status update to done, then archive;
      **Open task** → navigate to the task detail route (no archive).
- [ ] **`task_needs_review`** (action_required): shows the review reason. Actions:
      **Accept (move to done)** (same as above) · **Open task**.
- [ ] **`feedback_resolved`** (info): "Feedback addressed on <task>". Actions:
      **Open task** · **Mark read** (archive).
- [ ] **`subtask_needs_review`** (action_required): shows the subtask/feedback
      reason. Actions: **Open task** (deep-link to the task/feedback) · **Mark
      read**.
- [ ] **`task_run_failed`** (action_required): shows the failure reason. Actions:
      **Open task** · **Mark read**. (A **Retry** action can be added later if we
      expose a re-queue endpoint; out of scope now.)

## Shared behaviors

- [ ] "Open task" / deep links reuse the existing task detail route
      (`TaskDetailPage`); navigating does not archive (the card stays until the
      operator accepts/marks read), so the operator keeps the to-do.
- [ ] "Accept (move to done)" uses the existing task status mutation; surface
      errors inline and keep the card if it fails.
- [ ] Markdown bodies use the existing `Markdown` renderer; clamp height with a
      "show more" for long results.
- [ ] Nav-bell popover reuses the same cards (compact variant) for
      `action_required` items; full thread on the Dashboard shows all `pending`.

## Tests

- Each renderer: shows expected content + actions for its kind.
- `secret_request`: fill form submits to `fill-secret` and archives on success.
- `task_completed` / `task_needs_review`: **Accept** calls the task status
  mutation then archives; **Open task** navigates without archiving.
- `task_run_failed` / `feedback_resolved` / `subtask_needs_review`: **Mark read**
  archives; **Open task** navigates.
- Optimistic archive removes the card and updates the badge; rollback on error.

## Exit criteria

- All 6 kinds render with correct actions and wire to real effects.
- Filling a `secret_request` from the thread sets the secret + restarts the
  engine + clears the card; accepting a `task_completed` moves the task to done
  and clears the card; failures/feedback/review cards open the task or mark read.
- Lint, typecheck, frontend tests green.
