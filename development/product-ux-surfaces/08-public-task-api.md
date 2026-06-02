# Epic 08 — Public Task API (Trigger & Schedule Task Templates)

## Overview

Expose **task templates** as triggerable units over a public, bearer-authenticated HTTP API. External systems and AI agents can:

- **Trigger a template now** — run it immediately.
- **Schedule a template** — run it once at a future time.
- **Send context** — text, file attachments, or both, passed into the run.
- **Poll a run** — check status/outcome of a triggered run.

The API lives under the `/api/public/v1/` namespace reserved in [Epic 07](./07-api-token-management.md) and is authenticated exclusively with the bearer tokens that epic introduced. No session cookie, no CSRF.

On the UX side, this epic adds:

- An **Endpoints** tab in the API page (after **Tokens**) documenting the public API.
- A **Copy endpoint** button on every task template card.
- A **Docs** tab inside the task template details panel, showing ready-to-paste integration instructions (written to be handed directly to an AI agent) with a copy button.

> **Depends on Epic 07.** Stories 1–4 of Epic 07 (the `api_tokens` table, `ApiTokenService`, the `/api/public/` bearer branch in the auth guard, and the `ApiTokenService` injection into `RuntimeContext`) are prerequisites. This epic consumes that auth gate; it does not re-implement it.

---

## How this maps onto existing internals

The public API is a **thin, stable adapter** over services that already exist — it does not add new task execution logic. Grounding references:

| Capability                                   | Existing internal                                                                             | File                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Create a task from a template (with context) | `taskService.createTaskFromTemplate(id, { triggerSource, context, scheduledFor })`            | `packages/backend/src/services/task-service.ts`                    |
| Run a task immediately                       | `taskExecutionService.queue(taskId, { triggerSource, context, metadata })`                    | `packages/backend/src/services/task-execution-service.ts`          |
| Store context attachments                    | `taskContextAttachmentService.storeForTask(taskId, upload)`                                   | `packages/backend/src/services/task-context-attachment-service.ts` |
| Schedule a one-off run                       | Set the generated task's `scheduled_at`; the scheduler polls `task_scheduler_state` every 30s | `packages/backend/src/services/task-scheduler-service.ts`          |
| Read run status                              | `taskService.getRun(taskId, runId)`                                                           | `packages/backend/src/services/task-service.ts`                    |
| Internal "run now" reference impl            | `POST /api/tasks/templates/:id/run-now`                                                       | `packages/backend/src/routes/tasks.ts:266`                         |

The existing `run-now` route is the blueprint: it calls `createTaskFromTemplate` → stores attachment uploads → `executionService.queue`. The public **trigger** endpoint does the same, plus a scheduled branch.

The internal `tasks` schema already carries the right primitives: `trigger_source` includes `"api"` and `task_runs.trigger_source` includes `"api"` — so API-originated runs are already a first-class, distinguishable source.

---

## Public API surface

All endpoints:

- Are prefixed `/api/public/v1/`.
- Require `Authorization: Bearer cc_…`.
- Return JSON. Errors use `{ error: string }` with appropriate status codes.
- Are versioned (`v1`) so the public contract can evolve without breaking integrations.

### 1. `GET /api/public/v1/task-templates`

List templates available to trigger. Returns only enabled, non-archived templates, with a minimal public shape (no internal IDs of agents, no permission profiles).

**Response `200`:**

```json
{
  "templates": [
    { "id": "01J…", "title": "Weekly report", "description": "Summarise the week's activity." }
  ]
}
```

### 2. `POST /api/public/v1/task-templates/:id/trigger`

Trigger a template — immediately, or scheduled for a future time.

**Request body** (all fields optional except where a schedule is desired):

```json
{
  "context": { "text": "Focus on the EU region this week." },
  "attachments": [
    {
      "filename": "data.csv",
      "mimeType": "text/csv",
      "dataUrl": "data:text/csv;base64,…",
      "sizeBytes": 20480
    }
  ],
  "schedule": { "runAt": "2026-06-10T09:00:00Z", "timezone": "Europe/Berlin" },
  "metadata": { "source": "zapier" }
}
```

- **No `schedule`** → the template runs now (`createTaskFromTemplate` + `executionService.queue`, `triggerSource: "api"`).
- **With `schedule.runAt`** → a task is created from the template with `scheduled_at = runAt`; the existing scheduler picks it up on its next tick. No run exists yet.
- `attachments[]` reuses the existing `uploadTaskContextAttachmentInputSchema` shape (`filename`, `mimeType`, `dataUrl`, `sizeBytes`) and is stored via `taskContextAttachmentService.storeForTask`.
- `context.text` and `attachments` may be sent independently or together.

