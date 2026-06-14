# Plan: Capabilities in `create_specialist` / `update_specialist` (and drafts) via MCP

## Goal

Let specialists configure another specialist's **capabilities** (skills, custom tools, MCP
permissions, app-MCP groups) through the CommandsCenter-managed MCP tools, the same way
the specialist editor page does — **without** the AI having to guess slugs/names.

Two pieces:

1. A **discovery tool** that returns the catalog of currently-available, **enabled**
   capability options (the exact data the editor page uses).
2. **Re-introduce the `capabilities` argument** on the specialist create/update tools,
   validated against the shared schema.

## Hard requirement: it must stay in sync with the editor page automatically

The whole design hinges on **not duplicating** the list of capability dimensions or
options anywhere. There is already a single source of truth for both:

| Concern                                                                           | Single source of truth                                                                                                      | Consumed today by                                           |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Available options** (skills, models, MCP servers, app-MCP groups, custom tools) | `specialistService.getCatalog()` → `GET /api/specialists/catalog` (`specialistCatalogSchema`)                               | Specialist editor page via `useSpecialistCatalogQuery()`    |
| **Capabilities shape** (what a selection looks like)                              | `specialistCapabilitySelectionSchema` (`packages/shared/src/schemas/specialists.ts`, re-exported from `@cc/shared/schemas`) | `specialistService.create/update`, the editor form, the API |

