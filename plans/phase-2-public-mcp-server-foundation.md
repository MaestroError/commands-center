# Phase 2 — Public MCP Server Foundation

**Status:** Detailed plan for review (not yet approved). Authored 2026-07-08.
**Parent roadmap:** [public-mcp-tasks-and-token-permissions.md](public-mcp-tasks-and-token-permissions.md) (Phase 2).
**Depends on:** **[Phase 1 — Token Permission Model](phase-1-token-permission-model.md) must land first.** Phase 2 gates every MCP tool by the token's resolved capabilities and reuses `tokenHasCapability` + the shared capability catalog introduced in Phase 1. Without Phase 1, there is no per-tool authorization to enforce and the MCP registry has no capability ids to bind to. See [Dependency on Phase 1](#dependency-on-phase-1).

**Goal:** Stand up a **single public, token-authenticated MCP server** at one Streamable-HTTP endpoint, exposing the existing (non-template) task/template operations as MCP tools. Prove auth + **per-token tool listing** + the **sync run-and-wait** pattern against real operations. Dynamic per-template tools (Phase 3), the configurable wait cap + `*_async` variants (Phase 4), audit (Phase 5), and artifact URL enrichment (Phase 6) build on this foundation but are explicitly out of scope here.

---

## Decisions locked in (from roadmap review)

1. **Single public MCP server**, one endpoint (`POST /api/public/mcp`, plus `GET`/`DELETE` for the Streamable-HTTP transport), authenticated by the existing scoped API bearer tokens.
2. **Surface-agnostic capabilities** (Phase 1): each MCP tool binds to a Phase 1 capability id; one toggle governs both the REST route and the MCP tool.
3. **Sync by default with a bounded wait.** Session-creating tools (`task_run`, `task_template_run`) hold the response until the run reaches a terminal state or a conservative timeout, then return result + artifact summary. The **configurable** cap and the auto-exposed `*_async` variants are Phase 4.

---

## Current state (verified in codebase)

| Concern                                                                                                                                                                                                                                                                        | Where                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| MCP-over-HTTP pattern: `reply.hijack()` → hand `request.raw` / `reply.raw` / `request.body` to a service that builds a per-request `McpServer` + stateless `StreamableHTTPServerTransport` (`sessionIdGenerator: undefined`), registers tools, calls `transport.handleRequest` | `packages/backend/src/mcp/cc-managed/service.ts`, `packages/backend/src/routes/cc-managed-mcp.ts` |
| Per-token tool filtering reference (list only enabled tools for the session)                                                                                                                                                                                                   | `packages/backend/src/mcp/cc-managed/tool-access-service.ts`                                      |
| MCP SDK                                                                                                                                                                                                                                                                        | `@modelcontextprotocol/sdk@^1.18.1`                                                               |
| Public bearer auth + `request.apiToken` attach; `/api/public/` branch runs first                                                                                                                                                                                               | `packages/backend/src/lib/owner-auth-guard.ts` (`validatePublicApiBearer`)                        |
| Public-safe execution adapter (no internal IDs/prompts/paths leaked); shared trigger path                                                                                                                                                                                      | `packages/backend/src/services/public-task-api-service.ts`, `services/trigger-template-run.ts`    |
| Async run lifecycle: `executionService.queue()` starts a **poll-based** monitor that writes terminal status to the DB (no event bus)                                                                                                                                           | `services/task-execution-service.ts`, `services/task-run-monitor-service.ts`                      |
| Terminal run detection: `taskRunStatusSchema` = `queued, running, completed, failed, error, cancelled, skipped` (terminal = all but `queued`/`running`)                                                                                                                        | `packages/shared/src/schemas/tasks.ts`                                                            |
| Run read incl. artifacts: `taskService.getRunById(runId)` returns a `TaskRun` with `artifacts[]` populated                                                                                                                                                                     | `services/task-service/read-ops.ts:343`                                                           |
| Route registration                                                                                                                                                                                                                                                             | `packages/backend/src/routes/index.ts`                                                            |
| Public projections (no artifacts today — deliberately omitted)                                                                                                                                                                                                                 | `packages/shared/src/schemas/public-api.ts`                                                       |

---

## Architecture

### 1. Endpoint + transport

- New route module `packages/backend/src/routes/public-mcp.ts`, registered in `routes/index.ts` **after** `registerPublicApiRoutes`. Handlers for `POST`/`GET`/`DELETE` `/api/public/mcp`, each `reply.hijack()`-ing and delegating to a new service — mirroring `cc-managed-mcp.ts` exactly (raw req/res + `request.body` as parsed body for POST).
- New service `packages/backend/src/mcp/public/service.ts` modeled on `cc-managed/service.ts`: per-request stateless `McpServer` + `StreamableHTTPServerTransport`, `ensureDrainCompatibleSocket`, text error helper. **Difference:** it authenticates via the **public** `apiTokenService` (through `request.apiToken`, see §2), not the per-specialist HMAC token service, and builds the tool set from the token's capabilities, not a specialist's `capabilities_json`.
- Generous `bodyLimit` (14 MB, matching the REST trigger route) so Phase 3's file args fit without re-plumbing.

