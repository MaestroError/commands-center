# Public MCP Documents and Task Template Delivery Controls

## Status and Readiness Assessment

**Status: implemented and hardened after review (2026-07-10).**

The initial implementation is complete. Review hardening added symlink-safe document
traversal, bounded public-search work, fail-closed legacy MCP normalization,
document audit targets, real MCP-client coverage, and the mobile template-edit
regression test.

The document-access direction was correct, but the previous plan was not yet
implementation-ready against the current codebase:

- Private/global document foundations are already implemented. Documents now
  have `scope`, `ownerSlug`, and stable `ownerSpecialistId` identity; the owner
  UI, scoped service methods, database migration, and the four internal
  `*_global_documents` / `*_private_documents` tools already exist.
- API-token permissions still contain only `capabilities` and `templates`, so
  there is no token-authorized document-root universe yet.
- Public REST and public MCP still expose only task/template surfaces.
- Task-template MCP configuration still uses `exposeAsTool` as a master switch
  and `asyncEnabled` as a subordinate switch. Dynamic async tools are currently
  hidden unless the token has the `get_task_run` capability.
- Artifact URL toggles already exist, but file/document artifacts are still
  published to obtain delivery metadata even when both URL toggles are off.

This revision updates those stale assumptions, defines the token authorization
model, and includes the requested task-template sync/async and artifact-delivery
changes.

## Goal

Allow an API/MCP token to read a controlled document universe consisting of:

- the global project `workspace/Documents/` root, when explicitly enabled; and
- selected specialists' private
  `workspace/specialists/<slug>/Documents/` roots, selected per token by stable
  specialist id.

The same delivery slice must also make task-template MCP behavior explicit:

- Sync and async template tools are independently toggleable.
- An enabled async tool is always listed for a token that enables the template;
  result-check permission changes only the immediate response.
- An async override can force a fire-and-forget acknowledgement with no returned
  run identifier.
- A template may return artifact metadata without creating or returning any
  public artifact URL.

## Success Criteria

1. A token can independently grant global documents and any subset of active
   specialists' private document roots.
2. Document list, search, and read never cross the token's authorized roots and
   never expose absolute filesystem paths or stable specialist ids.
3. Public REST and MCP use the same document authorization and projection logic.
4. Sync-only, async-only, sync+async, and neither template-tool configurations
   are all valid and behave as configured.
5. Async tool visibility is independent of `get_task_result`; only its returned
   acknowledgement is capability-aware.
6. When both artifact URL toggles are off, task results contain artifact
   metadata only, no public URLs are created or returned, and artifact publishing
   is not performed for public delivery.
7. Existing token JSON and task-template workspace JSON remain fail-closed and
   backward compatible.

## Current Codebase Baseline

### Documents

- `packages/shared/src/schemas/documents.ts` already defines scoped document
  identity and DTOs.
- `packages/backend/src/services/document-service.ts` already resolves global
  and private roots by stable specialist identity, validates descendant paths,
  lists scoped markdown files, reads up to the existing 5 MiB cap, and omits
  missing private roots without creating them.
- `packages/backend/src/db/schema/documents.ts` already has scoped global/private
  uniqueness.
- Owner routes remain under `/api/documents/*` and may return owner-only fields
  such as `fullPath` and `ownerSpecialistId`; those DTOs must not be reused as
  public responses.
- Internal specialist tools are now:
  - `list_global_documents`
  - `register_global_document`
  - `list_private_documents`
  - `register_private_document`

### Tokens and public surfaces

- `packages/shared/src/schemas/api-tokens.ts` currently persists:
  `{ capabilities, templates }`.
- Capability ids are dynamic strings validated by
  `packages/shared/src/schemas/api-token-catalog.ts`; adding ids does not require
  a database migration.
- REST capability matching is centralized in
  `packages/backend/src/lib/public-api-capabilities.ts`.
- Public MCP tool filtering and per-token session construction live in
  `packages/backend/src/mcp/public/service.ts`.

### Template tools and artifacts

- `packages/shared/src/schemas/task-template-mcp.ts` currently stores
  `exposeAsTool`, `asyncEnabled`, and two artifact URL booleans.