**Response `200` (immediate):**

```json
{ "taskId": "01J…", "runId": "01J…", "status": "queued", "scheduledFor": null }
```

**Response `200` (scheduled):**

```json
{ "taskId": "01J…", "runId": null, "status": "scheduled", "scheduledFor": "2026-06-10T09:00:00Z" }
```

**Errors:** `404` template not found / not enabled; `400` invalid body (e.g. `runAt` in the past, attachment over size limit); `401` bad token.

### 3. `GET /api/public/v1/task-runs/:runId`

Poll the status of a triggered run. Returns a public-safe projection of `task_runs`.

**Response `200`:**

```json
{
  "runId": "01J…",
  "taskId": "01J…",
  "status": "completed",
  "outcome": "success",
  "finalMessage": "Report generated and posted.",
  "startedAt": "2026-06-02T10:00:00Z",
  "completedAt": "2026-06-02T10:02:30Z"
}
```

`status` ∈ `queued | running | completed | failed | cancelled | skipped`. `404` if the run does not exist. (Reads are workspace-wide — any non-archived run is visible to a `templates`-scoped token; see Story 4.)

Task-run artifacts and generated file downloads are explicitly out of scope for this epic. This endpoint must not expose local artifact paths, filesystem paths, or artifact download URLs. Safe artifact sharing is handled separately in [Epic 10](./10-task-artifact-sharing.md).

---

## REST conventions & attachment transport

This API follows standard REST conventions: versioned namespace (`/v1/`), resource-oriented paths, `Authorization: Bearer` auth, JSON bodies, conventional status codes (`200/400/401/404`), and a `{ "error": string }` error shape consistent with the internal API.

### `dataUrl` (base64-in-JSON) vs `multipart/form-data`

**Decision: base64 `dataUrl` inside the JSON body — not multipart — for v1.** This is a deliberate choice, not a shortcut. The reasoning:

| Factor                       | Why it favours base64-in-JSON here                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Payload size is bounded**  | Context attachments are hard-capped at **10 MB** (`MAX_CONTEXT_ATTACHMENT_SIZE_BYTES`, [task-context-attachment-service.ts:20](../../packages/backend/src/services/task-context-attachment-service.ts:20)). The "use multipart" guidance is really about large/streaming uploads (videos, multi-GB files); for ≤10 MB reference docs the ~33% base64 overhead is immaterial.                               |
| **Service reuse**            | The existing `storeAttachment` core is base64-native — it decodes `data:<mime>;base64,…`, checks the byte length against `sizeBytes`, validates MIME against an allow-list, and writes the file. Sending base64 lets the public endpoint call the **exact same service** with zero conversion. Multipart would force a parts→base64 (or a refactor of the shared internal service the UI also depends on). |
| **Atomicity**                | Trigger semantics are "create task from template → attach context → queue", mirroring the internal `run-now`. A single JSON request keeps context text, attachments, schedule, and metadata atomic. Multipart would split structured fields across a mixed JSON-part + file-parts body.                                                                                                                    |
| **Storage is task-anchored** | `storeAttachment` derives its storage key from the task (title + id) and rejects uploads for a non-existent task. There is no staging area, so a "pre-upload then reference by id" two-step (the other modern pattern) doesn't fit without inventing one. The task is created from the template at trigger time, so attachments must travel **with** the trigger call.                                     |
| **AI-agent consumers**       | A stated primary consumer is AI agents. LLMs emit well-formed JSON reliably; correctly assembling a mixed `multipart/form-data` body (boundaries, a JSON part plus binary parts) is materially more error-prone.                                                                                                                                                                                           |

**Honest caveat:** for a _generic_ public file-upload API accepting arbitrary large binaries, `multipart/form-data` (or a pre-signed two-step upload) is the textbook-correct content type, and base64-in-JSON would be the wrong default. That's not this endpoint — the 10 MB cap and the task-anchored storage model make inline base64 the correct, consistent choice here.

**Upgrade path (follow-on, not v1):** if large attachments ever become a requirement, refactor `storeAttachment` to accept a raw `Buffer` (filename + mimeType) as its core, then add a `multipart/form-data` variant of the trigger endpoint that streams parts into that core. The base64 path keeps working unchanged. Tracked in Open Decisions #3.