If the discovery tool returns `specialistService.getCatalog()` verbatim and the create/update
tools validate with `specialistCapabilitySelectionSchema`, then **any future change to
capabilities on the editor page** (a new option kind, a new field, a renamed key)
propagates to the MCP tools with zero extra edits. The plan adds guard tests to enforce
this (see [Testing](#testing)).

> ⚠️ Anti-pattern to avoid: hand-writing a parallel catalog or a hand-maintained
> capabilities schema inside the MCP tool layer. That is exactly what would drift.

## Current state (post-refactor)

- `capabilities` was **removed** from `create_specialist` / `update_specialist` / `draft_specialist` /
  `draft_specialist_update` (`packages/backend/src/mcp/cc-managed/groups/cc-specialist-management/tools/specialist-management-tools.ts`). Specialists are created with empty capabilities and configured later in the UI.
- `list_models` (context `both`) already exposes connected-provider model IDs, backed by
  `specialistService.getCatalog().providerModels`. It is the template to follow for the
  discovery tool.
- The editor's capability UI lives in the reusable `SpecialistForm`
  (`packages/frontend/src/components/specialists/SpecialistForm.tsx`) + `@/lib/specialist-capabilities`
  helpers; selection state is `SpecialistFormState.capabilities` (a
  `SpecialistCapabilitySelection`).

## The capabilities shape (`specialistCapabilitySelectionSchema`)

```ts
{
  builtInSkills: string[];        // built-in skill slugs
  workspaceSkills: string[];      // workspace skill slugs
  customTools: string[];          // global custom-tool slugs to copy into the workspace
  mcpServers:  { name, enabled, action: "allow"|"ask"|"deny" }[];        // global MCP servers
  toolPermissions:    { pattern, action }[];                              // tool-level rules
  appMcpServers: { name, enabled, action }[];                            // cc_* groups
  appToolPermissions: { pattern, action }[];                            // per-app-tool rules
}
```

Each dimension maps 1:1 to a catalog list, which is what makes a "fill from catalog"
workflow possible.

## Design

### 1. Discovery tool: `get_specialist_catalog`

- **Group / context:** `cc_specialist_management`, context `both` (mirrors `list_specialists` /
  `list_models`). Lives beside the other non-interactive discovery tools.
- **Implementation:** thin wrapper over `specialistService.getCatalog()`. **Returns only
  enabled / selectable options:**
  - `builtInSkills`, `workspaceSkills` → all (every catalog skill is selectable) — return
    `{ slug, name, description, category }` (drop heavy `detailsMarkdown`/`files`).
  - `providerModels` → as-is (already connected-only).
  - `mcpServers` → **filter `enabled === true`**, return `{ name }`.
  - `appMcpServers` → all registered groups, return `{ name, description, tools: [{ name, description, context }] }`.
  - `customTools` → **filter `enabled === true`**, return `{ slug, name, description }`.
- **Output schema:** derive from `specialistCatalogSchema` (e.g. a `.pick`/transform) so it
  can't silently diverge from the catalog. Text content = a compact human-readable
  summary (counts + slugs), structured content = the full object.
- **Optional `search` keyword** (like `list_models`) to filter by name/slug across
  dimensions — nice-to-have, not required.

### 2. Re-add `capabilities` to the direct tools

In `specialist-management-tools.ts`:

- `createSpecialistToolInputSchema` = `createSpecialistInputSchema` (stop `.omit({ capabilities })`).
- `updateSpecialistToolInputSchema.input` = `updateSpecialistInputSchema` (stop omitting).
- Execute paths simply pass `capabilities` through to `specialistService.create/update`, which
  already validate via `specialistCapabilitySelectionSchema`. **No new validation code.**
- Tool descriptions: instruct the model to call `get_specialist_catalog` first and only use
  slugs/names returned there.

### 3. Drafts (`draft_specialist` / `draft_specialist_update`) — operator review

The draft tools open a live-request review form. Capabilities options:

- **Option A (recommended): reuse the full `SpecialistForm` capability editors in the review
  pane.** `SpecialistForm` is already self-contained and used by the editor page; rendering it
  (dense) for `specialist_create_review` / `specialist_update_review` gives the operator the same
  rich skill/tool/MCP pickers, guaranteeing parity by construction. (We previously
  reverted this for size; revisit now that capabilities is the explicit goal — see
  [Open questions](#open-questions).)
- **Option B (fallback): JSON textarea** for `capabilitiesJson`, with `get_specialist_catalog`
  as the reference the AI pre-fills from. Lower effort, worse operator UX.

Either way, the **AI's** contribution to a draft is optional pre-fill; the operator is the
final authority.

### 4. Validation & error feedback

- Creation/update already rejects unknown shapes via the Zod schema. **Enhancement:**
  before calling `specialistService.create/update`, cross-check provided slugs/names against
  `getCatalog()` and return a helpful error listing valid options when something is
  unknown (e.g. `Unknown custom tool 'foo'. Available: a, b, c`). This keeps the AI from
  silently producing a broken specialist. Implement as one shared helper
  `validateCapabilitiesAgainstCatalog(capabilities, catalog)`.

## "Only enabled" semantics per dimension

| Dimension                   | "Enabled / selectable" rule                 |
| --------------------------- | ------------------------------------------- |
| built-in & workspace skills | every catalog entry (no enable flag)        |
| provider models             | connected providers only (already filtered) |
| global MCP servers          | `enabled === true` in `mcp_servers`         |
| app-MCP groups (`cc_*`)     | all registered, non-system groups           |
| custom tools                | `enabled === true`                          |

## Files to change

- `packages/backend/src/mcp/cc-managed/groups/cc-specialist-management/tools/specialist-management-tools.ts`
  - add `get_specialist_catalog` tool + metadata + `createGetSpecialistCatalogToolDefinition`
  - un-omit `capabilities` on create/update/draft input schemas; thread it through
  - add `validateCapabilitiesAgainstCatalog` helper
- `packages/backend/src/mcp/cc-managed/server-registry.ts`
  - register `get_specialist_catalog` in `cc_specialist_management` (catalog + tools)
- `packages/shared` (only if a trimmed catalog output type is wanted) — prefer deriving
  from `specialistCatalogSchema`.
- Frontend (only if Option A): route `specialist_*_review` kinds to `SpecialistForm` (dense) in
  `LiveRequestReviewForm` + re-add `capabilitiesJson` round-trip.
- Tests: `packages/backend/test/routes/cc-managed-mcp.test.ts`,
  `packages/backend/test/services/specialist-service.test.ts` (catalog snapshot).

## Testing

- **Auto-sync guards (the important ones):**
  - assert `get_specialist_catalog` structured output is parseable by a schema derived from
    `specialistCatalogSchema` (so adding a catalog field forces the tool to surface it).
  - assert the create/update tools accept the full `specialistCapabilitySelectionSchema` shape
    (round-trip a selection built from catalog data and read it back via `list_specialists` /
    `get`).
- `get_specialist_catalog` returns only enabled MCP servers / custom tools (seed one
  disabled + one enabled, assert filtering).
- `create_specialist` with valid capabilities persists them; with an unknown slug returns the
  helpful catalog error.
- Update the `cc_specialist_management` catalog snapshot in `specialist-service.test.ts`.

## Open questions

1. **Draft review UX** — Option A (reuse `SpecialistForm`, rich pickers, heavier pane) vs
   Option B (JSON textarea + `get_specialist_catalog`). Recommend A for create, but it
   re-opens the earlier "review pane too large" concern; may need a dedicated
   wider/scrollable surface.
2. **Strict vs lenient validation** — hard-reject unknown slugs, or drop-with-warning?
   Recommend hard-reject with the catalog error for predictability.
3. **Group placement** — `get_specialist_catalog` in `cc_specialist_management` (with the direct
   create/update tools). Drafts live in `cc_app`; the AI may need the catalog there too —
   either also expose it in `cc_app`, or rely on the operator-driven form for drafts.
