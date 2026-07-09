# Phase 3 — Task Templates as MCP Tools

**Status:** Detailed plan for review (not yet approved). Authored 2026-07-08.
**Parent roadmap:** [public-mcp-tasks-and-token-permissions.md](public-mcp-tasks-and-token-permissions.md) (Phase 3).
**Depends on:**

- **[Phase 1 — Token Permission Model](phase-1-token-permission-model.md)** — Phase 1 scaffolds the `enabledTemplates` slot on tokens; Phase 3 builds its per-template toggle **UI + gating** (`tokenHasTemplate`).
- **[Phase 2 — Public MCP Server Foundation](phase-2-public-mcp-server-foundation.md)** — Phase 3 registers dynamic per-template tools into the Phase 2 public MCP registry and reuses its sync run-and-wait helper.

See [Dependencies](#dependencies-on-phases-1--2).

**Goal:** Let each task template be exposed as its own MCP tool on the public server (e.g. "Create LinkedIn Post" → `create_linkedin_post`), taking only a `text` argument and (optionally) `files`. Make the tool's name, description, and field descriptions editable through a new **MCP config section** on the template create/edit pages, gated by an explicit per-template "expose" toggle **and** the token's per-template permission.

---

## Decisions locked in (from review)

1. **Two exposure gates.** A template is an MCP tool only when its own **"Expose as MCP tool"** toggle is on (default on) **and** the calling token enables that template. Either gate off ⇒ the tool is not listed for that token. Templates can be kept MCP-invisible regardless of tokens.
2. **Reject name collisions at save.** MCP tool names must be unique across the single public server (Phase 2 core tools + all template tools). A derived/edited name that collides with another template or a reserved core name is rejected on create/edit with a validation error (consistent with `mcp-server-service`'s `ConflictError`). No silent auto-suffixing.
3. **`text` + optional `files`, feeding the shared trigger path.** The tool's `text` becomes the generated run context; `files` (present only when "allow files" is on, default on) become context attachments. Both flow through the existing `triggerTemplateRun`.
4. **Sync now; async variant in Phase 4.** Phase 3 registers the **sync** template tool (reusing Phase 2's bounded run-and-wait). The `asyncEnabled` flag is scaffolded in template config but consumed in Phase 4. Artifact-URL toggles are scaffolded here, consumed in Phase 6.

---

## Current state (verified in codebase)

| Concern                                                                                                                    | Where                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared "create-from-template → attach context → queue" path; accepts `context` (text) + `contextAttachmentUploads` (files) | `packages/backend/src/services/trigger-template-run.ts` (`triggerTemplateRun`)                                                                     |
| File-first template persistence (`configuration/task-templates/<id>.json`) + boot reconciler                               | `packages/backend/src/services/task-service/template-files.ts` (`taskTemplateFileSchema`, `writeTemplateFile`, `taskTemplateReconciler`)           |
| Template CRUD writing file-first then DB                                                                                   | `packages/backend/src/services/task-service/template-ops.ts` (`createTemplate`, `updateTemplate`)                                                  |
| Template table + `permission_profile_json` precedent for a JSON column                                                     | `packages/backend/src/db/schema/tasks.ts` (`task_templates`)                                                                                       |
| Template schemas + create/update inputs                                                                                    | `packages/shared/src/schemas/tasks.ts` (`taskTemplateSchema`, `createTaskTemplateInputSchema`, `updateTaskTemplateInputSchema`)                    |
| Template form (where the MCP config section goes) + form-state helpers                                                     | `packages/frontend/src/pages/tasks/TaskTemplateFormPage.tsx`, `pages/tasks/task-helpers.ts` (`templateToForm`, `formToTemplateInput`, `FormState`) |
| File upload arg shape (base64) reused by triggers                                                                          | `uploadTaskContextAttachmentInputSchema` in `schemas/tasks.ts` (`filename`, `mimeType`, `dataUrl`, `sizeBytes`)                                    |
| Public MCP registry + sync run-and-wait (Phase 2)                                                                          | `packages/backend/src/mcp/public/registry.ts`, `mcp/public/service.ts` (to be created in Phase 2)                                                  |
| Token per-template slot (Phase 1)                                                                                          | `apiTokenPermissionsSchema.templates`, `tokenHasTemplate` (Phase 1)                                                                                |

---

## Target design

### 1. Template MCP config (single JSON column, file-first)

Add one nullable JSON field `mcpConfig` to templates (mirrors the `permissionProfile` precedent — one column, room to grow for Phase 4/6 without another migration). New shared schema in `schemas/tasks.ts`:

```ts
export const taskTemplateMcpConfigSchema = z.object({
  exposeAsTool: z.boolean().default(true), // gate #1
  toolName: z.string().min(1), // MCP-safe, unique (validated in service)
  toolDescription: z.string().trim().default(""), // defaults to template.description if empty
  textFieldDescription: z.string().trim().default(""),
  allowFiles: z.boolean().default(true),
  filesFieldDescription: z.string().trim().default(""),
  asyncEnabled: z.boolean().default(false), // scaffold; consumed in Phase 4
  // scaffold; consumed in Phase 6
  artifacts: z
    .object({
      displayableUrlEnabled: z.boolean().default(true),
      downloadableUrlEnabled: z.boolean().default(true),
    })
    .default({}),
});
```

- Extend `taskTemplateSchema`, `createTaskTemplateInputSchema`, `updateTaskTemplateInputSchema` with an optional `mcpConfig`. When absent on create, default it from the title (see §3).

### 2. Storage, migration, file-first

- **Drizzle migration:** add nullable `mcp_config_json TEXT` to `task_templates` (`pnpm --filter @cc/backend db:generate`; review SQL + `meta/`/`_journal.json`; never hand-edit).
- **File mirror:** add `mcpConfig` (nullable) to `taskTemplateFileSchema` and to both `writeTemplateFile` call sites in `template-ops.ts`; add it to the reconciler payload in `template-files.ts` so a copied workspace restores MCP config (honors the "filesystem is source of truth for portable config" principle).
- `mapTaskTemplate` reads `mcp_config_json`; back-compat: a row/file without it resolves to a default config derived from the title (so existing templates become tools by default unless the operator turns exposure off).

### 3. Tool-name derivation + validation

- **Shared helper** (e.g. `schemas/` or `@cc/shared/lib`) `deriveMcpToolName(title)` → sanitize to `^[a-z][a-z0-9_]*$` (lowercase, non-alphanumerics → `_`, collapse repeats, trim, ensure leading letter, cap length e.g. 64). Used by the form to preview the default and by the service to normalize. "Create LinkedIn Post" → `create_linkedin_post`.
- **Uniqueness/reserved validation in `template-ops.ts`** (`createTemplate`/`updateTemplate`): reject (`ConflictError`/`BadRequestError`) when the normalized `toolName`:
  - collides with another non-deleted template's `mcpConfig.toolName`, or
  - matches a **reserved core tool name** (the Phase 2 registry names: `task_run`, `task_template_run`, `get_task_result`, `list_task_templates`, …). Expose that reserved set as a shared constant so both the registry and this validator use one list.
- Renaming is safe: tokens store `templateId` (Phase 1 `enabledTemplates`), not the tool name, so a rename never breaks a token's permission — only the exposed tool label changes.

### 4. Dynamic tool generation (public MCP registry)

- Extend the Phase 2 public MCP session builder (`mcp/public/service.ts`) so that, after registering the static capability tools, it loads templates and registers **one tool per template** where **all** hold:
  1. `template.enabled` (Active), and
  2. `template.mcpConfig.exposeAsTool`, and
  3. `tokenHasTemplate(request.apiToken, template.id)`.
- Each template tool:
  - **name** = `mcpConfig.toolName`; **description** = `mcpConfig.toolDescription` (fallback to template description).
  - **inputSchema** = `{ text: z.string().describe(textFieldDescription) }` plus, when `allowFiles`, `files: z.array(uploadTaskContextAttachmentInputSchema).optional().describe(filesFieldDescription)`.
  - **execute** = `triggerTemplateRun({ templateId, triggerSource: "api" /* or "mcp" */, context: { text, attachments: [] }, contextAttachmentUploads: files })` → then the Phase 2 **sync run-and-wait** → return the `mcpTaskRunResultSchema` projection (result text + artifact summary; real URLs Phase 6).
- Template tools are gated **solely** by the per-template toggle — independent of the generic `trigger_task_template`/`task_template_run` capability — so a token can be scoped to only specific template tools.
- Consider a `triggerSource` value of `"mcp"` vs. reusing `"api"`; adding `"mcp"` to `taskRunTriggerSourceSchema` cleanly separates MCP-originated runs for Phase 5 audit (small enum + migration-free string). Decide during build (see open questions).

### 5. Files argument

Reuse `uploadTaskContextAttachmentInputSchema` verbatim as the `files[]` item shape (base64 `dataUrl` + `sizeBytes` + `filename` + `mimeType`); the 10 MB/attachment cap and MIME allow-list are enforced downstream by `storeForTask` (same as REST triggers). The Phase 2 route `bodyLimit` (14 MB) already accommodates inline base64.

### 6. Token per-template toggle UI + gating (Phase 1 scaffold → built here)

- **Token create form** (`ApiPage.tsx`): add a **Templates** section listing templates that are MCP-exposed (`mcpConfig.exposeAsTool` on) with a per-template `Switch`, writing into the token's `permissions.templates`. Needs a template list — add a lightweight query (reuse the public/internal template list; only id + title + exposed flag needed).
- **Enforcement:** the registry's gate (§4) calls `tokenHasTemplate`. Deleted/disabled/unexposed templates simply don't register; a stale `templateId` in `enabledTemplates` is ignored gracefully.

### 7. Template form — MCP config section

- New collapsible section in `TaskTemplateForm` (after the Active section), mirroring existing bordered-section styling:
  - "Expose as MCP tool" checkbox (default on) — collapses the rest when off.
  - Tool name input (prefilled with `deriveMcpToolName(title)`; editable; live sanitize hint).
  - Tool description, `text` field description, "Allow files" checkbox (default on) + `files` field description (shown only when allowed).
  - "Enable async" checkbox (default off; helper text notes it needs the result tool — Phase 4).
  - Artifact URL toggles (displayable / downloadable, default on) — scaffold, note "used when sharing artifacts" (Phase 6).
- Wire through `task-helpers.ts` (`FormState` additions, `templateToForm`, `formToTemplateInput`). Surface the save-time collision error inline.

---

## Task breakdown (implementation order)

1. Shared: `taskTemplateMcpConfigSchema`, `deriveMcpToolName`, reserved-core-names constant; extend template schemas.
2. Migration: `mcp_config_json` on `task_templates`; regenerate + verify metadata.
3. Backend: file mirror (`taskTemplateFileSchema`, `writeTemplateFile`, reconciler) + `mapTaskTemplate`; `createTemplate`/`updateTemplate` normalization + uniqueness/reserved validation.
4. Public MCP registry: dynamic per-template tool registration behind the three gates; execute via `triggerTemplateRun` + sync wait.
5. Token UI: per-template toggle section + template list query + `tokenHasTemplate` gating end-to-end.
6. Template form: MCP config section + `task-helpers` wiring.
7. Tests (below).

---

## Testing

- **Schema/derivation:** `deriveMcpToolName` cases (spaces, punctuation, leading digits, length cap); config defaults; back-compat default from title.
- **Validation:** duplicate `toolName` across templates → rejected; collision with a reserved core name → rejected; rename to a free name → ok; tokens keyed by id survive rename.
- **File-first:** create/update writes `mcpConfig` into the template JSON; reconciler restores it; template without the field loads a sane default.
- **Registry gating (matrix):** tool listed iff `enabled && exposeAsTool && tokenHasTemplate`; disabled/unexposed/not-in-token ⇒ absent; two tokens see different template tool sets.
- **Execution:** `text` → run context; `files` → attachments via `storeForTask`; sync result returns result text + artifact summary; `allowFiles=false` ⇒ no `files` arg in schema.
- **Frontend:** MCP config section renders/collapses; default name preview; inline collision error; token per-template toggles persist. Extend `TaskTemplateFormPage`/`ApiPage` tests.

---

## Edge cases & risks

- **Duplicate names at session build:** even with save-time validation, defend the registry against accidental dupes (skip + log) so one bad row can't break `tools/list`.
- **Reserved-name drift:** the reserved set must stay in sync with the Phase 2 registry — single shared constant, asserted in a test.
- **Large inline files:** rely on the existing 10 MB cap + 14 MB bodyLimit; document that MCP clients send base64.
- **Disabled/archived/deleted templates:** never register; stale token `templateId`s ignored.
- **triggerSource choice** (`"mcp"` vs `"api"`) ripples into Phase 5 audit — decide early.
- **Migration churn avoided:** single `mcp_config_json` column holds Phase 4 (`asyncEnabled`) and Phase 6 (artifact toggles) fields, so those phases need no further template migration.

---

## Dependencies on Phases 1 & 2

- **Phase 1** provides `permissions.templates` + `tokenHasTemplate`; Phase 3 builds the per-template UI and the enforcement gate on top. Without it there is no per-template authorization.
- **Phase 2** provides the public MCP endpoint, session builder, capability→tool registry, and the sync run-and-wait helper; Phase 3 plugs dynamic template tools into that registry and reuses the wait helper. Without it there is nowhere to register template tools.

**Sequencing:** land Phase 1 → Phase 2 → Phase 3. Phase 3 frontend (form section) can be built in parallel once the Phase 3 schema lands, independent of the registry work.

---

## Out of scope for Phase 3 (deferred)

- `<name>_async` template-tool variants + the configurable wait cap → **Phase 4** (`asyncEnabled` flag scaffolded here).
- Real artifact display/download URLs in the tool result → **Phase 6** (artifact toggles scaffolded here; Phase 3 returns title/type summaries only).
- Per-token execution audit of template-tool runs → **Phase 5**.

---

## Open questions (resolve during build, non-blocking)

1. Add a dedicated `"mcp"` value to `taskRunTriggerSourceSchema` (cleaner Phase 5 audit) vs. reuse `"api"`? (Recommend adding `"mcp"`.)
2. Should editing the template **title** re-derive the tool name automatically (only when the user hasn't hand-edited it), or leave the stored name untouched after first creation? (Recommend: derive as the default on create; never silently overwrite an edited name.)
3. Max tool-name length and whether to expose a "reset to default" affordance next to the name field.
