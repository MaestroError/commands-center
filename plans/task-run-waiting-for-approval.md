# Task Run Waiting For Approval

## Goal

Task runs should optionally support the same permission approval flow that
workspace chat already uses. By default, task runs remain fully autonomous. When
approval mode is enabled for a task or task template and a task-owned OpenCode
session asks for permission, the run **pauses in a dedicated waiting state** (so
the stall monitor does not kill it) and the operator is asked to approve through
the **activity thread** (see [`activities/00-overview.md`](activities/00-overview.md)),
not through a board badge or a per-task detail card. The operator can deny, allow
once, or allow for the current run from a single `task_run_approval` activity.

## Scope

- Reuse the existing OpenCode `permission.asked` / `permission.replied` events.
- Reuse the existing permission reply semantics: `reject`, `once`, `always`.
- Apply only to task runs and task templates via task permission configuration.
- Keep task runs fully autonomous by default; require explicit opt-in.
- Keep the `question` tool denied for task runs.
- Continue a run after approval or denial by replying to the pending OpenCode
  permission request.
- **Surface approvals as `task_run_approval` activities** (this plan depends on
  the activities feature for the surface + transport).
- **Add a waiting-for-approval run state** that exempts the run from the
  no-progress stall timeout while it waits on a human.

## Current Observations

- Chat already renders `PermissionDock` and replies through conversation routes.
- Task runs already create task-owned conversations and pass OpenCode permission
  rules into the session.
- Task effective permissions are persisted on each task run.
- Task permission rules currently force the `question` tool to `deny` and
  normalize task runs to auto-approve.
- The task-run monitor finalizes a run as **stalled** after `noProgressMs`
  (default 30 min) based on `lastProgressAtMs`
  (`services/task-run-monitor-service.ts`). A run paused on an approval makes no
  progress and would be cancelled — this is the gap the waiting state closes.
- Run state today: `taskRunStatus` ∈ queued/running/completed/failed/error/
  cancelled/skipped; the only runtime sub-state is `waiting_for_opencode`
  (`taskRunRuntimeStateSchema`).

## Implementation Plan

### Waiting-for-approval run state (stall-timeout fix)

- [ ] Add a runtime sub-state `waiting_for_approval` to
      `taskRunRuntimeStateSchema` (parallel to `waiting_for_opencode`). The run
      stays `running`; the sub-state marks it as parked on a human, and is what
      the board/activity surfaces render as "Pending approval".
  - Rationale: a runtime sub-state avoids touching the top-level run-status enum
    and all its consumers (board mapping, queries, public API). It is the
    smallest change that gives both visibility and monitor control. (Rejected
    alternative: a new top-level `pending_approval` status.)
- [ ] Enter `waiting_for_approval` when a pending permission request is captured
      for a task-owned session; clear it on `permission.replied` (back to
      `waiting_for_opencode`/normal running).
- [ ] Monitor exemption (`task-run-monitor-service.ts`):
  - While a run is in `waiting_for_approval`, **do not** trip the no-progress
    stall finalizer (skip the `noProgressMs` check, or treat the wait as
    progress by advancing `lastProgressAtMs`).
  - Decide max-lifetime handling: either also pause `maxLifetimeMs` while
    waiting, or keep the hard cap. **Recommended:** pause the no-progress timer
    but keep a (longer) absolute safety cap so an abandoned approval cannot live
    forever. Flag the exact cap for review.

### Persist pending task-run permission state

- [ ] Capture `permission.asked` for task-owned conversations; associate the
      pending request with `taskId`, `taskRunId`, `opencodeSessionId`, request
      id, permission name, patterns, metadata, created timestamp.
- [ ] Clear the pending request on `permission.replied`.
- [ ] Expose pending permission data in task/task-run read models (so the
      activity payload and any board hint can render it).

### Backend APIs for task-run approvals

- [ ] Add a task-run permission reply endpoint accepting `reject`, `once`,
      `always`; delegate to the existing OpenCode permission reply path for the
      task-owned conversation; return updated task/run state.
- [ ] On reply: clear pending state, exit `waiting_for_approval`, and resolve the
      linked `task_run_approval` activity (archive it).

### Approval via the activity thread (replaces board/detail surfacing)

- [ ] When a pending permission is captured, **emit a `task_run_approval`
      activity** (`level: action_required`) with: task title, run id,
      permission/tool name, patterns, relevant metadata, and a `dedupeKey` of the
      request id (so re-emits update in place).
- [ ] Actions on the card: **Deny**, **Allow once**, **Allow** — wired to the
      reply endpoint (`reject` / `once` / `always`). Treat `Allow` as approval
      for the current run/session (chat's `always` semantics). Disable controls
      while the reply is in flight; archive the activity on success.
- [ ] Keep denial non-terminal: on Deny, reply `reject` and let the agent
      continue from the denied tool result. Do not auto-fail/cancel/archive the
      run; let the existing completion flow decide the outcome.
- [ ] Board treatment is now **optional/secondary**: at most a subtle
      "Pending approval" hint derived from the `waiting_for_approval` sub-state.
      The primary action surface is the activity thread. (No dedicated task-detail
      approval card.)

### Task & task template configuration (opt-in)

- [ ] Add an optional "Require approval before tool actions" control on task
      create, task update/edit, task template create, and template update/edit.
- [ ] Default off (autonomous). Persist in the existing task permission profile;
      generated tasks inherit the template profile.
- [ ] Map enabled → OpenCode `ask` rules for selected tools/servers; disabled →
      current autonomous behavior. Keep task-safe CC-managed tools allowed unless
      stricter rules are configured.

### Task-run prompt updates

- [ ] Instruct task runs to continue after denied permissions when possible.
- [ ] Keep direct question asking unavailable for task runs.
- [ ] Instruct the agent to mark the run for human review when it needs
      clarification that cannot be resolved through permissions. (This lands as a
      `task_needs_review` activity via the activities feature.)

## Tests

- Backend: capture/clear pending permission requests; enter/exit
  `waiting_for_approval`; monitor does **not** stall a run while waiting for
  approval; reply endpoint maps `reject`/`once`/`always` to the OpenCode reply
  path; replying archives the `task_run_approval` activity; denial does not mark
  the run failed.
- Permission config: `ask` rules generated from the task/template opt-in.
- Frontend: `task_run_approval` activity renders Deny/Allow once/Allow and calls
  the reply endpoint; board shows only the subtle pending hint.

## Dependencies

- **Activities feature** ([`activities/00-overview.md`](activities/00-overview.md)):
  provides the durable activity store, transport, Dashboard thread + nav bell,
  and the generic card renderer. This plan adds the `task_run_approval` kind and
  its producer/reply wiring on top of that infrastructure.

## Verify

- `pnpm format:fix`, `pnpm lint`.
- Focused backend + frontend tests for task permissions, task execution, task
  routes, the run monitor, and the approval activity.
- Broader tests if shared schemas or task-run state shapes change.
