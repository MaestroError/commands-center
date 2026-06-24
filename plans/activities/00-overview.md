# Activities (Activity Thread / Inbox) — Overview & Shared Design

A durable, owner-global **activity thread**: one place where everything the
operator should _do_ or _know_ lands as a card. Cards flow in newest-last; the
operator reads and acts (fill, accept, open, mark read), and each card is
archived once handled. Unlike the existing `live-request` mechanism — which is
**in-memory, ephemeral, per-conversation, and blocks the agent's turn** — an
activity is **persistent and asynchronous**: the producer drops it and moves on,
the operator handles it whenever.

This is the contract shared by the implementation phases:

- [`01-phase-infra.md`](01-phase-infra.md) — `activities` table, `ActivityService`,
  CRUD/count API, transport (poll first), nav bell + Dashboard thread shell,
  generic card renderer.
- [`02-phase-producers.md`](02-phase-producers.md) — emit the 6 in-scope kinds at
  their real source points; rework `add_secret` into a non-blocking
  `secret_request`.
- [`03-phase-ui.md`](03-phase-ui.md) — per-kind card renderers, actions, and the
  read/archive lifecycle.

## Why (key findings)

- `live-request-service.ts` keeps requests in a `Map`, resolves a blocking
  promise the agent's tool call awaits, times out, and is keyed per
  conversation. It is the root cause of the broken `add_secret` flow (the agent
  blocks, and applying the secret requires an engine restart that kills the very
  turn that asked). Activities decouple the ask from the agent turn.
- Event transport today is **per-conversation SSE only**
  (`routes/conversation-events.ts`); there is no app-wide stream. We start with
  polling (tasks already poll) and add a global stream later.
- The app is **single-owner** (owner-auth), so activities are simply "the
  operator's" — no per-user fan-out.
- `DashboardPage.tsx` is effectively empty — the natural home for the full
  thread.
- Run terminal state is finalized at a single hook,
  `onRunTerminal(run)` (`task-execution-service.ts`) + scheduler
  `handleRunTerminal` — the clean place to emit task/feedback activities. The
  `run` carries `subtaskId`, `outcome` (`success` | `needs_human_review` |
  `failed`), `status`, and result text.
- Feedback model: a feedback thread spawns a **subtask** (`subtask.feedbackId`),
  which spawns a run. Branching on `subtaskId`/`feedbackId` + `outcome`
  distinguishes feedback activities from plain task activities.

## In-scope activity kinds (this plan)

| kind                   | level             | trigger                                                       | card actions                       |
| ---------------------- | ----------------- | ------------------------------------------------------------- | ---------------------------------- |
| `secret_request`       | `action_required` | a specialist requests a missing secret (non-blocking)         | Fill secret (form) → set + restart |
| `task_completed`       | `action_required` | a non-feedback run finishes with outcome `success`            | Accept (move to done) · Open task  |
| `task_needs_review`    | `action_required` | a non-feedback run finishes with outcome `needs_human_review` | Accept (move to done) · Open task  |
| `feedback_resolved`    | `info`            | a **feedback** subtask run finishes `success`                 | Open task · Mark read              |
| `subtask_needs_review` | `action_required` | a **feedback** subtask run finishes `needs_human_review`      | Open task · Mark read              |
| `task_run_failed`      | `action_required` | **any** run ends `failed`/`error`                             | Open task · Mark read              |

> `task_run_approval` (Deny / Allow once / Allow) is added by
> [`../task-run-waiting-for-approval.md`](../task-run-waiting-for-approval.md) on
> top of this infrastructure; it is out of scope here.

`task_completed` should render the run's result text (markdown) on the card.
"Accept (move to done)" reuses the existing task board-status update path.

## Data model

A `activities` table (runtime/DB state — **not** a portable workspace file;
resets on DB rebuild, like conversations/runs):

```ts
activity = {
  id: string;
  kind: ActivityKind;
  level: "action_required" | "info";
  status: "pending" | "archived";
  title: string;
  body: string | null;            // markdown (e.g. task result, review reason)
  payloadJson: string | null;     // kind-specific: { secretKey } | { taskId, taskRunId, subtaskId?, feedbackId?, outcome }
  dedupeKey: string | null;       // collapse re-emits of the same source event
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
};
```

- **dedupeKey**: e.g. `task_run_failed:<runId>`, `secret_request:<key>`. Creating
  with an existing non-archived `dedupeKey` updates in place instead of adding a
  duplicate.
- **Actions are derived per-kind on the client** (a renderer registry), not
  stored — keeps the model small. Action _effects_ reuse existing endpoints
  (task status update, secret set) plus a generic archive and a dedicated
  secret-fill endpoint.

## Lifecycle

`pending` → operator acts → `archived` (terminal). The thread shows `pending`
(optionally a "recently archived" view). Auto-archive when the underlying object
makes the card moot (e.g. a `task_run_failed` whose run was deleted) — defined
per producer where cheap; otherwise the operator clears it.

## Transport

- **Phase 1: polling** via TanStack Query (interval + on focus), with an
  `unread`/action-required count for the nav badge. Simple and robust.
- **Later (out of scope):** a global SSE stream (`/api/activities/events`)
  generalizing the existing per-conversation SSE for realtime.

## UI surfaces (two-tier)

- **Nav bell + badge** (action-required count), reachable from anywhere → popover
  of recent action-required cards.
- **Dashboard thread** — the full list (gives the empty dashboard a purpose).
  Cards: kind icon, title, markdown body, timestamp, contextual actions;
  `action_required` pinned/highlighted, `info` lighter.

## Relationship to live-requests

- Keep `live-request` for the rare genuinely-synchronous chat affordance, but
  route everything async-and-operator-actionable through activities.
- **Reuse the `live-request` form schema** (`schemas/live-requests.ts`:
  fields/actions/`disabledWhen`) for the interactive `secret_request` fill card,
  rendered from the persisted activity instead of an in-memory promise.

## Auth & scope

Owner-scoped; reuse the owner-auth guard like other authenticated routes. No
specialist/agent can read or resolve activities directly — they only _produce_
them through backend services.
