# Phase 5 — Per-Token Execution Audit

**Status:** Detailed plan for review (not yet approved). Authored 2026-07-08.
**Parent roadmap:** [public-mcp-tasks-and-token-permissions.md](public-mcp-tasks-and-token-permissions.md) (Phase 5).
**Depends on:**

- **[Phase 1 — Token Permission Model](phase-1-token-permission-model.md)** — `request.apiToken` carries the token id + name; `capabilityForPublicRoute` labels each REST call.
- **[Phase 2 — Public MCP Server Foundation](phase-2-public-mcp-server-foundation.md)** — the MCP service's tool dispatch is where per-tool MCP calls are recorded (hijacked routes bypass Fastify's normal lifecycle).
- Records Phase 3 template tools and Phase 4 sync/async tools as they land — no coupling beyond the tool name each surfaces.

See [Dependencies](#dependencies).

**Goal:** Record every authenticated public API / MCP request in an append-only SQLite audit log keyed by token, so an operator can open a **per-token activity page** and see _what was sent and where_. Bound growth with a configurable retention window.

---

## Decisions locked in (from review)

1. **Audit table only — no run stamping.** Token identity lives in the append-only log; a run is traced to its token via the audit row's `target_run_id`. No changes to `task_runs` or the trigger service signatures. This fully satisfies "track token name used when executing."
2. **Auto-prune, configurable.** Entries older than a retention window are pruned automatically. Default **4 weeks**, operator-configurable **1–20 weeks** via settings.
3. **Capture what was sent, redacted + size-capped.** Store a truncated text summary + file _metadata_ (filename/mime/size), never base64 blobs or secret-looking values.

---

## Current state (verified in codebase)

| Concern                                                                                                                                                | Where                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `preHandler` guard validates the bearer and attaches `request.apiToken` (`ApiTokenRecord` = id, name, tokenPrefix, …); no `onResponse` hook exists yet | `packages/backend/src/server.ts:26`, `packages/backend/src/lib/owner-auth-guard.ts` |
| Route → capability resolver (Phase 1) for labeling REST calls                                                                                          | `owner-auth-guard.ts` (`capabilityForPublicRoute`)                                  |
| MCP tool dispatch (hijacked route ⇒ **no** Fastify `onResponse`; must record inside the service)                                                       | `packages/backend/src/mcp/public/service.ts` (Phase 2)                              |
| Runtime/disposable table precedent ("resets on DB rebuild like conversations and task runs") + indexing style                                          | `packages/backend/src/db/schema/activities.ts`, `services/activity-service.ts`      |
| DB settings value pattern (`getSetting`/`upsertSettingFilefirst`) — used by the artifact expiry setting                                                | `packages/backend/src/db/helpers.ts`, `services/artifact-share-link-service.ts`     |
| Token routes to hang the activity endpoint off                                                                                                         | `packages/backend/src/routes/api-tokens.ts`                                         |
| Token UI card (add "View activity")                                                                                                                    | `packages/frontend/src/pages/ApiPage.tsx`                                           |
| Settings UI + client (retention control home)                                                                                                          | `packages/frontend/src/pages/SettingsPage.tsx`, `lib/api/settings.ts`               |

**Note (distinct from `activityService`):** the existing `activities` table is the operator _action feed_ (pending/archived cards with dedupe). This audit log is a separate append-only request ledger — do **not** reuse `activityService`.

---

## Target design

### 1. Audit table (`api_token_activity`)

New runtime/disposable table (not file-first — same class as `activities`/`task_runs`):

| Column                      | Notes                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | pk                                                                                                                        |
| `token_id`                  | FK-ish (string) to `api_tokens.id`                                                                                        |
| `token_name`                | **snapshot** at request time (survives rename/revoke)                                                                     |
| `surface`                   | `"rest"` \| `"mcp"`                                                                                                       |
| `action`                    | REST: `"GET /api/public/v1/tasks/:id"` (route template); MCP: the tool name (`task_run`, `create_linkedin_post_async`, …) |
| `capability_id`             | Phase 1 capability (nullable for MCP tools with no 1:1 capability, e.g. template tools)                                   |
| `target_kind` / `target_id` | `template` \| `task` \| `run` \| null + the id, when resolvable                                                           |
| `input_summary_json`        | redacted, size-capped (see §5)                                                                                            |
| `outcome`                   | `"ok"` \| `"error"`                                                                                                       |
| `status_code`               | REST HTTP status (nullable for MCP)                                                                                       |
| `error_message`             | short, on error                                                                                                           |
| `created_at`                | ms timestamp                                                                                                              |

Indexes: `(token_id, created_at)` for the per-token page; `created_at` for pruning.

- **Drizzle migration** via `db:generate` (review SQL + meta/journal).

### 2. `tokenAuditService`

`createTokenAuditService({ db })`:

- `record(entry)` — **fire-and-forget and non-throwing**: wrapped so an audit failure never breaks the request path (log-and-swallow).
- `listForToken({ tokenId, limit, cursor })` — newest-first, cursor paginated.
- `prune(olderThanMs)` — bulk delete; returns count.

### 3. REST interception (`onResponse` hook)

- Add an `onResponse` hook in `server.ts` (after the guard). For paths under `/api/public/v1/` with `request.apiToken` present, record one row: token id/name, `surface:"rest"`, `action` = method + matched route template, `capability_id` = `capabilityForPublicRoute(...)`, target ids from `request.params` (`id`/`runId`/template id), input summary from `request.body`, `outcome`/`status_code` from `reply`.
- **Skip:** the hijacked MCP endpoint (`/api/public/mcp`, no `onResponse`) and the signed artifact download (no token).
- **Auth-order tweak (Phase 1/5 coordination):** move `request.apiToken = tokenRecord` in `validatePublicApiBearer` to immediately after token validation — _before_ the capability check — so a `403` (valid token, missing capability) is still auditable ("token attempted X without permission"). Small, worth doing.

### 4. MCP interception (tool dispatch wrapper)

- In the public MCP service, wrap each `tool.execute` so every call records a row: token from the session (`request.apiToken`), `surface:"mcp"`, `action` = tool name, `capability_id` (if the tool maps to one), target id parsed from args (templateId/taskId/runId), args summary, `outcome` from the result's `isError`.
- Covers Phase 3 template tools and Phase 4 `*_async` variants automatically (they're just tool names).

### 5. Input redaction + size cap

- **Text:** truncate `context.text` / tool `text` to N chars (e.g. 500) with a `truncated: true` flag.
- **Files:** store `[{ filename, mimeType, sizeBytes }]` only — **never** `dataUrl`/base64.
- **Defense-in-depth:** run the summary through a light redaction pass for token/secret-looking substrings (e.g. `cc_…`, long base64). Public inputs have no secret field, so this is a safety net, not the primary control.
- Cap the serialized `input_summary_json` size hard (e.g. 4 KB).

### 6. Retention setting + pruning

- **Setting:** `apiTokenActivityRetentionWeeks`, default `4`, range `1–20`. Store via the `getSetting`/`upsertSettingFilefirst` DB-setting pattern (single value, like the artifact expiry). Surface in `SettingsPage.tsx` with a GET/PUT (or extend an existing settings route).
- **Pruning job:** on startup and on a daily interval, call `prune(now - retentionWeeks)`. Wire a lightweight timer in `start-server-runtime` (or piggyback the scheduler tick); guard against overlap. Reading the retention value each run picks up setting changes without restart.

### 7. Per-token activity page (UI)

- Backend: `GET /api/api-tokens/:id/activity?limit=&cursor=` (owner-authed) → `listForToken`, returning a shared `apiTokenActivityListResponseSchema`.
- Shared schema: `apiTokenActivityEntrySchema` (the row projection) + list response.
- Frontend: a "View activity" action on each `TokenCard` opening a page/drawer that lists entries — action, target, time, outcome, and the input summary — paginated. New query hook + `lib/api/settings.ts` client fn.

---

## Task breakdown (implementation order)

1. Migration + `api_token_activity` table.
2. Shared schemas: audit entry + list response; retention setting schema.
3. `tokenAuditService` (record / listForToken / prune).
4. REST `onResponse` hook + the `validatePublicApiBearer` attach-order tweak.
5. MCP tool-dispatch audit wrapper (public MCP service).
6. Redaction/size-cap helper (shared by both paths).
7. Retention setting (get/put + `SettingsPage`) + the daily prune job.
8. `GET /api/api-tokens/:id/activity` + token activity UI (page/drawer + hook).
9. Tests (below).

---

## Testing

- **Service:** `record` never throws on a bad entry; `listForToken` order + pagination; `prune` deletes only rows older than the cutoff.
- **REST hook:** a triggered template records a row with the right token snapshot, action, capability, target run id, and status; a `403` (missing capability) is recorded once the attach-order tweak is in; signed download + MCP endpoint are skipped.
- **MCP wrapper:** sync `task_run`, a template tool, and a `*_async` variant each record a row with the tool name + parsed target + outcome; an errored tool records `outcome:"error"`.
- **Redaction:** long text truncated; files reduced to metadata (no `dataUrl`); summary size hard-capped; token-like strings redacted.
- **Retention:** setting clamps to 1–20; prune respects the window; setting change takes effect on the next run.
- **UI:** activity page lists + paginates a token's entries; extend `ApiPage.test.tsx` / `SettingsPage.test.tsx`.

---

## Edge cases & risks

- **Never break the request:** all audit writes are best-effort; a DB error logs and is swallowed.
- **Snapshot the token name** so revoked/renamed tokens still read correctly in history (don't join live to `api_tokens`).
- **Hijacked MCP route** genuinely has no `onResponse` — the MCP audit _must_ be the dispatch wrapper, not the hook. Assert both paths in tests so a future refactor can't silently drop MCP audit.
- **Write volume:** one row per request; the index on `(token_id, created_at)` + pruning keep it bounded. Keep `record` a single cheap insert.
- **PII/secret leakage** in stored inputs — the redaction + hard size cap + files-as-metadata rule are the controls; centralize them in one helper used by both surfaces.
- **Failed-auth (401) requests** have no `request.apiToken` and are intentionally not audited (no token identity to attribute them to).

---

## Dependencies

- **Phase 1:** token identity on `request.apiToken` + capability labeling; the small attach-order tweak lives here.
- **Phase 2:** the MCP dispatch point to wrap; without it there's no MCP surface to audit (REST audit alone could ship earlier if desired).
- **Phases 3 & 4:** no code coupling — their tools are recorded automatically by name as they appear.

**Sequencing:** REST audit + retention + UI can land right after Phase 1/2; the MCP wrapper attaches to Phase 2's service. Independent of Phases 3–4.

---

## Out of scope for Phase 5 (deferred)

- Stamping the `task_run` record with the token (explicitly declined — audit-table-only).
- Artifact URL/download specifics in the log → Phase 6 changes only the tool _result_, not the audit shape.
- Cross-token analytics / dashboards — the per-token list is the v1 surface.

---

## Open questions (resolve during build, non-blocking)

1. Text-summary truncation length (proposed 500 chars) and the hard `input_summary_json` cap (proposed 4 KB).
2. Prune cadence: daily timer in `start-server-runtime` vs. piggybacking the existing scheduler tick. (Recommend a simple daily timer + a startup prune.)
3. Retention setting home: a standalone DB setting (proposed) vs. folding into a broader "public API/MCP settings" group in the UI.
4. Whether the activity page is a full route or an inline drawer on the token card (UX call).
