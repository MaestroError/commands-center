# Plan: Public MCP for Tasks + Token Permission Overhaul

**Status:** High-level path plan for review (not yet approved). Authored 2026-07-08.
**Owner:** revaz.
**Goal:** Expose the task/template surface as a **public, token-authenticated MCP server** (a sibling to the existing REST public API), and overhaul the API-token permission model from two coarse scopes to **explicit per-tool / per-template toggles**. Add per-token execution auditing, sync + async run tools, and an artifact-serving refinement (dual URLs, configurable validity, gated post-expiry display, non-renderable download page).

This document is the **roadmap**. Each phase below will be broken out into its own detailed plan before implementation.

---

## Decisions locked in (from review)

1. **Unified per-tool permissions for BOTH REST and MCP.** One token model. Every REST endpoint and every MCP tool is an individually toggleable entry; the existing groups (`templates`, `tasks`) become presets that select all tools in the group. Selecting a group turns on all its tools; the user can expand the group and toggle tools individually (mirrors the specialist edit page UX). For MCP, each task **template** is also an individually toggleable tool.
2. **Sync MCP run tools wait up to a configurable cap, then return an id.** Session-creating tools (template-as-tool, `task_template_run`, `task_run`) are sync by default: the client waits for result + artifacts. If the run exceeds a configurable maximum wait, the tool returns the task/run id plus guidance to poll the result tool. Async variants (below) skip the wait entirely.
3. **Expired display URLs are owner-session gated.** After an artifact display URL's validity window lapses, it stays reachable only through the CC UI under an authenticated owner session — no separate shared password. The signed public link is what expires; the operator retains access via the app.
4. **Single public MCP server.** One new Streamable-HTTP endpoint (e.g. `POST /api/public/mcp`), authenticated by the existing scoped API bearer tokens (`apiTokenService`). All task/template tools — including each template-as-a-tool — are served from this one endpoint, gated by the token's per-tool permission set.

---

## Existing foundation (reuse — do not rebuild)

| Need                                                                                                    | Already in codebase                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public bearer-token auth + `request.apiToken` attachment + scope enforcement                            | `validatePublicApiBearer` / `scopeForPublicRoute` in `packages/backend/src/lib/owner-auth-guard.ts`                                                            |
| Token mint/list/revoke/validate + hashing                                                               | `packages/backend/src/services/api-token-service.ts`, schema `packages/shared/src/schemas/api-tokens.ts`, table `packages/backend/src/db/schema/api-tokens.ts` |
| Token management UI (create form, scope checkboxes, reveal, revoke)                                     | `packages/frontend/src/pages/ApiPage.tsx`                                                                                                                      |
| MCP-over-HTTP serving pattern (Streamable HTTP, per-tool registration, bearer auth, tool-access gating) | `packages/backend/src/mcp/cc-managed/service.ts` + `server-registry.ts` + `tool-access-service.ts`                                                             |
| Thin public projection of task operations (no internal IDs/prompts leaked)                              | `packages/backend/src/services/public-task-api-service.ts`                                                                                                     |
| Shared template-trigger path used by internal UI + public API                                           | `packages/backend/src/services/trigger-template-run.ts`                                                                                                        |
| Async run lifecycle (queue + poll monitor to terminal state)                                            | `packages/backend/src/services/task-execution-service.ts` + `task-run-monitor-service.ts`                                                                      |
| Artifact model, publish-to-immutable-snapshot, signed download links, expiry setting                    | `artifact-service.ts`, `artifact-share-link-service.ts`, schema `packages/shared/src/schemas/artifacts.ts`, table `artifact_share_links`                       |
| Per-token/per-tool permission **UX reference** (group with expandable per-tool toggles)                 | `packages/frontend/src/components/specialists/SpecialistForm.tsx` + `specialistCapabilitySelectionSchema`                                                      |
| Activity feed infra (distinct from the new audit log — see Phase 5)                                     | `activity-service.ts`                                                                                                                                          |
| File-first persistence convention for portable config (templates already do this)                       | `packages/backend/src/services/task-service/template-files.ts`; principle in `AGENTS.md`                                                                       |

