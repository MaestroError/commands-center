# Epic 09 — Public Task API (Direct Tasks: Create, Trigger, Schedule, Inspect)

> **Status:** ✅ Done — all 4 stories implemented and verified end-to-end (created a `tasks`-scoped token via UI, then via curl: discovered agents, created a task, listed by status, triggered a run to completion tagged `api`, scheduled/past-runAt-400, expanded runs+feedback, 404s). Backend/shared/frontend typecheck, lint, and tests green.

## Overview

Extend the public API from [Epic 08](./08-public-task-api.md) beyond _templates_ to operate on **tasks** directly. External systems and AI agents can:

- **Create a task** directly (not only from a template).
- **Trigger** a created task (run it now) or **schedule** it for a future time.
- **Inspect a task** in full — its data, its runs, and the feedback threads on it.
- **List tasks by board status** — backlog, queued, ready-to-check, and review.

All new endpoints live under the same `/api/public/v1/` namespace, use the same bearer-token auth from [Epic 07](./07-api-token-management.md), and are documented in the **Endpoints** tab of the API page introduced in Epic 08.

> **Depends on Epics 07 and 08.** This epic reuses the bearer-auth gate (07), the public-API service/route scaffolding, the shared docs generator, and the Endpoints tab (08). It adds task-level operations alongside the existing template-level ones.

---

## How this maps onto existing internals

As with Epic 08, the public task endpoints are a **thin projection** over services and routes the UI already uses — no new task logic. Grounding references (all in `packages/backend`):

| Public capability     | Existing internal                                                                 | Reference                                                   |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Create a task         | `taskService.create(input)` ← `createTaskInputSchema`                             | `routes/tasks.ts:309`                                       |
| Trigger (run now)     | `taskExecutionService.queue(taskId, { triggerSource: "api", metadata })`          | `routes/tasks.ts:691`                                       |
| Schedule / reschedule | `taskService.update(id, { scheduledAt })` → scheduler reconciles `scheduled_at`   | `routes/tasks.ts:346`, `services/task-scheduler-service.ts` |
| Get a task            | `taskService.get(id)`                                                             | `routes/tasks.ts:325`                                       |
| List by status        | `taskService.list({ status, agentId, includeArchived })` ← `listTasksQuerySchema` | `routes/tasks.ts:133`                                       |
| List runs             | `taskService.listRuns(id, { status, triggerSource })` ← `listTaskRunsQuerySchema` | `routes/tasks.ts:663`                                       |
| Get a run             | `taskService.getRun(taskId, runId)`                                               | `routes/tasks.ts:705`                                       |
| List feedback         | `taskService.listFeedback(id)` → `taskFeedbackThreadSchema`                       | `routes/tasks.ts:493`                                       |

The board statuses the user asked for are already first-class values of `taskStatusSchema`: `backlog | scheduled | queued | ready_to_check | review | done | archived`. `listTasksQuerySchema` already accepts a `status` filter, so listing "backlog tasks" / "queued tasks" / "tasks in review" / "ready-to-check tasks" is a single endpoint with a `status` query parameter.

---

## Scope & security model (applies to all task endpoints)