### 2. Auth flow (reuse Phase 1)

- The guard's `/api/public/` branch already runs before the handler. Add an **MCP-route special case** in `owner-auth-guard.ts`: for `POST|GET|DELETE /api/public/mcp`, validate the bearer and **attach `request.apiToken`**, but **skip `capabilityForPublicRoute`** (the MCP endpoint is not a single-capability route — per-tool gating happens inside the session). Missing/invalid token → `401` (as today).
- The route handler passes `request.apiToken` into the service; the service resolves the token's enabled capabilities via Phase 1's `tokenHasCapability` / permissions and registers **only** the tools whose capability is enabled (per-token `tools/list`). A revoked token mid-stream fails at the next request (stateless transport ⇒ each POST re-checked by the guard).
- **No unauthenticated discovery:** `initialize` / `tools/list` / `tools/call` all require the token. `.well-known` OAuth metadata is intentionally **not** served in v1 (PAT-only, header auth) — noted as an open question for later client-compat work.

### 3. Public MCP tool registry (capability-bound)

New `packages/backend/src/mcp/public/registry.ts` mapping each Phase 1 capability id → an MCP tool definition (name, description, input/output Zod schema, execute). Every `execute` routes through `public-task-api-service` so projections stay leak-free. Phase 2 tool set:

| MCP tool                | Phase 1 capability      | Kind                       | Backing call                                 |
| ----------------------- | ----------------------- | -------------------------- | -------------------------------------------- |
| `list_task_templates`   | `list_task_templates`   | read                       | `service.listTriggerableTemplates()`         |
| `task_template_run`     | `trigger_task_template` | **sync (creates session)** | `triggerTemplate` + run-and-wait             |
| `enable_task_template`  | `enable_task_template`  | write                      | `setTemplateEnabled(id,true)`                |
| `disable_task_template` | `disable_task_template` | write                      | `setTemplateEnabled(id,false)`               |
| `list_specialists`      | `list_specialists`      | read                       | `listAgents()`                               |
| `create_task`           | `create_task`           | write                      | `createTask`                                 |
| `list_tasks`            | `list_tasks`            | read                       | `listTasks`                                  |
| `get_task`              | `get_task`              | read                       | `getTask`                                    |
| `task_run`              | `trigger_task`          | **sync (creates session)** | `triggerTask` + run-and-wait                 |
| `schedule_task`         | `schedule_task`         | write                      | `scheduleTask`                               |
| `list_task_runs`        | `list_task_runs`        | read                       | `listRuns`                                   |
| `get_task_run`          | `get_task_run_detail`   | read                       | `getRun`                                     |
| `get_task_result`       | `get_task_run`          | read                       | `getRunStatus` (+ terminal result/artifacts) |
| `list_task_feedback`    | `list_task_feedback`    | read                       | `listFeedback`                               |

- `get_task_result` is the **result-polling tool** that Phase 4 keys the `*_async` variants off of; naming (`get_task_result` vs `get_task_run`) is finalized here.
- Tool descriptions/JSON-shapes reuse the public schemas; the registry is the single place a capability becomes an MCP tool (the REST route→capability map from Phase 1 lives separately — same ids, different surface).

### 4. Sync run-and-wait (bounded)

- New shared helper (e.g. `services/public-mcp/run-wait.ts` or a method on `public-task-api-service`): given a freshly-queued `runId`, **poll `taskService.getRunById`** on a short interval until status is terminal or a **conservative constant timeout** is hit (there is no completion event bus; the monitor writes terminal state to the DB). On terminal → return result text + artifact summary; on timeout → return `{ taskId, runId, status }` with guidance to poll `get_task_result`.
- Phase 4 replaces the constant with a **settings-driven cap** and adds the `*_async` variants; this helper is written so Phase 4 only swaps the timeout source.
- **Proxy-timeout caveat:** the bounded wait must sit under any reverse-proxy idle timeout; default conservatively and document it.

### 5. MCP result projection (no-leak, artifacts summary)

- New shared schema `mcpTaskRunResultSchema` in `public-api.ts` (or a sibling `public-mcp.ts`): the `publicTaskRunStatus` fields **plus** an `artifacts` summary array of `{ title, description?, type }` — **no `link`, storage key, or path** (the `file` artifact `link` is a workspace-relative path and must not be exposed). Real shareable/displayable/downloadable URLs are added in **Phase 6**; Phase 2 returns titles/types/count only. This keeps sync tools useful without leaking storage internals.

---

## Task breakdown (implementation order)