Most of this is **wiring existing services behind a new public MCP endpoint + a richer permission model + a per-template MCP config + an audit table**, not greenfield.

---

## Architectural principles to honor

- **Workspace filesystem is the source of truth for portable config** (`AGENTS.md`). Per-template MCP config (Phase 3) and artifact URL toggles must be **file-first** (mirror into the template's workspace file), like the rest of template config. Token permissions and the audit log are runtime state and live in SQLite only (api_tokens has no file mirror today — keep it that way).
- **Every schema change generates a Drizzle migration** (`pnpm --filter @cc/backend db:generate`); never hand-edit applied migrations. Filesystem migrations follow `skills/write-filesystem-migration/SKILL.md`.
- **Public projections never leak internals** — keep the `public-task-api-service` discipline (no agent IDs, rendered prompts, permission profiles, or storage paths) for all MCP tool outputs.
- **Forward/backward-compatible scope deserialization** — `api-token-service` already reads scopes leniently (unknown scopes ignored). The new model must preserve rollback safety the same way.

---

## Phase breakdown

### Phase 1 — Token permission model overhaul (unified per-tool)

> **Detailed plan:** [phase-1-token-permission-model.md](phase-1-token-permission-model.md)

**Why first:** everything else (MCP tool exposure, per-template tools, async variants, audit) reads this model. Get the data model and enforcement right before layering tools on top.

- Introduce a **tool catalog** abstraction: the canonical list of permissionable units, each tagged with a group (preset), a surface (`rest` | `mcp` | `both`), and a stable id. Groups stay `templates` and `tasks`; tools within them enumerate the concrete REST endpoints + MCP tools.
- Replace the `scopes: ["templates","tasks"]` storage with a richer token permission structure (e.g. `{ groups: [...], tools: { <toolId>: enabled }, templates: { <templateId>: enabled } }`). Keep a lenient reader for old rows: an existing token with `templates`/`tasks` maps to "all tools in that group enabled."
- Schema (`packages/shared/src/schemas/api-tokens.ts`), service (`api-token-service.ts`), DB migration (widen/replace `scopes_json`), and **enforcement rewrite** in `owner-auth-guard.ts` — `scopeForPublicRoute` becomes a per-endpoint tool lookup instead of a group check.
- **UI:** rework `ApiPage.tsx` create form to the specialist-style pattern — group checkbox that bulk-selects, expandable per-tool list with individual on/off, and (deferred to Phase 3 wiring) a per-template list.
- **Risks/edge:** migration of live tokens; ordering/normalization of enabled sets; keeping `either`-style board convenience; ensuring REST enforcement stays airtight during the cutover.

### Phase 2 — Public MCP server foundation

> **Detailed plan:** [phase-2-public-mcp-server-foundation.md](phase-2-public-mcp-server-foundation.md) — **depends on Phase 1** (binds MCP tools to the capability catalog + `tokenHasCapability`).

**Why second:** stand up the endpoint and prove the auth + permission-gated tool listing against the existing (non-template) task operations before adding dynamic per-template tools.

- New Streamable-HTTP endpoint `POST /api/public/mcp` (+ GET/DELETE as the SDK needs), routed through the `PUBLIC_API_PREFIX` branch so `validatePublicApiBearer` runs first and attaches `request.apiToken`. Model the transport/session/tool-registration on `mcp/cc-managed/service.ts` but authenticate with the **public** `apiTokenService`, not the per-specialist HMAC tokens.
- A **public MCP registry** that maps catalog tools (Phase 1) → MCP tool definitions, reusing `public-task-api-service` for execution. Only tools enabled on the calling token are registered for that session (per-token tool listing, like `tool-access-service.listEnabledTools`).
- Core tool set (sync where they create sessions): `list_task_templates`, `task_template_run`, `task_run`, task CRUD/list/get, `get_task_result` (and the run-status equivalent). Sync tools use a shared **run-await helper** (Phase 4) — for Phase 2 a simple bounded wait is fine; the configurable cap + async variants land in Phase 4.
- **Risks/edge:** streaming-HTTP timeouts vs. long sync waits; ensuring no internal fields leak through MCP `structuredContent`; discovery/`.well-known` exposure without leaking the tool list to unauthenticated callers.

### Phase 3 — Task templates as MCP tools

> **Detailed plan:** [phase-3-templates-as-mcp-tools.md](phase-3-templates-as-mcp-tools.md) — **depends on Phase 1** (per-template token toggle + `tokenHasTemplate`) **and Phase 2** (public MCP registry + sync run-and-wait).

- **Per-template MCP config section** on the create/edit template pages (`packages/frontend/src/pages/tasks/TaskTemplateFormPage.tsx`): editable MCP tool name (default derived from title, e.g. "Create LinkedIn Post" → `create_linkedin_post`), tool description, `text` field description, `files` field description, **"allow files" checkbox (default on)** that adds the `files` argument, and an **"async enabled"** toggle (consumed in Phase 4). Also the artifact URL enable/disable toggles land here (consumed in Phase 6).
- Schema + storage: extend `taskTemplateSchema` / create+update inputs (`packages/shared/src/schemas/tasks.ts`), add columns to `task_templates` (`db/schema/tasks.ts`) with a Drizzle migration, and mirror into the template workspace file (**file-first**, via `task-service/template-files.ts`).
- **Dynamic tool generation:** each enabled template becomes an MCP tool named by its config, taking only `text` and (if allowed) `files`, feeding `triggerTemplateRun` as generated context. Tool is registered only if the token enables that template (Phase 1 per-template toggle) AND the template is enabled/active.
- Name collision + validation rules (unique tool names per server; sanitize to MCP-safe identifiers).

### Phase 4 — Sync/async run tools + auto-exposed async variants

> **Detailed plan:** [phase-4-sync-async-run-tools.md](phase-4-sync-async-run-tools.md) — **depends on Phase 1** (`get_task_result` capability gate), **Phase 2** (run-await helper + result tool), **and Phase 3** (per-template `asyncEnabled` + shared name validator).

- **Shared run-await helper:** wait for a run to reach a terminal state up to a **configurable cap** (new setting, following the `taskArtifactSignedUrlExpiresInMinutes` settings pattern); on timeout return `{ taskId, runId, status }` with poll guidance. Gather result text + artifacts (dual URLs from Phase 6) for the sync return.
- **Auto-exposed `*_async` variants** — created automatically, never hand-listed:
  - `task_template_run_async` and `task_run_async` are exposed **iff** the result-polling tool (`get_task_result` / run equivalent) is enabled on the token.
  - Each template-as-tool gets a `<name>_async` variant **iff** (a) the result-polling tool is enabled on the token **and** (b) async is enabled in that template's MCP config (Phase 3). Async variant descriptions append a note that they return an id to check later.
- Enforcement: async variants are their own catalog/permission entries derived from the base tool + the get-result capability, so Phase 1's model must accommodate derived/virtual tools.

### Phase 5 — Per-token execution auditing

> **Detailed plan:** [phase-5-per-token-execution-audit.md](phase-5-per-token-execution-audit.md) — **depends on Phase 1** (token identity + capability labeling) **and Phase 2** (MCP dispatch to audit). Decided: audit-table-only (no run stamping); configurable retention (default 4 weeks, 1–20).

- Thread **token identity (id + name)** from the trigger paths (REST `public-task-api-service` and the new MCP tools) into run creation. Today runs record `triggerSource: "api"` but not which token.
- New **audit SQLite table** (append-only, runtime/disposable per the source-of-truth principle): one row per request — token id/name, tool/endpoint invoked, target template/task/run, input summary (redacted/size-capped), outcome, timestamp. This is **separate from `activity-service`** (which is the operator action-feed, not an auditable request log).
- **Per-token activity page** in the UI to browse the log ("what was sent and where, per token"), reachable from the token card in `ApiPage.tsx`.
- **Risks/edge:** what to store from inputs (avoid persisting secrets/large file blobs — store metadata/size, not payloads); retention/pruning.

### Phase 6 — Artifacts refinement

> **Detailed plan:** [phase-6-artifacts-refinement.md](phase-6-artifacts-refinement.md) — **depends on Phase 3** (per-template artifact toggles) **and Phase 2** (result schema + assembly point). Decided: stateless HMAC-signed URLs; display gets owner-session fallback, download hard-expires; file/document served, url passthrough.

- **Two URLs per artifact:** a **displayable** (inline/online) URL and a **downloadable** URL. Per-template enable/disable of each (config from Phase 3).
- **Configurable validity window** for artifact URLs via settings (extend the existing `artifactSharingPreferences` / expiry setting rather than a parallel one).
- **Post-expiry display via owner session:** when a display URL's signed window lapses, the CC UI (authenticated owner) can still render it. The public signed link expires; the UI path is owner-gated (decision #3).
- **Content-type–aware display:** browser-renderable types (images, PDF, `.txt`, `.md`) render inline at the display URL; non-renderable types (e.g. `.zip`) show a **download page** with file name, size, and a download button instead of streaming bytes. Build on `artifact-service` mime resolution + the existing signed-download route (`/api/public/v1/task-artifacts/download/:shareId`).
- **Risks/edge:** correct `Content-Disposition`/`X-Content-Type-Options` per type; safe inline rendering (no HTML/SVG XSS via inline serving — restrict inline set); mapping the two URLs into MCP sync-tool returns and REST projections.

---

## Cross-cutting concerns

- **Permission model is the spine.** Phases 3 and 4 add _dynamic_ and _derived_ catalog entries (per-template tools, `*_async` variants). Design Phase 1's storage/enforcement to enumerate these without a schema change each time.
- **Sync-wait vs. HTTP/proxy timeouts.** The configurable cap must sit safely under any reverse-proxy idle timeout on the deployment; document the interaction and default conservatively.
- **No-leak discipline** across REST projections, MCP `structuredContent`, and the audit log.
- **Migrations** (both Drizzle and any filesystem/template-file migrations) accompany each phase that touches persistence; generate — never hand-write — and keep metadata/journal in sync.
- **Tests** mirror existing coverage style (`ApiPage.test.tsx`, `EndpointsTab.test.tsx`, service-level tests) — especially permission enforcement and the sync/async tool matrix.

---

## Suggested sequencing

1. **Phase 1** (permission model) — foundation, unblocks all gating.
2. **Phase 2** (MCP server foundation) — proves auth + per-token tool listing.
3. **Phase 3** (templates as tools) — the headline capability.
4. **Phase 4** (sync/async variants) — completes the tool matrix.
5. **Phase 5** (audit) — can start in parallel once Phase 2 lands; needs token identity in trigger paths.
6. **Phase 6** (artifacts) — independent of the MCP tool matrix except for the dual-URL return shape; can run in parallel with Phase 4/5.

---

## Open questions to resolve per-phase (not blocking the roadmap)

1. **Phase 1:** exact token permission JSON shape and the "Board" convenience preset's future; whether revoked-scope back-compat needs a one-time data migration or lazy mapping.
2. **Phase 2:** endpoint path (`/api/public/mcp` vs. `/mcp`) and server display name; whether to publish a `.well-known` MCP descriptor.
3. **Phase 4:** default and max values for the sync-wait cap setting; naming of the run-result tool (`get_task_result` vs. a run-specific name).
4. **Phase 5:** audit retention policy and how much of the input `text`/file metadata to persist.
5. **Phase 6:** the exact allow-list of inline-renderable mime types and the owner-gated display route's shape.