- `packages/backend/src/mcp/public/template-tools.ts` currently always builds the
  sync tool and builds the async sibling only when both `asyncEnabled` and the
  token's result-check capability are true.
- The polling key accepted by `get_task_result` is `runId`, not `taskId`. Any
  pollable async response must therefore return the run id. It may mention the
  task id as context, but the task id alone is insufficient.
- `packages/backend/src/services/artifact-delivery-service.ts` and
  `packages/backend/src/routes/public-artifacts.ts` already share URL delivery
  settings across public REST and MCP results.

## Design Decisions

1. **Read-only documents.** Public REST/MCP will not create, update, or delete
   documents in this slice.
2. **Capabilities and roots are separate.** Operation capabilities answer what
   the token may do; document access configuration answers which roots it may do
   it to.
3. **Stable private authorization.** Persist private document grants by
   specialist id. Slugs are display and request-filter values only.
4. **Fail closed.** Missing document access configuration means no document
   roots. Archived/deleted specialists cease to resolve for public access.
5. **Filters only narrow.** Optional `scope` and owner filters can never expand
   the roots selected on the token.
6. **Public document projection is separate.** Never serialize owner document
   DTOs and then delete fields ad hoc.
7. **Async exposure is template-controlled.** Token result permission does not
   decide whether an enabled async template tool appears.
8. **Fire-and-forget means no identifier from that invocation.** The override
   suppresses task/run ids and polling guidance even when the token has
   `get_task_result`. This does not revoke independent task-list/run-read
   capabilities the same token may also have; an absolute "cannot ever be
   discovered" guarantee would require a separate per-run ACL model and is out
   of scope.
9. **No URL means no public delivery work.** With both artifact URL toggles off,
   do not publish/snapshot an artifact merely for the public result projection.
10. **One shared behavior for REST and MCP results.** Template artifact settings
    apply through the existing shared delivery-context path.

## Token Document Permissions

Extend `apiTokenPermissionsSchema` with a defaulted document access object:

```ts
documents: {
  global: boolean;
  privateSpecialistIds: string[];
}
```

Defaults for legacy/missing data:

```ts
{ global: false, privateSpecialistIds: [] }
```

Rules:

- `global: true` authorizes `workspace/Documents/`.
- `privateSpecialistIds` authorizes only those active specialists' private
  document roots.
- Normalize ids to a unique deterministic order before persistence.
- On token create/update, reject unknown or inactive selected specialist ids.
- Existing tokens whose selected specialist is archived or removed fail closed
  at request time; reading the token record must not crash.
- Selecting roots alone is not an executable permission and does not satisfy the
  existing non-empty token validation.
- If any document capability is selected, require at least one document root.
- If no document capability is selected, normalize document access back to the
  empty default so stale root grants are not retained invisibly.
- No database migration is needed because `permissions_json` is already the
  extensible token payload.

Update token-service helpers so callers do not duplicate authorization logic:

- `tokenHasGlobalDocumentAccess(token)`
- `tokenHasPrivateDocumentAccess(token, specialistId)`
- `resolveTokenDocumentRoots(token)` or an equivalent service-local helper that
  resolves only active specialists and returns stable id plus current slug.

## Public Document Capabilities

Add a `documents` capability group to
`packages/shared/src/schemas/api-token-catalog.ts`:

- `list_documents` — list metadata for documents available to this token.
- `search_documents` — search authorized document metadata and markdown
  content.
- `read_document` — read one authorized document.

Update:

- `API_TOKEN_CAPABILITY_GROUPS`
- `API_TOKEN_PRESETS.documents`
- frontend `GROUP_LABELS`
- capability catalog, legacy-token, validation, and badge-summary tests

## Public Document Schemas

Add `packages/shared/src/schemas/public-documents.ts` and export it from the
shared package public schema surface.

Public identity:

```ts
{
  scope: "global" | "private";
  ownerSlug: string | null;
  relativePath: string;
}
```

Do not expose `fullPath` or `ownerSpecialistId`.

Schemas:

- `publicDocumentSummarySchema`
  - public identity
  - `title`
  - `description`
  - `author`
- `publicDocumentReadSchema`
  - summary fields
  - `content`
  - `revision`
  - `createdAt`
  - `updatedAt`