**Every endpoint in this epic requires the `tasks` token scope** (defined in [Epic 07 — Token permissions](./07-api-token-management.md#token-permissions-scopes)). The `tasks` scope deliberately does **not** include the template _action_ endpoints from Epic 08 (those need `templates`); it does include the shared `GET /api/public/v1/task-templates` discovery endpoint, so a `tasks`-only token can still resolve template IDs to filter by. A token holder must hold `tasks` (or the UI **Board** convenience, which grants both scopes) to use any of the below.

Within that scope, a token is **owner-equivalent** for the task domain: it can create tasks against any agent, trigger/schedule runs, and read all task data, runs, and feedback in the workspace — the same power the UI owner has. This is intentional for a single-owner workspace, but it means:

- Tokens must be treated as high-privilege secrets (reinforce the one-time-reveal + revoke story from Epic 07 in the docs).
- **Read scope is workspace-wide and unified with Epic 08.** Public read endpoints expose all non-archived tasks/runs/feedback regardless of origin — necessary because "list backlog/review tasks" inherently includes tasks the UI created. Epic 08's run-status handler has been aligned to match (the earlier api-origin-only restriction is dropped). The single consistent rule across both epics: **a correctly-scoped token reads everything non-archived; origin is irrelevant.**
- **Artifacts are not part of this public API scope.** Public task/run/feedback projections must not expose artifact arrays, local paths, storage keys, or generated file download URLs. Safe public artifact sharing is handled separately in [Epic 10](./10-task-artifact-sharing.md).

If finer (per-agent / per-template) scoping is later desired, it belongs in a dedicated scopes follow-on (see Open Decisions).

---

## Public API surface (new endpoints)

All endpoints are prefixed `/api/public/v1/`, require `Authorization: Bearer cc_…`, return JSON, and use `{ "error": string }` for failures.

### Mutations

#### `POST /api/public/v1/tasks` — create a task

Body (public subset of `createTaskInputSchema`):

```json
{
  "agentId": "01J…",
  "title": "Audit the staging logs",
  "description": "Look for 5xx spikes in the last 24h.",
  "todos": [{ "content": "Pull logs" }, { "content": "Summarise anomalies" }],
  "context": { "text": "Staging only." },
  "attachments": [
    {
      "filename": "spec.md",
      "mimeType": "text/markdown",
      "dataUrl": "data:text/markdown;base64,…",
      "sizeBytes": 1024
    }
  ],
  "scheduledAt": "2026-06-10T09:00:00Z",
  "dueAt": "2026-06-11T17:00:00Z"
}
```

- `agentId` and `title` are required; everything else optional.
- Providing `scheduledAt` creates the task in the `scheduled` state and the existing scheduler runs it at that time. Omitting it leaves the task idle until explicitly triggered.
- `attachments` reuse the Epic 08 base64 `dataUrl` shape and the same `storeForTask` path (see [Epic 08 attachment-transport rationale](./08-public-task-api.md#rest-conventions--attachment-transport)).

**Response `201`:** public task projection (see below).

#### `POST /api/public/v1/tasks/:id/trigger` — run now

Body: `{ "metadata"?: object }`. Wraps `executionService.queue(id, { triggerSource: "api", metadata })`.

**Response `200`:** `{ "taskId", "runId", "status" }`.

#### `POST /api/public/v1/tasks/:id/schedule` — schedule / reschedule

Body: `{ "runAt": "2026-06-10T09:00:00Z", "timezone"?: "Europe/Berlin" }`. Wraps `taskService.update(id, { scheduledAt: runAt })`; the scheduler reconciles. Sending `"runAt": null` (or a dedicated unschedule semantics) clears the schedule.

**Response `200`:** public task projection.

### Reads

#### `GET /api/public/v1/tasks?status=backlog|queued|ready_to_check|review` — list by status

Query params: `status` (one of the board statuses), optional `agentId`, optional `templateId`. Returns the public task projection array. The four statuses the user requested map directly:

| Want                 | Query                    |
| -------------------- | ------------------------ |
| Backlog tasks        | `?status=backlog`        |
| Queued tasks         | `?status=queued`         |
| Ready-to-check tasks | `?status=ready_to_check` |
| Tasks in review      | `?status=review`         |

**Filter by template** — `?templateId=<id>` returns only tasks generated from that template (matched on the task's `sourceTemplateId`). Combine with `status` to answer e.g. "queued tasks from the weekly-report template" (`?templateId=01J…&status=queued`). The internal `listTasksQuerySchema` doesn't yet carry `sourceTemplateId`, so either extend it (preferred — keeps filtering in SQL) or filter in the public service layer. Template IDs are discovered via the shared `GET /api/public/v1/task-templates` endpoint (see below).

#### `GET /api/public/v1/tasks/:id` — task data

Returns the public task projection. Optional `?expand=runs,feedback` to embed the run list and feedback threads in one call (convenience for agents that want a single fetch).

#### `GET /api/public/v1/tasks/:id/runs` — list runs

Query: `status`, `triggerSource` (both optional, from `listTaskRunsQuerySchema`). Returns public run projections.

#### `GET /api/public/v1/tasks/:id/runs/:runId` — run detail

Returns a single public run projection. `404` if not found.

#### `GET /api/public/v1/tasks/:id/feedback` — feedback threads

Returns public feedback-thread projections, including their subtasks and per-subtask run replies.

#### `GET /api/public/v1/agents` — list agents _(discovery enabler)_

A minimal `{ id, name, slug }` list so a consumer can discover a valid `agentId` to create a task with. Without this, `POST /tasks` is unusable by an external caller who only holds a token (the public template summaries deliberately hide agent IDs). Available to the `tasks` scope. See Open Decision #1.

#### `GET /api/public/v1/task-templates` — list templates _(shared discovery enabler)_

The same `{ id, title, description }` summary endpoint defined in Epic 08, **reused here** for template-id discovery. A `tasks`-scoped consumer calls it to learn template IDs, then filters the task list with `?templateId=…` to inspect "only tasks related to some template". This endpoint is the one public path readable with **either** the `templates` or `tasks` scope (see [Epic 07 permissions](./07-api-token-management.md#token-permissions-scopes)); it is not re-implemented, only granted to both scopes.

---

## Public projections (no internal leakage)

The internal `taskRunSchema` and `taskFeedbackThreadSchema` carry engine-internal fields (`renderedPrompt`, `renderedContext`, `effectivePermissions`, `opencodeSessionId`, `triggerMetadata`). The public projections **omit** these and expose only consumer-relevant fields:

- **Public task**: `id, title, description, status, agentId, todos, scheduledAt, dueAt, doneAt, latestRunId, latestFinalMessage, sourceTemplateId, createdAt, updatedAt` (no `permissionProfile`).
- **Public run**: `id, taskId, status, triggerSource, outcome, finalMessage, resultText, needsHumanReview, humanReviewReason, errorMessage, startedAt, completedAt, cancelledAt, createdAt` (no `artifacts`, no local paths, no storage keys, no file download URLs).
- **Public feedback thread**: `id, taskId, body, createdAt, subtasks[]` where each subtask exposes `id, description, status` and its `latestRun`/`replies` use the **public run** projection.

---

## Stories

---

### Story 1 — Shared schemas & projections for public tasks

**File:** `packages/shared/src/schemas/public-api.ts` _(extend Epic 08's file)_

Add: `publicCreateTaskBodySchema` (public subset of `createTaskInputSchema` + base64 `attachments`), `publicTriggerTaskBodySchema` (`{ metadata? }`), `publicScheduleTaskBodySchema` (`{ runAt, timezone? }`), `publicTaskSchema`, `publicTaskRunSchema`, `publicFeedbackThreadSchema`, `publicAgentSummarySchema`, and `listPublicTasksQuerySchema` (`{ status?, agentId?, templateId? }`).

**Acceptance criteria:**

- Public schemas omit every internal-only field listed above.
- Public schemas omit all artifact fields and any local path / storage-key fields. A task token can read run status and result text, but cannot discover filesystem locations.
- `publicCreateTaskBodySchema` requires `agentId` + `title`; reuses `uploadTaskContextAttachmentInputSchema` for attachments.
- `status` query is validated against `taskStatusSchema`; `templateId` is an optional task-source-template filter.

---

### Story 2 — Backend: extend the public task API service

**File:** `packages/backend/src/services/public-task-api-service.ts` _(extend Epic 08's service)_

Add methods, each delegating to an existing service (no new task logic):

| Method                   | Delegates to                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `createTask(body)`       | `taskService.create` → store attachments via `taskContextAttachmentService` → return public task                       |
| `triggerTask(id, body)`  | `taskExecutionService.queue(id, { triggerSource: "api", metadata })`                                                   |
| `scheduleTask(id, body)` | `taskService.update(id, { scheduledAt: runAt })`                                                                       |
| `listTasks(query)`       | `taskService.list({ status, agentId, includeArchived: false })` → filter by `templateId` (on `sourceTemplateId`) → map |
| `getTask(id, expand)`    | `taskService.get` (+ `listRuns` / `listFeedback` when expanded) → map                                                  |
| `listRuns(id, query)`    | `taskService.listRuns` → map                                                                                           |
| `getRun(id, runId)`      | `taskService.getRun` → map                                                                                             |
| `listFeedback(id)`       | `taskService.listFeedback` → map                                                                                       |
| `listAgents()`           | agent service list → `{ id, name, slug }`                                                                              |
| `listTemplates()`        | `taskService.listTemplates()` → `{ id, title, description }` (shared with Epic 08; granted to `tasks` scope too)       |

Attachment handling on create reuses the **same shared trigger/attachment helper** mandated in Epic 08 Story 2 — do not add a second attachment code path.

**Acceptance criteria:**

- Every method returns a public projection; no internal field leaks.
- Public run and feedback projections omit artifacts and never expose local artifact paths, even when the internal run has artifacts.
- API-created tasks and runs are tagged `triggerSource: "api"`.
- Create-with-`scheduledAt` results in a `scheduled` task and does not queue a run synchronously.

---

### Story 3 — Backend: public task routes

**Files:** `packages/backend/src/routes/public-api.ts` _(extend)_, register in `routes/index.ts`.

Register the task endpoints above under `/api/public/v1/`, typed with the Story 1 schemas. They inherit the `/api/public/` bearer gate **and per-route scope enforcement** from Epic 07 Story 4 — declare every endpoint in this epic as requiring the **`tasks`** scope, except the shared `GET /api/public/v1/task-templates` discovery path, which is registered as `templates`-or-`tasks`. Also confirm the Epic 08 run-status handler drops the api-origin-only filter so read scoping is consistent (per the Scope & security model note).

**Acceptance criteria:**

- All endpoints reachable only with a valid bearer token carrying the `tasks` scope (`403` otherwise; `401` for invalid/revoked).
- `status` filtering returns exactly the matching board column; archived tasks excluded.
- `?templateId=` returns only tasks whose `sourceTemplateId` matches.
- Validation/`404`/`401`/`403` behaviour matches the rest of the public API.

---

### Story 4 — Frontend: document the new endpoints in the Endpoints tab

**File:** `packages/frontend/src/components/api/EndpointsTab.tsx` _(extend Epic 08 Story 6)_

Group the Endpoints tab into sections so it stays readable as it grows:

1. **Authentication** (existing).
2. **Templates** (Epic 08 endpoints).
3. **Tasks** (this epic) — create, trigger, schedule, list-by-status, get, runs, run detail, feedback, plus the agent and template **discovery** endpoints.

Each endpoint shows method, path, body/query schema, and copyable request/response examples generated from the shared schemas + docs helper (extend `buildTemplateEndpointDocs` or add `buildTaskEndpointDocs`). The list block explicitly shows the four `status` values **and** the `?templateId=` filter for "tasks from a given template". Each section also notes the token scope it requires (`tasks`, or `templates`-or-`tasks` for the shared template discovery).

**Acceptance criteria:**

- All new task endpoints appear under a **Tasks** section with accurate, copyable examples reflecting the live origin.
- The four board-status queries and the `templateId` filter are each shown as ready-to-copy examples.
- Each documented endpoint states its required token scope.
- Examples use a `<YOUR_API_TOKEN>` placeholder (never a real token).

---

## Files changed summary

| File                                                       | Action                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/schemas/public-api.ts`                | Add task body/query/projection schemas                                                                  |
| `packages/shared/src/lib/public-api-docs.ts`               | Add task-endpoint doc snippets                                                                          |
| `packages/backend/src/services/public-task-api-service.ts` | Add task create/trigger/schedule/inspect/list + template discovery methods                              |
| `packages/shared/src/schemas/tasks.ts`                     | Extend `listTasksQuerySchema` with optional `sourceTemplateId` (preferred over service-layer filtering) |
| `packages/backend/src/routes/public-api.ts`                | Register task endpoints with `tasks` scope; confirm run-status origin filter removed                    |
| `packages/backend/src/routes/index.ts`                     | (already registers public routes)                                                                       |
| `packages/frontend/src/components/api/EndpointsTab.tsx`    | Add **Tasks** documentation section                                                                     |

---

## Open decisions

| #   | Decision             | Default in this epic                                                                                                     | Override to…                                                                |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1   | Discovery endpoints  | Include `GET /agents` (find `agentId` for create) and the shared `GET /task-templates` (find `templateId` for filtering) | Drop them and require callers to already know the IDs                       |
| 2   | Schedule mechanism   | Reuse `update(scheduledAt)` via a dedicated `/schedule` endpoint                                                         | Fold scheduling entirely into create/update and skip the dedicated endpoint |
| 3   | Read scope           | **Resolved** — workspace-wide (all non-archived tasks/runs/feedback), unified with Epic 08, gated by the `tasks` scope   | —                                                                           |
| 4   | `expand` on GET task | Support `?expand=runs,feedback` for single-fetch convenience                                                             | Require separate calls per sub-resource                                     |
| 5   | Mutating power       | Within the `tasks` scope, tokens are owner-equivalent (can run any agent)                                                | Add finer per-agent/per-template scopes in a follow-on                      |

---

## Out of scope (follow-on)

- Editing/deleting tasks via the public API (create + trigger + schedule + read only in this epic).
- Posting feedback via the API (read-only feedback here).
- Task-run artifacts, generated file downloads, local artifact paths, and public file sharing. See [Epic 10](./10-task-artifact-sharing.md).
- Finer-grained scopes (per-agent, per-template) — the coarse `templates`/`tasks` scopes ship in Epic 07.
- Webhooks on task/run state changes (polling only).
- Cursor pagination on list endpoints (add when task volumes warrant it).