### Validation is inherited, not re-implemented

The public attachment path reuses the existing guarantees in `storeAttachment` verbatim: filename sanitisation (`basename`, no traversal), MIME allow-list (`SAFE_ATTACHMENT_TYPES` — csv/json/md/pdf/png/jpg/gif/webp/txt), `sizeBytes`-vs-decoded-length match, and the 10 MB cap. The public route adds **no** parallel validation; anything the internal upload rejects, the public endpoint rejects identically.

---

## Stories

---

### Story 1 — Shared schemas for the public API

**File:** `packages/shared/src/schemas/public-api.ts` _(new)_, exported from the schemas barrel.

Define and export:

- `publicTaskTemplateSummarySchema` — `{ id, title, description }`.
- `publicTriggerTemplateBodySchema` — `{ context?: { text? }, attachments?: uploadTaskContextAttachmentInputSchema[], schedule?: { runAt: datetime, timezone? }, metadata? }`. Reuse `uploadTaskContextAttachmentInputSchema` from `schemas/tasks.ts` for attachments.
- `publicTriggerTemplateResponseSchema` — `{ taskId, runId: string | null, status, scheduledFor: string | null }`.
- `publicTaskRunStatusSchema` — `{ runId, taskId, status, outcome, finalMessage, startedAt, completedAt }`.

**Acceptance criteria:**

- `schedule.runAt` is validated as an ISO datetime and rejected if in the past (refine).
- Attachments reuse `uploadTaskContextAttachmentInputSchema` unchanged (base64 `dataUrl` + `sizeBytes`); the 10 MB cap and MIME allow-list are enforced downstream by `storeAttachment`, not duplicated here. The route `bodyLimit` matches the internal upload route (`14 * 1024 * 1024`, leaving base64 headroom over the 10 MB file cap).
- Public run status schemas do not include artifacts, local paths, storage keys, or file download URLs.
- Types are exported for both backend route typing and frontend doc generation.

---

### Story 2 — Backend: public task API service (adapter)

**File:** `packages/backend/src/services/public-task-api-service.ts` _(new)_

A thin service that wraps the **existing** task services and exposes only public operations, returning only public projections (never internal agent IDs, permission profiles, rendered prompts, etc.). It contains **no new task-execution logic** — every action routes through a service the UI already uses.

| Method                                  | Existing service it calls                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `listTriggerableTemplates()`            | `taskService.listTemplates()` → filter `enabled && !archived` → map to summary                                                  |
| `triggerTemplate(id, body)` (immediate) | `taskService.createTaskFromTemplate` → `taskContextAttachmentService.storeForTask` → `taskExecutionService.queue`               |
| `triggerTemplate(id, body)` (scheduled) | `taskService.createTaskFromTemplate({ scheduledFor: runAt })`; the existing `taskSchedulerService` picks it up on its next tick |
| `getRunStatus(runId)`                   | `taskService.getRun` → map to public status projection                                                                          |

**Single shared trigger path (required, not optional).** The "create-from-template → store attachments → queue" sequence currently lives inline in the internal `POST /api/tasks/templates/:id/run-now` handler ([tasks.ts:266](../../packages/backend/src/routes/tasks.ts:266)). Extract it into one reusable helper (e.g. `taskService` / a small `triggerTemplateRun` function) and have **both** the internal `run-now` route **and** this public service call it. The internal UI and the public API must execute literally the same code path — no second implementation of triggering.

This service is constructed from the **same service instances** already wired in `registerTaskRoutes` (`taskService`, `taskExecutionService`, `taskContextAttachmentService`, `taskSchedulerService`). It does not instantiate parallel copies; reuse the ones on `RuntimeContext` where available.

**Acceptance criteria:**

- The immediate-trigger path is the identical helper used by `run-now` — verified by the internal route being refactored to call it (existing `run-now` behaviour and tests stay green).
- API-originated tasks/runs are tagged `triggerSource: "api"`.
- Scheduled triggers create the task with `scheduled_at` set and do **not** queue a run synchronously — the existing scheduler runs it.
- No internal-only field ever appears in a return value.

---

### Story 3 — Backend: public API routes

**Files:**

- `packages/backend/src/routes/public-api.ts` _(new)_
- `packages/backend/src/routes/index.ts` _(register)_

Register the three endpoints above under `/api/public/v1/` using the Story 1 schemas. These routes do **not** apply the owner-session guard — they fall under the `/api/public/` bearer branch added in Epic 07 Story 4.