- `publicDocumentSearchMatchSchema`
  - summary fields
  - `matches[]` with:
    - `kind`: `"metadata" | "content"`
    - `field`: `"relativePath" | "title" | "description" | "author" | "content"`
    - `lineNumber`: nullable positive integer
    - `excerpt`: string
- paged list/search response fields:
  - `documents`
  - `totalMatches`
  - `nextOffset`

Inputs:

- list: optional `scope`, optional `owner`, optional metadata `query`, `limit`,
  `offset`
- search: required `query`, optional `scope`, optional `owner`, optional
  `includeContent` defaulting to `true`, `limit`, `offset`, and
  `maxSnippetsPerDocument`
- read: required `scope` and `path`; `owner` is required only for private scope

Use the existing list limit defaults where practical (`50`, maximum `200`) and
define bounded search defaults/constants in the shared schema.

## Public Document Service

Add `packages/backend/src/services/public-document-api-service.ts`. It receives
`DocumentService` and the active token for each operation and is the only place
that combines token-root authorization with public projections.

### Authorized-root resolution

- Build the root set from `token.permissions.documents`.
- Resolve selected specialist ids to active rows and current slugs.
- For an owner filter, resolve the slug only within that authorized set. Never
  resolve an arbitrary request slug first and then ask whether it is allowed.
- Pass `ownerSpecialistId` to `DocumentService`; use `ownerSlug` only in public
  identity/output.

### `listDocuments`

- List every authorized root by default.
- Apply optional scope/owner filters before scanning.
- Match metadata query against path, title, description, and author.
- Merge roots, sort deterministically by `scope`, `ownerSlug`, then
  `relativePath`, and apply one global offset/limit after merging.
- Return only public summaries.

### `readDocument`

- Require explicit scoped identity.
- Return `404` for a missing or unauthorized identity to avoid disclosing that a
  private document/root exists. A missing operation capability remains `403` in
  the existing auth layer.
- Reuse `DocumentService.read()` for path validation, descendant enforcement,
  active-owner resolution, markdown restriction, and the 5 MiB read cap.
- Project out `fullPath` and `ownerSpecialistId`.

### `searchDocuments`

- Search metadata over path, title, description, and author.
- When `includeContent` is true, read only authorized markdown candidates and
  return bounded, line-numbered excerpts rather than whole file contents.
- Reuse `DocumentService.read()` so oversized files are rejected consistently;
  skip oversized candidates instead of failing the whole search.
- Enforce deterministic caps for candidate documents, total bytes read, result
  count, excerpt length, and snippets per document. Add constants and tests so a
  broad query cannot become an unbounded filesystem scan.
- Deduplicate metadata/content matches into one result per document.

Do not extend the owner-facing `DocumentService.search(query)` to accept token
permissions. Authorization belongs in the public adapter.

## Public REST API

Register read-only routes in a small public-documents route module or alongside
the existing public routes:

- `GET /api/public/v1/documents`
  - capability: `list_documents`
  - optional: `scope`, `owner`, `query`, `limit`, `offset`
- `GET /api/public/v1/documents/search`
  - capability: `search_documents`
  - required: `query`
  - optional: `scope`, `owner`, `includeContent`, `limit`, `offset`,
    `maxSnippetsPerDocument`
- `GET /api/public/v1/documents/read`
  - capability: `read_document`
  - required: `scope`, `path`
  - `owner` required for private scope and forbidden for global scope

Keep the document path in a query parameter because it contains `/`, matching
the owner route pattern. Add the three exact mappings to
`packages/backend/src/lib/public-api-capabilities.ts`.

All handlers obtain `request.apiToken` from the existing public auth guard and
delegate to the public document service. They do not implement a second ACL.

## Public MCP Document Tools

Register static tools with the same capabilities and schemas:

- `list_documents`
- `search_documents`
- `read_document`

MCP argument naming should use `ownerSlug`; REST may retain the shorter `owner`
query parameter and map it at the route boundary.

Requirements:

- Tools are listed only when the token has the matching operation capability.
- Service calls always receive the session token and enforce its document roots.
- Structured content matches the REST public projection.
- Update public MCP server instructions to mention read-only authorized
  documents.
- Extend MCP audit target derivation for read identity:
  - `global:<relativePath>`
  - `private:<ownerSlug>:<relativePath>`
