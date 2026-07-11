# Mark all notifications as read

## Scope and decisions

- In CommandsCenter, notifications are durable activity-inbox cards. A card is
  “read” when its status becomes `archived`, and it then appears in the
  **Resolved** tab.
- Add **Mark all as read** wherever pending activity cards are shown: the
  dashboard’s **Unreads** tab and the header activity dropdown.
- The action affects every pending activity, including `action_required`
  cards, so the confirmation must clearly state that they will leave the
  inbox and move to Resolved. It does not delete activity history.
- The control is hidden/disabled when there are no applicable pending cards.
  Confirmation cancellation makes no request.
- Accepting a task from the task board must also resolve that task's pending
  `task_completed` activity. This must happen on the backend, rather than only
  in the activity-card UI, so every task-accept entry point has the same result.

## Todo plan

### Confirmation dialog viewport fix

- [x] Render the shared `ConfirmDialog` through a document-body portal so
      dropdown overflow and stacking contexts cannot clip or offset the modal.
- [x] Add a focused regression test that renders the dialog inside a clipped
      ancestor and verifies the modal is mounted outside that ancestor.
- [x] Run ESLint with fixes, the relevant frontend tests, typecheck, and the
      complete test suite before publishing.

### Portaled confirmation interaction fix

- [x] Reproduce the dropdown flow with the browser-like `mousedown` followed
      by `click`, proving the outside-click listener cannot unmount the dialog
      before confirmation runs.
- [x] Contain mouse events inside the shared confirmation modal while
      preserving backdrop-click cancellation.
- [x] Rerun ESLint, typecheck, focused interaction tests, and the full test
      suite.

- [x] Add a bulk-archive API contract in `@cc/shared`: a small response schema
      containing the number of archived activities, exported through the existing
      schema public API.
- [x] Add `ActivityService.archiveAllPending()` that performs one conditional
      update for `status = pending`, records one common archive/update timestamp,
      and returns the affected-row count. Preserve idempotency: a second call with
      no pending rows returns zero.
- [x] Expose `POST /api/activities/archive-all` in the activity routes with the
      new typed response. Keep the existing per-card archive route unchanged.
- [x] Add a narrowly scoped activity-service operation that resolves pending
      `task_completed` cards whose typed payload `taskId` matches an accepted task.
      It must leave notifications for other tasks, other activity kinds, and
      already-resolved history untouched; tolerate the normal no-matching-card
      case without failing task acceptance.
- [x] In `POST /api/tasks/:id/accept`, after successfully accepting the task,
      invoke that activity-service operation from the existing runtime context
      before returning the task. Keep task-state success independent from stale or
      absent notification records, and retain the existing per-notification accept
      behavior as compatible/idempotent.
- [x] Extend the frontend API wrapper and activity query hook with
      `archiveAllActivities` / `useArchiveAllActivitiesMutation`. On success,
      invalidate both pending and resolved activity query keys (rather than
      duplicating optimistic-cache logic) so the dashboard list, dropdown, badge,
      and history agree with the server.
- [x] Extract or add one small reusable bulk-action UI component/state owner
      that uses the existing themed `ConfirmDialog`. It will show a confirmation
      such as “Mark all notifications as read?” and explain that all pending items,
      including items needing attention, move to Resolved. Its confirm control is
      disabled while the mutation is in flight.
- [x] Place that control in `ActivityThread` above the dashboard’s pending-card
      list, passing the pending count and keeping the empty state unchanged.
- [x] Place the same control in the `ActivityBell` dropdown header for its
      pending notification scope, preserving the existing View all link, popover
      close behavior, and compact card rendering. Confirming from either location
      uses the same mutation and refreshes both views.
- [x] Update the task-accept mutation's success path to invalidate the pending
      and resolved activity queries in addition to task queries. This removes the
      completion card and updates the header badge immediately after accepting via
      the board, without requiring the next polling interval.
- [ ] Add durable full-flow frontend coverage for the dashboard: seed pending
      activities, open **Mark all as read**, cancel once and verify every card and
      badge remain, then confirm and verify the pending list empties and the same
      cards appear in **Resolved**. Run this against the real API/database in the
      E2E suite when the existing test harness permits; otherwise add an
      integration-style component test using the real query/mutation wiring and
      explicitly record the E2E follow-up.
- [ ] Add a full-flow header-dropdown test: open the bell, confirm **Mark all
      as read**, and verify its compact cards and action-required badge disappear;
      navigate via **View all** and verify the dashboard reflects the resolved
      state. This guards synchronization between the two entry points.
- [ ] Add a board-to-notification end-to-end flow: create a task with its
      matching pending completion activity, accept it from the board, then verify
      the task is done, the notification no longer has an **Accept** action in the
      inbox/dropdown, and it is retained in Resolved. Include unrelated pending and
      already-resolved notifications to demonstrate only the matching card moves.
- [x] Add focused backend route/integration coverage for the durable contracts:
      bulk archiving mixed pending levels, preserving archived cards, idempotently
      returning zero for an empty inbox, and the typed bulk endpoint response;
      task acceptance with a matching completion card, no matching card, and other
      tasks' cards left untouched.
- [x] Add small activity-service unit tests for the regression-prone data
      selection rules: bulk updates only `pending` rows, and task-accept resolution
      matches only `task_completed` activities whose payload has the exact task ID.
      Keep UI tests focused on confirmation visibility, cancellation, busy state,
      and invoking the shared mutation rather than duplicating end-to-end behavior.
- [x] Update frontend API-wrapper tests/mocks for the new bulk endpoint and
      ensure task-accept query tests assert that both pending and resolved activity
      keys are invalidated after successful board acceptance.
- [x] Run `pnpm eslint --fix`, then `pnpm typecheck`, `pnpm test`, and the
      relevant Playwright suite (or `pnpm test:e2e` if the project command remains
      practical) before handoff; address regressions without unrelated cleanup.

## Success criteria

1. A user can confirm one action from either the dashboard or header dropdown
   to move all pending notifications to Resolved.
2. Canceling the confirmation changes nothing.
3. The unread list, dropdown content, action-required badge, and Resolved tab
   reflect the new server state after the request completes.
4. No activity is deleted, and the existing single-card “Mark read” flow still
   works.