**Acceptance criteria:**

- All three endpoints reachable only with a valid bearer token (verified by the guard, not re-checked in the handler).
- Validation errors return `400` with a JSON `{ error }` body; unknown template/run returns `404`.
- Response bodies validate against the Story 1 response schemas.

---

### Story 4 — Declare the `templates` scope for these endpoints

**File:** `packages/backend/src/routes/public-api.ts` (scope mapping registered with the routes)

The bearer validation, `request.apiToken` attachment, and per-route scope enforcement all live in the guard delivered by **Epic 07 Story 4** — this epic does not re-implement them. It only declares which scope its endpoints require:

| Endpoint                                         | Required scope                                            |
| ------------------------------------------------ | --------------------------------------------------------- |
| `GET /api/public/v1/task-templates`              | `templates` **or** `tasks` (shared template-id discovery) |
| `POST /api/public/v1/task-templates/:id/trigger` | `templates`                                               |
| `GET /api/public/v1/task-runs/:runId`            | `templates`                                               |

> **Run-status visibility — aligned with Epic 09.** Earlier drafts scoped `GET /task-runs/:runId` to only `trigger_source = "api"` runs. That restriction is **dropped**: Epic 09 introduces workspace-wide task/run reads (to list board columns the UI created), and both epics must behave consistently. Public read endpoints expose all non-archived runs regardless of origin. The token's `templates` scope is what gates access here, not the run's origin.

**Acceptance criteria:**

