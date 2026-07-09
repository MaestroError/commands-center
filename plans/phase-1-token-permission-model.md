# Phase 1 — Token Permission Model Overhaul (unified per-capability)

**Status:** Detailed plan for review (not yet approved). Authored 2026-07-08.
**Parent roadmap:** [public-mcp-tasks-and-token-permissions.md](public-mcp-tasks-and-token-permissions.md) (Phase 1).
**Goal:** Replace the coarse two-scope API-token model (`templates` / `tasks`) with **explicit per-capability toggles**, grouped by the same two groups as presets. One toggle governs a capability across **both** the REST public API and the (future) public MCP server. Scaffold — but don't yet surface — per-template toggles. Ship with zero disruption to existing tokens.

---

## Decisions locked in (from review)

1. **One toggle per capability (surface-agnostic).** A capability like "Trigger template" is a single switch that governs both its REST endpoint and its MCP tool. The catalog is a flat list of capabilities grouped into `templates` / `tasks`.
2. **Groups are presets, not storage.** Selecting a group turns on all capabilities in it; the user can expand the group and toggle individual capabilities (mirrors the specialist edit page). Persisted state is the **resolved set of enabled capability ids** — group "checked" state is derived in the UI.
3. **Scaffold per-template toggles now, build the UI in Phase 3.** Phase 1 adds the `templates` storage slot + back-compat, but the per-template list UI and its gating land in Phase 3 when templates-as-tools exist.
4. **Lazy back-compat, no data backfill.** Existing tokens keep working by mapping their legacy `scopes_json` to capabilities **at read time**. Rollback-safe; no migration of existing rows.
5. **Tokens are editable in place.** Phase 1 adds a permission-edit flow (`PUT /api/api-tokens/:id`) so an operator can retune a token's capabilities without rotating the secret / reconfiguring the client. The secret is never re-revealed on edit.
6. **Presets are overlapping id-lists.** A "group" is both a display grouping _and_ a named preset (id-list) that a checkbox bulk-selects. Presets may overlap: the `Tasks` preset **includes** `list_task_templates` (preserving the old `either` behavior), even though that capability displays under the Templates group. Selecting either preset enables it.

---

## Current state (verified in codebase)

| Concern                                                                                        | Where                                                                                                            |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Scope enum `["templates","tasks"]`, record/input schemas                                       | `packages/shared/src/schemas/api-tokens.ts`                                                                      |
| Mint/list/revoke/validate; strict-write / lenient-read scope handling                          | `packages/backend/src/services/api-token-service.ts` (`validateInputScopes`, `deserialiseScopes`, `mapApiToken`) |
| Token table (`scopes_json` TEXT)                                                               | `packages/backend/src/db/schema/api-tokens.ts`                                                                   |
| REST enforcement: `(method, pathname) → templates \| tasks \| either`, then `hasRequiredScope` | `packages/backend/src/lib/owner-auth-guard.ts` (`scopeForPublicRoute`, `validatePublicApiBearer`)                |
| Token routes (create/list/revoke)                                                              | `packages/backend/src/routes/api-tokens.ts`                                                                      |
| Create form (scope checkboxes + Board convenience), badges, reveal, revoke                     | `packages/frontend/src/pages/ApiPage.tsx`                                                                        |
| Frontend query/mutation hooks + HTTP client                                                    | `packages/frontend/src/hooks/use-api-tokens-query.ts`, `packages/frontend/src/lib/api/settings.ts`               |
| UX reference: collapsible group + per-tool `Switch` with Enabled/Disabled labels               | `packages/frontend/src/components/specialists/SpecialistForm.tsx`                                                |
| Endpoints doc copy referencing "scope"                                                         | `packages/frontend/src/components/api/EndpointsTab.tsx`                                                          |

**The full REST public surface today** (each becomes one capability). Note the current `either` nuance on the template-list endpoint:

| Capability id           | Group     | Method + path                                    | Legacy scope |
| ----------------------- | --------- | ------------------------------------------------ | ------------ |
| `list_task_templates`   | templates | `GET /api/public/v1/task-templates`              | either       |
| `trigger_task_template` | templates | `POST /api/public/v1/task-templates/:id/trigger` | templates    |
| `get_task_run`          | templates | `GET /api/public/v1/task-runs/:runId`            | templates    |
| `enable_task_template`  | tasks     | `POST /api/public/v1/task-templates/:id/enable`  | tasks        |
| `disable_task_template` | tasks     | `POST /api/public/v1/task-templates/:id/disable` | tasks        |
| `list_specialists`      | tasks     | `GET /api/public/v1/specialists`                 | tasks        |
| `create_task`           | tasks     | `POST /api/public/v1/tasks`                      | tasks        |
| `list_tasks`            | tasks     | `GET /api/public/v1/tasks`                       | tasks        |
| `get_task`              | tasks     | `GET /api/public/v1/tasks/:id`                   | tasks        |
| `trigger_task`          | tasks     | `POST /api/public/v1/tasks/:id/trigger`          | tasks        |
| `schedule_task`         | tasks     | `POST /api/public/v1/tasks/:id/schedule`         | tasks        |
| `list_task_runs`        | tasks     | `GET /api/public/v1/tasks/:id/runs`              | tasks        |
| `get_task_run_detail`   | tasks     | `GET /api/public/v1/tasks/:id/runs/:runId`       | tasks        |
| `list_task_feedback`    | tasks     | `GET /api/public/v1/tasks/:id/feedback`          | tasks        |

(The signed artifact download `GET /api/public/v1/task-artifacts/download/:shareId` stays token-exempt — it has its own signed-link auth and is bypassed before bearer validation. Not a capability.)

---

## Target design

### 1. Capability catalog (shared, single source of truth)

New shared module, e.g. `packages/shared/src/schemas/api-token-catalog.ts` (exported via `schemas/index.ts`):

```ts
export type ApiTokenCapabilityGroup = "templates" | "tasks";

export interface ApiTokenCapability {
  id: string; // stable, e.g. "trigger_task_template"
  group: ApiTokenCapabilityGroup;
  label: string; // "Trigger template"
  description: string; // one-liner for the UI
}

export const API_TOKEN_CAPABILITIES: readonly ApiTokenCapability[] = [
  /* table above */
];
export const API_TOKEN_CAPABILITY_GROUPS = ["templates", "tasks"] as const;

// Presets are named, possibly-overlapping id-lists a group checkbox bulk-selects.
// The Tasks preset intentionally INCLUDES list_task_templates (old `either`
// behavior) even though that capability displays under the Templates group.
export const API_TOKEN_PRESETS: Record<ApiTokenCapabilityGroup, readonly string[]> = {
  templates: ["list_task_templates", "trigger_task_template", "get_task_run"],
  tasks: [/* all tasks-group ids */ "list_task_templates"],
};
```