- List/search may use `targetKind: "document"` with a null id or a narrowed
  scope target; never place query content in `targetId`.

## Task Template MCP Configuration

Replace the master exposure model with independently stored controls:

```ts
{
  syncEnabled: boolean;
  asyncEnabled: boolean;
  asyncAlwaysAcknowledge: boolean;
}
```

Keep the existing tool name, descriptions, file arguments, and artifact object.
Defaults:

```ts
{
  syncEnabled: true,
  asyncEnabled: false,
  asyncAlwaysAcknowledge: false
}
```

Valid combinations:

| Sync | Async | Public template tools |
| ---- | ----- | --------------------- |
| off  | off   | none                  |
| on   | off   | `<toolName>`          |
| off  | on    | `<toolName>_async`    |
| on   | on    | both                  |

The template itself must still be active and selected on the token before any
configured tool is exposed.

### Backward compatibility

Task templates are portable workspace files, so existing JSON cannot silently
change behavior. Normalize the legacy shape when parsing:

- legacy `exposeAsTool: true` -> `syncEnabled: true`
- legacy `exposeAsTool: false` -> `syncEnabled: false`
- legacy async is enabled only when both legacy `exposeAsTool` and legacy
  `asyncEnabled` were true, matching current effective exposure
- `asyncAlwaysAcknowledge` defaults to false

New writes use the new fields. Prefer parse-time normalization over a filesystem
migration; if implementation instead requires a filesystem migration, read
`skills/write-filesystem-migration/SKILL.md` before writing it.

Update all current consumers:

- shared stored/input schemas and types
- task-service default/merge/parser logic
- template file reconciliation
- `TaskTemplateFormPage.tsx` and form helpers
- `ApiPage.tsx` template options: show a template when either variant is enabled
- template-card/docs surfaces that currently read `exposeAsTool`
- existing schema, persistence, and frontend tests

The UI should show two peer checkboxes in the task template MCP section:

- Enable sync tool
- Enable async tool

Show `Always return success acknowledgement` only when async is enabled. Explain
that it suppresses the run id from that invocation.

### Async exposure and response matrix

Remove the `get_task_result` condition from dynamic template-tool listing.

| Async override | Token has `get_task_result` | Immediate response                                            |
| -------------- | --------------------------- | ------------------------------------------------------------- |
| off            | yes                         | Registration text containing the `runId` and polling guidance |
| off            | no                          | `Task registered successfully.` with no task/run id           |
| on             | either                      | `Task registered successfully.` with no task/run id           |

Implementation details:

- Triggering remains the same queued background execution path.
- Do not call `runService.getResult()` merely to form an async response.
- Do not return the current full `McpTaskRunResult` from the async template tool.
- The pollable response must say `runId` because `get_task_result` accepts
  `runId`. Do not label it as only a task id.
- The non-pollable and override responses must omit identifiers from both text
  and `structuredContent`.
- Keep sync behavior unchanged: wait up to the configured cap and return the
  result projection, with `timedOut` when appropriate.

This configuration applies to per-template dynamic tools. The generic static
`task_template_run`, `task_template_run_async`, `task_run`, and
`task_run_async` tools are not template-form controls and should not be changed
without a separate product decision.

## Optional Public Artifact URLs

Retain the existing per-template toggles:

- Return displayable URL
- Return downloadable URL

Define the result behavior explicitly:

| Display | Download | Artifact projection                                        |
| ------- | -------- | ---------------------------------------------------------- |
| off     | off      | metadata only; no publish/sign operation and no public URL |
| on      | off      | display URL only                                           |
| off     | on       | download URL only                                          |
| on      | on       | both URLs where supported                                  |

For external `url` artifacts, disabling display must also suppress the external
link from the public projection.

When both are off:

- return safe existing metadata such as title, description, and type;
- omit or return null for `displayUrl` and `downloadUrl` consistently with
  `mcpArtifactSummarySchema`;
- do not call `publishArtifact()` solely for public delivery;
- do not create a signed URL or public snapshot;
- apply the same behavior to MCP results and bearer-authenticated REST run
  results through `buildArtifactDeliveryContext()`.

Non-template task runs keep their current default delivery behavior.

## Frontend and Documentation

### API token UI

