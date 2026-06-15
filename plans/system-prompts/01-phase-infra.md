# Phase 1 — Infra: System Prompt Service

Build the backend foundation: code-shipped prompt definitions, the variable
catalog + renderer, workspace persistence with default fallback, the
`SystemPromptService`, and a filesystem migration. **No chat/task wiring and no
UI yet** — those are Phases 2 and 3. This phase ships with full unit coverage and
a CRUD API the later phases consume.

Read [`00-overview.md`](00-overview.md) first for the shared contract.

---

## Deliverables

1. `packages/backend/src/system-prompts/` service module (see overview tree).
2. Four code-shipped definitions (`identity`, `global-chat`, `global-task`,
   `additional`) with default bodies and declared variables.
3. Variable catalog + `{{ VAR }}` renderer.
4. Workspace persistence (read with default fallback, save, reset).
5. `resolveAll()` (used by Phase 2/3) — implemented and unit-tested now.
6. Shared Zod schemas + types in `packages/shared`.
7. CRUD API routes for definitions & bodies (`GET`/`PUT`/`DELETE`).
8. Filesystem migration `0003-create-system-prompts-directory`.
9. Tests for everything above (≥95% coverage on new files).

---

## Tasks

### 1.1 — Types & definitions

- [ ] `system-prompts/types.ts`: `SystemPromptScope`, `SystemPromptDefinition`,
      `SystemPromptRenderContext`, `ComposedSystemPrompt`, `ResolvedSystemPrompt`
      (see shapes in overview).
- [ ] `system-prompts/definitions/<id>.ts` × 4. Each exports a
      `SystemPromptDefinition` with an inline `defaultBody` template literal.
  - `identity.ts` — order 10, scope `both`, danger, vars
    `[APP_NAME, SPECIALIST_NAME, SPECIALIST_SLUG, SPECIALIST_ROLE,
SPECIALIST_INSTRUCTIONS, CURRENT_DATE]`. Default body introduces the
    specialist by name/role and embeds `{{ SPECIALIST_INSTRUCTIONS }}`.
  - `global-chat.ts` — order 20, scope `chat`, danger, vars
    `[APP_NAME, WORKSPACE_DIR, CURRENT_DATE, CC_DEFAULT_TOOLS, CONVERSATION_ID]`.
    Default body describes the CC environment + `cc_default_*` tools for chat.
  - `global-task.ts` — order 20, scope `task`, danger, vars as global-chat plus
    `[TASK_ID, TASK_TITLE, TASK_RUN_ID]`. Default body covers task-run behaviour
    and references `{{ TASK_RUN_ID }}`.
  - `additional.ts` — order 30, scope `both`, **not** danger, **optional**,
    `defaultBody: ""`, vars = full catalog (user may use anything).
- [ ] `definitions/index.ts`: `export const systemPromptDefinitions = [...]`
      sorted by `order`; helper `getDefinition(id)`.
- [ ] Validate at module load (test): unique ids, valid scopes, every declared
      variable exists in the catalog, `workspaceRelativePath` under
      `configuration/system-prompts/` and ends in `.md`.

### 1.2 — Variable catalog & renderer

- [ ] `system-prompts/variables.ts`: a `Record<string, { label; description;
resolve(ctx): string }>` for every variable in the overview catalog.
      Resolvers read from `SystemPromptRenderContext`; task vars return `""` when
      `ctx.task` is absent. `CC_DEFAULT_TOOLS` renders a static list of
      `cc_default_*` tool names + one-line descriptions (source of truth: keep
      the list beside `workspace-contract.ts`'s `TASK_RUN_TOOL_PERMISSION_DENIES`
      so they stay in sync — add a shared constant if helpful).
- [ ] Export `listVariables()` and `getVariableMeta(id)` for the Settings pills
      (Phase 3) and validation.
- [ ] `system-prompts/render.ts`: `renderTemplate(body, ctx, allowedVars)`.
  - Replace `{{\s*VAR\s*}}` for vars in `allowedVars`.
  - Unknown/`{{ ... }}` left intact (so user typos are visible, not silently
    dropped); log at debug.
  - Pure function, no IO. Heavily unit-tested (missing context, repeated vars,
    adjacent vars, whitespace variants).

### 1.3 — SystemPromptService

`system-prompts/system-prompt-service.ts`, factory
`createSystemPromptService({ config, logger })`:

- [ ] `listDefinitions(): SystemPromptDefinition[]` — registry passthrough.
- [ ] `async getBody(id): { body; isCustomized }` — read workspace file; on
      `ENOENT` return `{ body: defaultBody, isCustomized: false }`. Throws
      `NotFoundError` for unknown id.
- [ ] `async getDefaultBody(id): string`.
- [ ] `async saveBody(id, body): void` — validate (non-empty unless `optional`;
      size cap e.g. 64 KB; ensure dir exists with `mkdir -p`), write
      `<workspaceRelativePath>` atomically (reuse the repo atomic writer used by
      other workspace writes; check `lib/` for an existing helper).