- **Capability ids are strings validated against the catalog at runtime** — NOT a Zod enum. This lets Phase 2–4 add MCP-served capabilities and Phase 3 add per-template entries without a schema/migration churn (honors the roadmap's "enumerate dynamic entries without a schema change" principle).
- **Presets ≠ storage.** A capability's `group` drives _display_; the preset id-lists drive _bulk selection_ and may overlap. Persisted state is always the flat resolved `capabilities[]` (see §3), so overlap adds no storage complexity. Deriving a preset's "checked/indeterminate" state = "are all of its ids on".
- The catalog carries no route/regex data (that's backend-only, below) so it stays isomorphic and safe to import in the frontend.

### 2. Backend route → capability map (backend-only)

New `packages/backend/src/lib/public-api-capabilities.ts` (or fold into `owner-auth-guard.ts`): the same regexes that `scopeForPublicRoute` uses today, but returning a `capabilityId | undefined`. This is the one place that knows HTTP paths. The MCP registry (Phase 2) will map `capabilityId → mcp tool name` in its own module — same capability id, different surface.

### 3. Storage + schema

- **Migration:** add nullable `permissions_json TEXT` to `api_tokens` via `pnpm --filter @cc/backend db:generate` (review SQL, update `meta/` + `_journal.json` as generated; never hand-edit). Keep `scopes_json` for lazy back-compat reads. No backfill.
- **Shared schema** (`api-tokens.ts`):

  ```ts
  export const apiTokenPermissionsSchema = z.object({
    capabilities: z.array(z.string().min(1)).default([]),
    templates: z.array(z.string().min(1)).default([]), // scaffold; empty until Phase 3
  });
  ```

  - `apiTokenRecordSchema`: replace `scopes` with `permissions: apiTokenPermissionsSchema`.
  - `createApiTokenInputSchema`: `{ name, permissions }` with a refine requiring ≥1 capability (or ≥1 template, once Phase 3 lands).
  - `updateApiTokenInputSchema`: `{ name?, permissions }` — for the in-place edit flow (decision #5). Name is optionally editable; the secret is never touched.
  - Retain a **service-internal** legacy scope reader (do not re-export the old enum broadly).

### 4. Service (`api-token-service.ts`)

- `createToken(name, permissions)`:
  - Validate every `capabilities[]` id against `API_TOKEN_CAPABILITIES` (reject unknown → `BadRequestError`), dedupe, and store in catalog order for deterministic display.
  - Persist `permissions_json`; write `scopes_json = "[]"` (**fail-closed on rollback** — see edge cases).
- `updateToken(id, { name?, permissions })` (**new, decision #5**): same validation as create; rewrites `permissions_json` (+ `scopes_json = "[]"`); returns the updated record **without** re-revealing the secret. `404` for unknown/revoked ids.
- `mapApiToken(row)` — **resolution order:**
  1. If `permissions_json` present → parse with `apiTokenPermissionsSchema`, then **drop unknown capability ids** (forward-compat, same spirit as today's `deserialiseScopes`).
  2. Else derive from legacy `scopes_json`:
     - `templates` → all `templates`-group capabilities.
     - `tasks` → all `tasks`-group capabilities **plus `list_task_templates`** (preserves the old `either` access).
     - `templates: []`.
- New helpers: `tokenHasCapability(record, capabilityId)` and `tokenHasTemplate(record, templateId)` (used by enforcement + Phase 2/3).

### 5. Enforcement (`owner-auth-guard.ts`)

- Replace `scopeForPublicRoute` with `capabilityForPublicRoute(method, pathname)`; delete `PublicApiScopeRequirement` / `hasRequiredScope` / the `either` branch. Route→capability is 1:1; the preset overlap for `list_task_templates` lives only in the UI/back-compat mapping, not here.
- `validatePublicApiBearer`: resolve capability → `404` if the path isn't a known public route; `403` if the token lacks the capability.
- **Attach-order tweak (pulled forward from Phase 5):** move `request.apiToken = tokenRecord` to **immediately after token validation**, _before_ the capability check, so a `403` still carries the token identity (lets Phase 5 audit "token attempted X without permission"). Harmless now, avoids re-touching the guard later. Keep the signed-download bypass untouched.

### 6. Token routes (`routes/api-tokens.ts`)

- Add `PUT /api/api-tokens/:id` → `updateToken` (owner-authed, same as the other token routes), response = the updated `ApiTokenRecord` (no secret). Existing GET/POST/DELETE stay.

### 7. Frontend (`ApiPage.tsx` + hooks + client)

- Import `API_TOKEN_CAPABILITIES` / groups / `API_TOKEN_PRESETS` from `@cc/shared`.
- **Create + edit form** (shared component) around the group/expand pattern:
  - Per group: a header checkbox checked when all preset ids are on, indeterminate when partial, bulk-toggling the preset. An expandable list of capabilities, each a `Switch` with Enabled/Disabled label (reuse the `SpecialistForm` idiom / existing `Switch`).
  - A single top-level **"Select all / none"** replaces the old "Board" label.
  - **Edit:** each `TokenCard` gets an "Edit permissions" action opening the same form pre-filled from the token's resolved `permissions`; submitting calls `PUT`. No secret is shown on edit.
- **Badges/summary** (`ScopeBadges` → `PermissionBadges`): show a preset name when its id-list is fully enabled, otherwise "N capabilities". Update `TokenCard` "Permissions" metric.
- **Types/client:** update `use-api-tokens-query.ts` (add an `update` mutation) and `lib/api/settings.ts` (`createApiToken`, new `updateApiToken`, `createApiTokenInputSchema.parse`) to the `{ name, permissions }` shape.
- **Template toggles:** not rendered this phase (scaffold only). Leave a clearly-marked seam.
- **EndpointsTab copy:** update "Scope: …" language to the new capability/permission wording (cosmetic).

---

## Task breakdown (implementation order)

1. Add the shared capability catalog + presets + exports; unit-test integrity (unique ids, valid groups, every preset id exists in the catalog).
2. Shared schema changes (`apiTokenPermissionsSchema`, record, **create + update** inputs) + type exports.
3. Drizzle migration for `permissions_json`; regenerate + verify metadata/journal.
4. Service: `createToken` + `updateToken` validation, `mapApiToken` resolution (new + legacy), helpers.
5. Backend route→capability map + enforcement rewrite + **attach-order tweak** in `owner-auth-guard.ts`; add `PUT /api/api-tokens/:id`.
6. Frontend: catalog-driven create+edit form, edit action on the card, badges, hooks (`create`+`update`), client types, EndpointsTab copy.
7. Tests (below) + `EndpointsTab.test.tsx` / `ApiPage.test.tsx` updates + shared test-token helper (see edge cases).

---

## Testing

- **Service:** legacy `scopes:["tasks"]` resolves to tasks-group caps **+ `list_task_templates`**; legacy `["templates"]` → templates caps; new `permissions_json` round-trips; unknown capability id rejected on create/update and silently dropped on read; ≥1-capability requirement; `updateToken` rewrites permissions without changing the secret and `404`s on unknown/revoked ids.
- **Enforcement:** every row of the capability table → allow when enabled, `403` when not, `404` for unknown paths; signed download still bypasses; a legacy tasks-only token can still `GET task-templates`; a `403` request has `request.apiToken` attached (attach-order tweak).
- **Frontend:** preset select-all + indeterminate state, individual toggle, badge summary, create payload shape, **edit** pre-fill + `PUT` round-trip. Update existing `ApiPage.test.tsx`.

---

## Edge cases & risks

- **The `either` endpoint** (`list_task_templates`) — the single biggest back-compat trap. Covered by (a) the legacy-`tasks` mapping including it, and (b) the `Tasks` preset including it for new tokens. Assert both with dedicated tests.
- **Record shape change** (`scopes` → `permissions`) touches `ApiTokenRecord` consumers: `ApiPage.tsx` badges/reveal, `EndpointsTab`, and many tests. All owner-internal; enumerate and update together.
- **Test blast radius (decided):** ~20 backend route tests mint a token to authenticate (`public-api.test`, `task-artifact-sharing.test`, `api-tokens.test`, `owner-auth-guard.test`, `server.test`, …). Introduce/point them at **one shared token-mint test helper** taking `permissions` so the create-shape change is a single-file update, not 20.
- **Rollback safety (decided — fail-closed):** new/edited tokens write `scopes_json = "[]"`, so a rolled-back build sees "no scopes" and fails **closed** (403s until re-mint) rather than crashing. A legacy-scope _projection_ was rejected because on downgrade it would **broaden** privileges (a token limited to only `trigger_task` would regain the full `tasks` scope) — a security regression. Fail-closed is the safe choice.
- **Forward-compat:** unknown capability ids must be dropped on read (like `deserialiseScopes` today) so Phase 2–4 tokens don't break an older reader.
- **Determinism:** store capabilities in catalog order; keeps badges/tests stable.
- **Knip / dead code:** removing the old scope enum + `hasRequiredScope` may flag unused exports — clean up in the same change.

---

## Out of scope for Phase 1 (deferred)

- Serving any MCP tool (Phase 2) — Phase 1 only defines capability ids the MCP registry will later attach to.
- Per-template toggle **UI** and gating (Phase 3) — storage slot only here.
- `*_async` derived capabilities (Phase 4).
- Per-token audit log (Phase 5).

---

## Resolved before implementation

- **Token editing:** in scope for Phase 1 (`PUT /api/api-tokens/:id`, secret preserved). _(review answer)_
- **`list_task_templates` preset behavior:** included in **both** presets (overlap), preserving today's `either` behavior for new tokens. _(review answer)_
- **Rollback strategy:** fail-closed (`scopes_json = "[]"`), not legacy projection (security). _(edge-case decision)_
- **"Board" control:** replaced by a single "Select all / none" + per-preset checkboxes. _(edge-case decision)_
- **Record shape:** `scopes` → `permissions` (owner-internal API only). _(edge-case decision)_
- **Phase 5 attach-order tweak:** done here to avoid re-touching the guard. _(cross-phase)_

## Open questions (non-blocking — finalize during build)

1. Exact label/description copy for each capability (affects catalog + EndpointsTab) — product wording, drafted during implementation.
2. Whether "Edit permissions" is an inline expander on the `TokenCard` or a modal (pure UX; mirror the create form either way).