Update `packages/frontend/src/pages/ApiPage.tsx`:

- Add the Documents capability group.
- Add a Global Documents checkbox.
- Add a private specialist multi-select using active specialist ids as values
  and names/slugs as labels.
- Show/enable document-root controls only when at least one document capability
  is selected.
- Include document-root coverage in permission summaries without exposing raw
  specialist ids.
- Preserve selections when editing a token and submit normalized permissions.

### Endpoint docs

Update `packages/frontend/src/components/api/EndpointsTab.tsx` and shared public
API docs helpers:

- Add list/search/read REST examples.
- Document matching MCP tools and required capabilities.
- State that list/search default to all roots selected on the token.
- Explain scope/owner filters only narrow access.
- Warn that `?key=` MCP URL-token fallback should use minimal document roots and
  capabilities.

Cross-link `docs/public-mcp-url-token-fallback.md` if that document exists in the
implementation branch; otherwise add the warning to the existing endpoint docs
without inventing a dead link.

## Tests

### Shared and token service

- Legacy token permissions default to no document roots.
- Document access ids are deduplicated and persisted deterministically.
- Unknown/inactive specialist ids are rejected on create/update.
- Document capabilities without a selected root are rejected.
- Removing all document capabilities clears stale document roots.
- Capability catalog and permission badges cover the Documents group.

### Public document service

- Global-only, selected-private-only, mixed, and empty access universes.
- Archived/deleted selected specialists fail closed.
- List defaults to all authorized roots and applies global pagination after
  merging.
- Scope/owner filters narrow but never expand access.
- Metadata search covers path, title, description, and author.
- Content search returns bounded line-numbered excerpts.
- Unauthorized roots are never scanned or returned.
- Oversized files are skipped for content search; explicit read follows the
  existing read-size error contract.
- Public projections omit `fullPath` and `ownerSpecialistId`.
- Unauthorized and missing reads both return not-found behavior.

### REST and MCP documents

- REST returns `401` without a token and `403` without the operation capability.
- Each route/tool succeeds only with both capability and matching root access.
- MCP tool listing follows individual document capabilities.
- REST and MCP structured results have equivalent public projections.
- URL-token MCP auth works with document tools.
- Audit entries use document targets without leaking content or absolute paths.

### Task-template tools

- Legacy MCP config normalization preserves all four currently possible stored
  exposure combinations.
- Sync-only, async-only, both, and neither produce the expected tool names.
- Async remains listed without `get_task_result`.
- Pollable async response contains `runId` when allowed.
- Non-pollable async response contains no identifier.
- Override response contains no identifier even with `get_task_result`.
- Sync behavior and timeout projection remain unchanged.
- Token template selector includes async-only templates.
- Form round-trip persists all new controls.

### Artifact delivery

- Both URL toggles off returns metadata only and does not publish/sign.
- Each single-toggle combination returns only the enabled URL.
- Both on preserves current behavior.
- External URL artifacts do not leak their link when display is off.
- MCP and REST run projections follow the same template settings.
- Non-template task delivery defaults remain unchanged.

## Implementation Order

1. Update shared schemas with token document roots, public document DTOs, and
   backward-compatible template MCP config normalization.
2. Update token service validation/helpers and API token UI.
3. Add the public document service and focused unit tests.
4. Add REST routes/capability mappings and MCP document tools/audit targets.
5. Refactor template dynamic-tool exposure and async acknowledgement behavior.
6. Short-circuit artifact public delivery when both URL types are disabled.
7. Update task-template UI, token template selection, endpoint docs, and tests.
8. Run formatting/linting, focused tests, full tests, and package typechecks.

## Verification

- `pnpm eslint --fix`
- focused shared/backend/frontend tests for every area above
- `pnpm test`
- `pnpm --parallel --filter './packages/*' typecheck`
- `pnpm test:e2e` for API-token and task-template critical UI paths when the
  existing E2E harness covers those screens

## Out of Scope

- Public document create/update/delete.
- Per-file ACLs inside an authorized document root.
- Binary/non-markdown public document search.
- Embeddings/vector search.
- Cross-workspace or arbitrary filesystem reads.
- Absolute prevention of run discovery through other independently granted task
  capabilities.
- Changing generic static task/task-template sync and async tools.