- Each endpoint above is registered with its required scope; a token lacking it gets `403` (per Epic 07's guard).
- `GET /task-runs/:runId` returns any non-archived run, not just api-origin runs.

---

### Story 5 — Shared endpoint-docs generator

**File:** `packages/shared/src/lib/public-api-docs.ts` _(new)_

A single source of truth that renders ready-to-use integration instructions for a given template, used by the card button, the details Docs tab, and the Endpoints tab. Keeping it in `shared` guarantees the card snippet, the details tab, and the API docs never drift apart.

```ts
buildTemplateEndpointDocs(input: {
  template: { id: string; title: string; description?: string };
  baseUrl: string;        // resolved from the current origin on the client
}): {
  triggerCurl: string;    // ready-to-run curl with the bearer placeholder
  triggerJs: string;      // fetch() snippet
  scheduleCurl: string;   // curl variant with a schedule block
  pollCurl: string;       // status-poll curl
  agentInstructions: string; // plain-language, AI-agent-ready markdown
}
```

The `agentInstructions` block is the headline deliverable — a self-contained markdown description an integrator can paste straight into an AI agent's system prompt or tool description. It must include: what the template does (title + description), the trigger URL and method, the `Authorization: Bearer <token>` header (with a `<YOUR_API_TOKEN>` placeholder), the request body schema (text / attachments / schedule), a worked example, and how to poll the run for completion.

Token values are **never** embedded — always a `<YOUR_API_TOKEN>` placeholder, since tokens are only shown once at creation (Epic 07).

**Acceptance criteria:**

- All snippets reference the real template `id` and the live origin's base URL.
- No real token is ever interpolated.
- Output is stable/deterministic for a given input (snapshot-testable).

---

### Story 6 — Frontend: "Endpoints" tab in the API page

**Files:**

- `packages/frontend/src/pages/ApiPage.tsx` _(add tab — extends Epic 07 Story 5)_
- `packages/frontend/src/components/api/EndpointsTab.tsx` _(new, or inline)_

Add a second tab after **Tokens**:

```tsx
const tabs = [
  { id: "tokens", label: "Tokens" },
  { id: "endpoints", label: "Endpoints" },
];
```

`EndpointsTab` documents the public API:

- An auth section explaining the `Authorization: Bearer cc_…` header and linking back to the Tokens tab to create one.
- One documented block per endpoint (method, path, body schema, example request/response) generated from the Story 1 schemas / Story 5 helper — not hand-maintained prose.
- The base URL shown is the live origin so copy/paste works as-is.
- Copy buttons on each code block.

**Acceptance criteria:**

- Endpoints tab renders the three public endpoints with accurate, copyable examples.
- Documentation reflects the live origin and stays consistent with the card/details snippets (shared generator).

---

### Story 7 — Frontend: "Copy endpoint" button on template cards

**File:** `packages/frontend/src/pages/TasksPage.tsx` _(template card button group, ~`:2691`)_

Add a **Copy endpoint** button to the template card's existing button group (alongside Create task / Run now / Edit / View details / Delete). On click it copies the template's trigger snippet (from `buildTemplateEndpointDocs(...).triggerCurl`, or a compact agent-ready block) via `navigator.clipboard.writeText`, with a brief "Copied" confirmation.

**Acceptance criteria:**

- Button appears on every template card and uses the same lucide icon style as the existing buttons.
- Copied snippet contains the correct template id, live base URL, and a `<YOUR_API_TOKEN>` placeholder.
- Graceful no-op + tooltip if the clipboard API is unavailable.

---

### Story 8 — Frontend: "Docs" tab in the template details panel

**File:** `packages/frontend/src/pages/TasksPage.tsx` (`TaskTemplateDetailPanel`, ~`:3018`)

Add a **Docs** tab to the template details panel. (If the panel is currently single-view, introduce a small `TabBar` with `Details` + `Docs`.) The Docs tab renders `buildTemplateEndpointDocs(...).agentInstructions` — the ready-to-share, AI-agent-friendly integration guide — plus the trigger / schedule / poll snippets, each with a copy button. A prominent **Copy integration instructions** button copies the full `agentInstructions` block.

**Acceptance criteria:**

- Docs tab shows complete, self-contained instructions good enough to hand to an AI agent without further explanation.
- All copy buttons work and copy the exact rendered text.
- Snippets match those shown on the card and in the Endpoints tab (shared generator).

---

## Files changed summary

| File                                                       | Action                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/shared/src/schemas/public-api.ts`                | New                                                                     |
| `packages/shared/src/lib/public-api-docs.ts`               | New (shared docs generator)                                             |
| `packages/backend/src/services/public-task-api-service.ts` | New                                                                     |
| `packages/backend/src/routes/public-api.ts`                | New                                                                     |
| `packages/backend/src/routes/index.ts`                     | Register public routes                                                  |
| `packages/backend/src/routes/tasks.ts`                     | Extract shared trigger helper; refactor `run-now` to call it (required) |
| `packages/backend/src/routes/public-api.ts`                | Declare `templates` scope on these endpoints (guard itself is Epic 07)  |
| `packages/backend/src/lib/start-server-runtime.ts`         | Fastify request type augmentation                                       |
| `packages/frontend/src/pages/ApiPage.tsx`                  | Add Endpoints tab                                                       |
| `packages/frontend/src/components/api/EndpointsTab.tsx`    | New                                                                     |
| `packages/frontend/src/pages/TasksPage.tsx`                | Card "Copy endpoint" button + details "Docs" tab                        |

---

## Open decisions

| #   | Decision                    | Default in this epic                                                                                                                                                                                     | Override to…                                                                                                                              |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which templates are exposed | All enabled, non-archived templates are triggerable                                                                                                                                                      | Add an explicit `apiEnabled` opt-in flag on `task_templates` if exposure should be per-template                                           |
| 2   | Trigger vs schedule shape   | One endpoint, optional `schedule` block                                                                                                                                                                  | Two separate endpoints (`/trigger`, `/schedule`) if you prefer explicit verbs                                                             |
| 3   | Attachment transport        | Inline `dataUrl` base64 in the JSON body — correct here given the 10 MB cap, task-anchored storage, service reuse, and agent consumers (see [REST conventions](#rest-conventions--attachment-transport)) | Refactor `storeAttachment` to a `Buffer` core + add a `multipart/form-data` trigger variant if large/streaming files become a requirement |
| 4   | Run-status visibility       | **Resolved** — workspace-wide reads (any non-archived run), unified with Epic 09; gated by the `templates` scope, not run origin                                                                         | —                                                                                                                                         |
| 5   | Recurring schedules via API | Out of scope — only run-now and one-off `scheduled_once`                                                                                                                                                 | Accept a `recurrence` block mapping to `recurringTaskScheduleSchema` in a follow-on                                                       |

---

## Out of scope (follow-on)

- Recurring/cron schedules created via the API (UI-only for now).
- Webhooks / callbacks on run completion (polling only in v1).
- Finer per-template scopes (the coarse `templates` scope is delivered in Epic 07; restricting _which_ templates a token may trigger is a follow-on).
- Cancelling or listing runs via the public API.
- Task-run artifacts, generated file downloads, local artifact paths, and public file sharing. See [Epic 10](./10-task-artifact-sharing.md).
- Rate limiting per token.
