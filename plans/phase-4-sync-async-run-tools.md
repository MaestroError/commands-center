# Phase 4 — Sync/Async Run Tools + Auto-Exposed Async Variants

**Status:** Detailed plan for review (not yet approved). Authored 2026-07-08.
**Parent roadmap:** [public-mcp-tasks-and-token-permissions.md](public-mcp-tasks-and-token-permissions.md) (Phase 4).
**Depends on:**

- **[Phase 1 — Token Permission Model](phase-1-token-permission-model.md)** — async variants are _derived_ from a base tool + the `get_task_result` capability being enabled on the token; no new persisted permission entries.
- **[Phase 2 — Public MCP Server Foundation](phase-2-public-mcp-server-foundation.md)** — provides the bounded sync run-and-wait helper (Phase 4 makes its timeout configurable) and the `get_task_result` result-polling tool that async variants require.
- **[Phase 3 — Templates as MCP Tools](phase-3-templates-as-mcp-tools.md)** — provides the per-template `asyncEnabled` flag and the shared tool-name validation that Phase 4 extends with a reserved `_async` suffix.

See [Dependencies](#dependencies).

**Goal:** Make the session-creating MCP tools' sync wait **configurable** (settings-driven cap instead of the Phase 2 constant), and **auto-expose `*_async` variants** that return a run id immediately for later polling — under precise conditions tied to the `get_task_result` capability and (for template tools) the template's `asyncEnabled` flag.

---

## Decisions locked in (from roadmap review)

1. **Sync tools wait up to a configurable cap, then return the id.** On timeout the run keeps executing (the monitor is unaffected); the tool returns `{ taskId, runId, status }` + guidance to poll `get_task_result`. Runs are **never cancelled** on cap timeout.
2. **Async variants are auto-derived, not user-toggled.** They are exposed by the registry when their conditions hold; there is no separate catalog/permission entry to enable.
   - `task_run_async` / `task_template_run_async` — exposed **iff** the base capability (`trigger_task` / `trigger_task_template`) **and** `get_task_result` are both enabled on the token.
   - `<template>_async` — exposed **iff** `tokenHasTemplate(templateId)` **and** the template's `mcpConfig.asyncEnabled` **and** `get_task_result` are all on.
3. **`_async` suffix, fixed.** The async variant name is the base tool name + `_async` (e.g. `create_linkedin_post_async`). Its description appends a note that it returns an id to poll later.

---

## Current state (verified in codebase)

| Concern                                                                                                                                           | Where                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Phase 2 bounded sync run-and-wait (constant timeout, poll `getRunById` to terminal)                                                               | `packages/backend/src/mcp/public/…` (Phase 2) — Phase 4 swaps the timeout source            |
| Result-polling tool `get_task_result` (maps to `get_task_run` capability; `getRunById` works for any run id)                                      | Phase 2 registry                                                                            |
| File-first settings service pattern: schema + `readConfigFile`/`writeConfigFileAtomic` under `configuration/preferences/`, briefly cached at read | `packages/backend/src/services/task-run-monitor-settings-service.ts`                        |
| Settings GET/PUT route (patch-merge over persisted)                                                                                               | `packages/backend/src/routes/task-run-monitor.ts`                                           |
| Settings surfaced in the UI (monitor timeouts, artifact expiry all live here)                                                                     | `packages/frontend/src/pages/SettingsPage.tsx`, `packages/frontend/src/lib/api/settings.ts` |
| Monitor runtime-config caching (avoid re-reading the file on every poll)                                                                          | `task-execution-service.ts` (`monitorRuntimeCache`)                                         |
| Per-template `asyncEnabled` flag (scaffolded)                                                                                                     | `taskTemplateMcpConfigSchema` (Phase 3)                                                     |
| Shared tool-name validation + reserved-core-names constant                                                                                        | Phase 3 (`deriveMcpToolName`, reserved set)                                                 |
| Preferences dir                                                                                                                                   | `runtime-config.ts` → `configuration/preferences`                                           |

---

## Target design

### 1. Configurable sync-wait cap (settings)

- New shared schema `publicMcpSettingsSchema` (in `schemas/`, exported via index), e.g.:
  ```ts
  export const publicMcpSettingsSchema = z.object({
    // How long a sync session-creating MCP tool holds its response waiting for a
    // terminal run before returning the id for async polling. 0 = no wait
    // (behave like the async variant).
    syncToolWaitCapSeconds: z.number().int().min(0).max(600).default(120),
  });
  ```
- New file-first service `public-mcp-settings-service.ts` cloned from `task-run-monitor-settings-service.ts` (file `configuration/preferences/public-mcp.json`, schema-validated, default on missing).
- New route `GET`/`PUT /api/public-mcp/settings` (owner-authed, **not** a public route) mirroring the monitor settings route (patch-merge). Register in `routes/index.ts`.
- **Caching:** read the cap through a brief cache (mirror `monitorRuntimeCache`) so concurrent sync tools polling every second don't each re-read the file.
- **Default conservative** and clamped (max 600s) so the wait stays under typical reverse-proxy idle timeouts; document the proxy interaction.

### 2. Run-await helper: swap constant → setting

- Refactor the Phase 2 helper to accept a resolved cap (from the settings cache) instead of its constant, and return a discriminated result:
  ```ts
  type RunWaitResult =
    | { kind: "completed"; run: TaskRun }
    | { kind: "timeout"; taskId: string; runId: string; status: TaskRunStatus };
  ```
- Sync tools format `completed` → result text + artifact summary (`mcpTaskRunResultSchema`); `timeout` → `{ taskId, runId, status }` + a `message` telling the client to poll `get_task_result`. Both are **non-error** MCP results.
- `syncToolWaitCapSeconds === 0` short-circuits to an immediate id-return (sync tool behaves like async) — useful for operators behind aggressive proxies.

### 3. Async variant derivation (registry)

In the public MCP session builder (Phase 2/3), after registering a sync session-creating tool, conditionally register its `_async` sibling:

- **Core run tools:** when building `task_run` / `task_template_run`, if `tokenHasCapability(get_task_result)` also holds, register `task_run_async` / `task_template_run_async`.
- **Template tools:** when building a `<template>` tool (already gated by `enabled && exposeAsTool && tokenHasTemplate`), if `template.mcpConfig.asyncEnabled` **and** `tokenHasCapability(get_task_result)`, register `<template>_async`.
- Each `_async` tool: **same input schema** as its base; **description** = base description + `" (async — returns { taskId, runId } to poll later with get_task_result)"`; **execute** = trigger the run and return `{ taskId, runId, status }` immediately (no wait, no artifact gather).
- A small shared factory builds the async definition from a base definition so the two paths (core + template) don't diverge. Derivation is **pure registry logic** — no persisted permission entry, satisfying Phase 1's "accommodate derived/virtual tools" note.

### 4. Reserved `_async` suffix (feeds back into Phase 3 validation)

- Extend the shared reserved-name rules so template `toolName`s **cannot end in `_async`** (that suffix is owned by the derivation), and add `task_run_async` / `task_template_run_async` to the reserved-core-names constant. This prevents a template tool from colliding with any base tool's async sibling.
- Guard at both layers: save-time validation (Phase 3 validator, now suffix-aware) **and** a registry-build assertion (skip + log a dupe rather than letting `tools/list` break).

### 5. UI (settings)

- Add the sync-wait cap control to `SettingsPage.tsx` (mirror the monitor-timeout inputs): a labeled number field with helper text explaining the sync/async tradeoff and the "0 = return id immediately" behavior. Wire `lib/api/settings.ts` + query keys like the existing settings.

---

## Task breakdown (implementation order)

1. Shared `publicMcpSettingsSchema` + types.
2. `public-mcp-settings-service.ts` (file-first) + brief read cache helper.
3. `GET`/`PUT /api/public-mcp/settings` route + registration.
4. Refactor the run-await helper to consume the cap + return the discriminated result; update the sync tools' formatting; handle `cap === 0`.
5. Async-variant factory + conditional registration for core run tools and template tools.
6. Extend shared validation: reserve the `_async` suffix + core async names; registry-build dupe assertion.
7. `SettingsPage.tsx` + client wiring.
8. Tests (below).

---

## Testing

- **Settings:** default on missing file; PUT patch-merge; clamp (min 0 / max 600); cache returns fresh value after update.
- **Sync wait:** run finishing before cap → `completed` (result + artifacts); run exceeding cap → `timeout` with `{ taskId, runId, status }` + poll message, and the run **continues** (assert not cancelled, monitor still advances it); `cap === 0` → immediate id-return.
- **Async derivation matrix:**
  - core: `task_run_async` present iff `trigger_task` **and** `get_task_result` enabled; absent when either off.
  - template: `<t>_async` present iff `tokenHasTemplate` **and** `asyncEnabled` **and** `get_task_result`; toggling any off removes it.
  - async execute returns the id immediately without waiting; `get_task_result(runId)` then returns the terminal result/artifacts.
- **Validation:** template name ending in `_async` rejected; a template named to collide with a base async sibling rejected; registry skips accidental dupes.
- **UI:** settings field renders/persists; extend `SettingsPage.test.tsx`.

---

## Edge cases & risks

- **Cap vs. proxy idle timeout:** the wait holds one open POST (stateless transport, no server push). Keep the default conservative and document; `cap === 0` is the escape hatch for aggressive proxies.
- **Cap vs. monitor lifetime:** the sync cap only bounds how long the _tool_ waits; the monitor's own `taskRunMonitorMaxLifetimeMinutes` still governs the run. They're independent — document that a `timeout` result is not a failure.
- **Async without a way to poll:** if a client uses an `_async` tool but the token later loses `get_task_result`, the returned id becomes un-pollable via MCP (still visible via REST `get_task_run` if that capability is on). Acceptable; note in tool description.
- **Derivation/permission drift:** async siblings must never outlive their base gate — build them strictly from the already-registered base tool set, not from an independent pass.
- **Reserved-suffix coupling** with Phase 3: the `_async` reservation lives in the shared validator so Phase 3 and Phase 4 share one source of truth; assert in a test.

---

## Dependencies

- **Phase 1:** `tokenHasCapability(get_task_result)` is the gate for every async variant; the model already treats async as derived (no new persisted entry).
- **Phase 2:** the run-await helper and `get_task_result` tool exist; Phase 4 only makes the timeout configurable and adds the async factory.
- **Phase 3:** the per-template `asyncEnabled` flag and the shared name validator exist; Phase 4 consumes the flag and extends the validator with the `_async` reservation.

**Sequencing:** Phases 1 → 2 → 3 → 4. The settings service + route + UI (tasks 1–3, 7) are independent of the derivation work (4–6) and can proceed in parallel once the schema lands.

---

## Out of scope for Phase 4 (deferred)

- Per-token execution audit of sync/async runs (which token, sync vs async) → **Phase 5** (Phase 4 just needs to ensure the token identity + async flag are available to the run-creation path for Phase 5 to record).
- Real artifact display/download URLs in sync results → **Phase 6** (Phase 4 keeps the title/type summary from Phase 2).

---

## Open questions (resolve during build, non-blocking)

1. Cap unit: seconds (proposed, finer control near proxy limits) vs. minutes; final default value (proposed 120s) and max (proposed 600s).
2. Settings home: dedicated `configuration/preferences/public-mcp.json` (proposed, matches monitor settings) vs. a single DB setting via `upsertSettingFilefirst` (like the artifact expiry). Recommend the dedicated file for schema clarity and a clean settings route.
3. Should the cap be globally-only (proposed) or also allow a per-template override in `mcpConfig`? Recommend global-only for now; the JSON column leaves room to add a per-template override later without migration.