- [ ] `async resetBody(id): void` — `rm` the workspace file (`force: true`).
- [ ] `async resolveAll(scope, ctx, overrides?): ComposedSystemPrompt` — the
      `compose()` from the overview. Returns `{ system, prompts }`.
- [ ] `async listResolved(scope, ctx, overrides?): ResolvedSystemPrompt[]` — like
      compose but keeps disabled/empty entries flagged (for the sidebar/Settings
      preview), each `{ id, title, description, scope, danger, optional, enabled,
isCustomized, renderedBody }`.

Path resolution helper:
`resolve(config.paths.subdirectories.configuration, "system-prompts", "<id>.md")`.
(`configuration` exists in `runtime-config.ts`; the `system-prompts` subdir is
created by the migration in 1.5.)

### 1.4 — Shared schemas + API

- [ ] `packages/shared/src/schemas/system-prompts.ts`:
  - `systemPromptScopeSchema`, `systemPromptDefinitionSchema` (metadata only — no
    `resolve` fns), `systemPromptVariableMetaSchema`,
    `resolvedSystemPromptSchema`, `systemPromptBodySchema` (PUT input),
    `systemPromptListResponseSchema` (definitions + variable catalog).
  - Export inferred types. Add to `schemas/index.ts`.
- [ ] `packages/backend/src/routes/system-prompts.ts` (register in
      `routes/index.ts`):
  - `GET  /api/system-prompts` → definitions (metadata) + variable catalog
    (`{ id, label, description }[]`) + per-prompt `{ isCustomized }`. Powers
    Settings (Phase 3).
  - `GET  /api/system-prompts/:id` → `{ definition, body, defaultBody,
isCustomized }`.
  - `PUT  /api/system-prompts/:id` → save body; returns updated record.
  - `DELETE /api/system-prompts/:id` → reset to default; returns updated record.
  - Conversation-scoped resolution (rendered + toggles) is added in **Phase 2**,
    not here.
- [ ] Wire the service into `start-server-runtime.ts` `RuntimeContext` so routes
      and (Phase 2) `conversation-service` share one instance.

### 1.5 — Filesystem migration

`packages/backend/src/workspace-migrations/migrations/0003-create-system-prompts-directory.ts`,
registered in that folder's `index.ts`. Follow
`skills/write-filesystem-migration/SKILL.md`.

- [ ] `up`: ensure `configuration/system-prompts/` exists (`mkdir -p`).
      Idempotent (no-op if present). Does **not** seed default `.md` files — see
      rationale below.
- [ ] `down`: remove the `system-prompts/` directory **only if empty** (no
      user-saved prompt files); otherwise throw a clear conflict error (never
      delete user edits).
- [ ] Tests per the skill checklist: fresh workspace, already-present dir
      (no-op), re-run no-op, `down` on empty dir, `down` conflict when files
      exist, rebuild path unaffected.

> **Why no seeding.** Seeding default bodies as files would freeze them; later
> improvements to `defaultBody` in code would not reach users. The resolution
> rule (workspace file _or_ shipped default) keeps defaults code-owned and
> improvable, makes "Reset to default" a simple file delete, and stays portable
> (only user edits become files). The migration just guarantees the save
> location exists and is browsable in the file manager. (Rejected alternative:
> seed all four files in `up`.)

---

## Files touched / added

**Added**

- `packages/backend/src/system-prompts/{types,variables,render,system-prompt-service}.ts`
- `packages/backend/src/system-prompts/definitions/{identity,global-chat,global-task,additional,index}.ts`
- `packages/backend/src/routes/system-prompts.ts`
- `packages/backend/src/workspace-migrations/migrations/0003-create-system-prompts-directory.ts`
- `packages/shared/src/schemas/system-prompts.ts`
- Test files alongside each (`*.test.ts`).

**Edited**

- `packages/backend/src/workspace-migrations/migrations/index.ts` (register 0003)
- `packages/backend/src/routes/index.ts` (register routes)
- `packages/backend/src/lib/start-server-runtime.ts` (add service to context)
- `packages/shared/src/schemas/index.ts` (export new schemas)

---

## Tests

- `render.test.ts` — placeholder replacement edge cases.
- `variables.test.ts` — each resolver, empty task context, `CC_DEFAULT_TOOLS`
  output.
- `definitions.test.ts` — registry validation (unique ids, declared vars exist,
  paths well-formed).
- `system-prompt-service.test.ts` — default fallback, save/read round-trip,
  reset, `compose` ordering/scope/empty-drop/toggle behaviour, size & validation
  errors. Use a temp workspace dir.
- `routes/system-prompts.test.ts` — GET/PUT/DELETE happy + error paths.
- `0003-*.test.ts` — migration checklist.

---

## Exit criteria

- `pnpm --filter @cc/backend test` green; new files ≥95% coverage.
- `eslint --fix` + typecheck clean.
- `GET/PUT/DELETE /api/system-prompts` work against a temp workspace; editing a
  body writes `configuration/system-prompts/<id>.md`; delete restores default.
- `compose("chat", ctx)` and `compose("task", ctx)` return correctly ordered,
  variable-rendered strings — proven by unit tests (consumed for real in Phase 2).