1. Guard: add the `/api/public/mcp` auth special-case (validate + attach token, skip capability lookup) + unit coverage.
2. Public MCP service (`mcp/public/service.ts`): transport/session scaffolding cloned from cc-managed, token-driven tool listing.
3. Public MCP registry (`mcp/public/registry.ts`): capability→tool map for the read/write tools, wired to `public-task-api-service`.
4. Sync run-and-wait helper + `mcpTaskRunResultSchema`; wire `task_run` / `task_template_run` / `get_task_result`.
5. Route module `routes/public-mcp.ts` + registration in `routes/index.ts`; service instantiation mirrors `cc-managed-mcp.ts` (reuse `context.taskExecutionService` etc.).
6. Surface the connection details (endpoint URL + "use a token with these capabilities") in the API page **Endpoints** tab (`EndpointsTab.tsx`) — light, optional-but-recommended.
7. Tests (below).

---

## Testing

- **Auth:** no token → 401; valid token → `initialize`/`tools/list` succeed; `tools/list` returns **only** capabilities enabled on the token; a tool call for a disabled capability → MCP error (not silently allowed); revoked token → 401 on next request.
- **Read tools:** each maps to the right `public-task-api-service` call and returns the public projection (assert no agent id / prompt / path leaks in `structuredContent`).
- **Sync tools:** `task_run` on a run that reaches terminal quickly returns result + artifact summary; on timeout returns `{ taskId, runId, status }` + poll guidance. `get_task_result` returns terminal result/artifacts.
- **Transport:** stateless POST request/response round-trip via the SDK; malformed JSON-RPC handled; `GET`/`DELETE` behave like cc-managed.
- Follow existing MCP/service test style; add a focused integration test that drives the endpoint through the MCP client if that harness exists for cc-managed.

---

## Edge cases & risks

- **`reply.hijack()` + guard ordering:** the guard runs before the handler and may throw 401 cleanly (no hijack yet). Confirm the public-MCP route sits in the `/api/public/` branch and never falls through to origin/CSRF checks meant for browser routes.
- **Stateless transport = no server-push progress.** Long sync waits hold one open POST; keep the bounded timeout conservative (real fix in Phase 4). Document the proxy-idle-timeout interaction.
- **No-leak discipline** in `structuredContent` and artifact summaries — mirror the `public-task-api-service` guarantees; add assertions.
- **Capability drift:** if a capability id exists in Phase 1 but has no MCP tool yet (or vice-versa), the registry must fail loudly at construction (assert every registered tool's capability exists in the catalog), echoing cc-managed's `assertCompanionPromptMetadataInSync`.
- **Service wiring duplication:** `cc-managed-mcp.ts` already builds task/execution/conversation services; reuse `context.taskExecutionService` / `context.taskService` where present to avoid double instantiation and divergent monitors.
- **Body limit / attachments:** Phase 2 tools take text + metadata; set the 14 MB limit now so Phase 3 file args need no route change.

---

## Dependency on Phase 1

Phase 2 cannot ship before Phase 1 because:

- **Authorization source:** per-tool gating uses Phase 1's resolved token capabilities (`tokenHasCapability`) and the shared capability catalog. The pre-Phase-1 model only knows `templates`/`tasks` scopes — too coarse to gate individual MCP tools.
- **Capability ids:** the registry binds each MCP tool to a Phase 1 capability id (surface-agnostic, one toggle governs REST + MCP). These ids don't exist until Phase 1.
- **Enforcement seam:** the guard change here (skip capability lookup for the MCP path, defer to per-tool checks) assumes Phase 1's `capabilityForPublicRoute` refactor is already in place.

**Recommended sequencing:** land Phase 1 (schema + migration + service + enforcement + UI), then Phase 2. If parallelizing, Phase 2 work can begin against the Phase 1 branch once the shared capability catalog + `tokenHasCapability` are merged, even before the Phase 1 UI is finished.

---

## Out of scope for Phase 2 (deferred)

- **Templates as dynamic MCP tools** + per-template gating → Phase 3.
- **Configurable sync-wait cap** + auto-exposed `task_run_async` / `task_template_run_async` (gated on `get_task_result` being enabled) → Phase 4.
- **Per-token execution audit** (which token ran what) → Phase 5.
- **Artifact display/download URLs** in the sync result (dual URLs, validity, gating) → Phase 6. Phase 2 returns artifact title/type summaries only.

---

## Open questions (resolve during build, non-blocking)

1. Endpoint path: `/api/public/mcp` (chosen) vs. `/mcp`; MCP server display name/version string.
2. Serve a `.well-known` MCP/OAuth descriptor for broader client compatibility, or stay PAT-header-only for v1? (Recommend PAT-only now; revisit.)
3. Conservative default for the Phase 2 bounded sync-wait constant (seconds) — pick a value safely under common proxy idle timeouts; Phase 4 makes it a setting.
4. Should `create_task` / `schedule_task` / `enable`/`disable` (non-run writes) be in the initial MCP surface, or trim Phase 2 to read + run tools and add management tools alongside Phase 3? (Recommend include; they're thin `public-task-api-service` pass-throughs.)
