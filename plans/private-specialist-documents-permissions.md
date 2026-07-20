# Private Specialist Documents and Document Permissions | Done

## Goal

Add private per-specialist documents while preserving the existing global project
`Documents/` module.

The final model should support:

- Global project documents at `workspace/Documents/`.
- Private specialist documents at `workspace/specialists/<SPECIALIST_SLUG>/Documents/`.
- Lazy creation of a specialist's private `Documents/` folder only when that
  specialist registers or creates its first private document.
- A Documents UI that shows private specialist document sections only for
  specialists that actually have private documents.
- Specialist prompts that expose the specialist workspace path through a dynamic
  variable and strongly instruct specialists not to change other specialists'
  workspaces unless the user explicitly asks for a specific change.
- API / MCP token permissions that can include global documents and selected
  specialists' private documents.

## Current State

- Specialist workspaces already resolve to `workspace/specialists/<slug>` through
  `resolveSpecialistWorkspacePath()` in
  `packages/backend/src/services/specialist-workspace.ts`.
- Specialist workspace bootstrapping is centralized in
  `packages/backend/src/opencode/workspace-contract.ts` and writes `AGENTS.md`,
  `opencode.jsonc`, and `.opencode/skills`.
- The system prompt variable catalog lives in
  `packages/backend/src/system-prompts/variables.ts`; render context currently
  has `workspaceDir` and specialist name/slug/role/instructions, but not the
  specialist workspace directory.
- The shipped identity prompt in
  `packages/backend/src/system-prompts/definitions/identity.ts` is always sent
  to chat and task runs, so it is the right place for workspace-boundary
  instructions.
- The current documents database table uses one unique `relative_path`, which
  assumes a single global `Documents/` root.
- The current Documents service reads/writes only the global root from
  `config.paths.subdirectories.documents`.
- API-token permissions are capability-based with dynamic string capability ids,
  but token permission payloads currently have only `capabilities` and
  `templates`.

## Design Decisions

1. **Use global/private document scopes.** Do not encode private documents as
   fake paths under the global root. Use an explicit `scope` value:
   `"global"` or `"private"`.
2. **Create private folders lazily.** Do not add a workspace filesystem migration
   that creates empty `Documents/` folders for every specialist. A private folder
   is created only when a private document is registered or created.
3. **Do not show empty specialist document roots.** The Documents UI should only
   render specialist document groups when the specialist has an existing private
   `Documents/` folder with documents or indexed document metadata.
4. **Filesystem remains the source of truth.** Private documents live inside the
   specialist workspace and are recoverable by copying the workspace directory.
5. **DB metadata becomes scoped runtime cache.** Update the `documents` table so
   metadata keys are scoped instead of globally unique by `relative_path`.
   Because SQLite treats `NULL` values as distinct in unique indexes, do not rely
   on a nullable `owner_slug` inside one composite unique index to enforce global
   document uniqueness.
6. **Specialist self tools should default to self workspace.** Internal
   specialist tools can create/list private documents for the current specialist
   without letting one specialist casually target another specialist's private
   document root.
7. **Token private access must be stable across specialist renames.** Token
   permissions should not grant private document access by reusable slug alone.
   Store stable specialist identity for authorization and resolve the current
   slug only when serving a request.

## Recommended Ordering

Implement private specialist documents before public document MCP/API exposure.

Why:

- The public document surface needs stable document identity. If public MCP/API
  is implemented first against only `workspace/Documents/`, the routes, schemas,
  token permissions, and MCP outputs will need a second pass to add private
  document access.
- The current documents DB schema assumes one global namespace. Changing it
  after public tools ship is higher churn because public projections and tests
  would need migration from path-only identity to scoped identity.
- Token permissions for private specialist documents are easier to enforce once
  private documents are represented in the service layer.

Suggested sequence:

1. Implement private specialist document foundations and UI.
2. Add token document permission payloads for global/private access.
3. Implement public MCP/API document tools using the scoped document model.

## Data Model

Update `packages/backend/src/db/schema/documents.ts`:

- Add `scope`: `"global" | "private"`.
- Add nullable `owner_slug` for display/path resolution.
- Add nullable `owner_specialist_id` for stable private document ownership.
- Keep `relative_path` relative to that scope's `Documents/` root.
- Replace global unique `relative_path` with scoped uniqueness that works with
  SQLite `NULL` behavior. Recommended:
  - A partial unique index for global rows on `relative_path` where
    `scope = "global"`, `owner_slug IS NULL`, and
    `owner_specialist_id IS NULL`.
  - A partial unique index for private rows on
    `(owner_specialist_id, relative_path)` where `scope = "private"`.
- Add a check/invariant in service validation:
  - global rows must have `owner_slug = null` and `owner_specialist_id = null`.
  - private rows must have both `owner_slug` and `owner_specialist_id`.

Expected examples:

- Global document:
  - `scope = "global"`
  - `owner_slug = null`
  - `owner_specialist_id = null`
  - `relative_path = "design/overview.md"`
  - filesystem path `workspace/Documents/design/overview.md`
- Private specialist document:
  - `scope = "private"`
  - `owner_specialist_id = "sp_01J..."`
  - `owner_slug = "planner"`
  - `relative_path = "notes/research.md"`
  - filesystem path `workspace/specialists/planner/Documents/notes/research.md`

Create a Drizzle migration for the SQLite schema change. Existing rows migrate
to `scope = "global"`, `owner_slug = null`, and `owner_specialist_id = null`.

## Folder Lifecycle

Do not create private `Documents/` folders during workspace migration or
specialist creation.

Create `workspace/specialists/<slug>/Documents/` only when:

- `register_private_document` creates/registers the first private document for
  the current specialist.
- The owner UI creates a private document for a specialist.
- A private document reconciliation pass discovers an existing private
  `Documents/` folder that was copied in with the workspace.

`list_private_documents` should return an empty list if the folder does not
exist. It should not create the folder as a side effect.

## Backend Document Service

Introduce a document scope type in shared schemas:

- `global`
- `private`

Add a document root resolver:

- global scope -> `config.paths.subdirectories.documents`
- private scope -> resolve the active specialist by stable id, then
  `resolveSpecialistWorkspacePath(...)/Documents`

Never resolve a private root directly from an unvalidated request `owner` value.
If a route accepts `owner` for URL readability, first resolve it to an active
specialist and use the DB row's current id/slug. Then perform the same descendant
check used for file paths against the scoped `Documents/` root.

Shared document DTOs must carry scoped identity wherever a document is returned:

- `scope`
- `ownerSlug` for private documents, otherwise `null`
- `ownerSpecialistId` for private documents in owner/admin API responses,
  otherwise `null`
- `relativePath`

Frontend list/tree keys and route state should use the full scoped identity, not
`relativePath` alone.

Update `DocumentService` APIs to accept scope and simple filtering where needed:

- `getTree({ scope, ownerSpecialistId? })`
- `list({ scopes, filter })`
- `read({ scope, ownerSpecialistId, relativePath })`
- `create({ scope, ownerSpecialistId, path, ... })`
- `createFolder({ scope, ownerSpecialistId, path })`
- `saveContent({ scope, ownerSpecialistId, path, ... })`
- `updateMetadata({ scope, ownerSpecialistId, path, ... })`
- `search({ scopes, query })`
- `upsertFromFilesystem({ scope, ownerSpecialistId, relativePath })`

Service callers may receive or display `ownerSlug`, but root resolution and DB
lookups for private documents should use `ownerSpecialistId` after resolving the
current active specialist row.

List filters:

- `query` optional case-insensitive substring matched against `relativePath`,
  `title`, and `description`.
- `pathContains` optional case-insensitive substring matched against
  `relativePath`.
- `titleContains` optional case-insensitive substring matched against `title`.
- `descriptionContains` optional case-insensitive substring matched against
  `description`.
- `limit` optional result cap, default `50`, maximum `200`.
- `offset` optional zero-based result offset, default `0`.

Apply specific filters together with AND semantics. `query` matches if any of
the searchable fields contains it. Sort deterministically by `relativePath`.

The existing shared-document routes can default to `scope=global` for backward
compatibility.

Reconciler behavior:

- Reconcile the global root independently from private roots.
- Discover private roots only under active specialist workspaces that already
  have a `Documents/` directory.
- Do not create missing private roots during reconciliation.
- Delete stale metadata only within the scoped root currently being reconciled.
  A global reconciliation pass must not delete private rows, and a private
  reconciliation pass for one specialist must not delete another specialist's
  rows.

## Documents UI

Keep `/documents` as the main Documents page, but make document identity scoped.

Recommended URL params:

- Global: `/documents?scope=global&path=design/overview.md`
- Private: `/documents?scope=private&owner=planner&path=notes/research.md`

UI shape:

- Sidebar section has top-level groups:
  - Global Documents
  - Private Documents
- Private Documents expands into specialist names/slugs only when those
  specialists have private documents.
- Creation controls should create under the currently selected group/scope.
- The editor info tab should show scope and owner for private documents.
- "Reveal in File Manager" should point to:
  - `Documents/<path>` for global documents
  - `specialists/<slug>/Documents/<path>` for private documents

Keep existing `/documents?path=...` links working as `scope=global`.

When the UI fetches or caches document data, keys must include `scope`,
`ownerSlug`, and `relativePath`. Private and global documents may legally have
the same `relativePath`.

## Specialist Prompt and Workspace Boundary

Add `SPECIALIST_DIR` to `SystemPromptRenderContext` and
`systemPromptVariables`.

Resolver:

- Return the resolved absolute specialist workspace path when a specialist is in
  context.
- Return an empty string when no specialist is in context.

Update the identity prompt variables list and default body:

- Include `{{ SPECIALIST_DIR }}`.
- State that this is the specialist's own workspace.
- Instruct the specialist:
  - Work inside `{{ SPECIALIST_DIR }}` for private workspace files.
  - Never change another specialist's workspace.
  - Do not suggest or ask to change another specialist's workspace.
  - Only make changes outside the specialist's own workspace when the user
    explicitly asks for the exact location and change.

Also consider updating generated specialist `AGENTS.md` in
`renderOpenCodeWorkspace()` with a short version of the same boundary rule so
tooling that reads workspace-local rules sees it too.

## Internal Specialist MCP Tools

Canonical tool names should use the scope vocabulary from the rest of this plan:

- `list_global_documents`
- `register_global_document`
- `list_private_documents`
- `register_private_document`

Use `global` rather than `project` so the tool names pair directly with
`private` and match `scope=global` plus `documents.global` token permissions.

Recommended tools:

- `list_private_documents`
  - Lists documents under the current specialist's private `Documents/` folder.
  - Returns an empty list when the private folder does not exist.
  - Input parameters:
    - `query` (optional): case-insensitive substring matched against path,
      title, and description.
    - `pathContains` (optional): case-insensitive substring matched against the
      private `Documents/`-relative path.
    - `titleContains` (optional): case-insensitive substring matched against the
      title.
    - `descriptionContains` (optional): case-insensitive substring matched
      against the description.
    - `limit` (optional): maximum number of documents to return. Defaults to
      `50`, maximum `200`.
    - `offset` (optional): zero-based offset for paging through filtered
      results. Defaults to `0`.
  - Output schema:

    ```ts
    {
      documents: Array<{
        scope: "private";
        ownerSlug: string;
        relativePath: string;
        fullPath: string;
        title: string;
        description: string | null;
        author: string | null;
      }>;
      totalMatches: number;
      nextOffset: number | null;
    }
    ```

  - Example output:

    ```json
    {
      "documents": [
        {
          "scope": "private",
          "ownerSlug": "planner",
          "relativePath": "notes/research.md",
          "fullPath": "/workspace/specialists/planner/Documents/notes/research.md",
          "title": "Research",
          "description": "Working notes for the launch plan.",
          "author": "planner"
        }
      ],
      "totalMatches": 1,
      "nextOffset": null
    }
    ```

  - Example output when the private `Documents/` folder does not exist:

    ```json
    {
      "documents": [],
      "totalMatches": 0,
      "nextOffset": null
    }
    ```

- `list_global_documents`
  - Lists documents under the shared workspace `Documents/` folder.
  - Input parameters:
    - `query` (optional): case-insensitive substring matched against path,
      title, and description.
    - `pathContains` (optional): case-insensitive substring matched against the
      global `Documents/`-relative path.
    - `titleContains` (optional): case-insensitive substring matched against the
      title.
    - `descriptionContains` (optional): case-insensitive substring matched
      against the description.
    - `limit` (optional): maximum number of documents to return. Defaults to
      `50`, maximum `200`.
    - `offset` (optional): zero-based offset for paging through filtered
      results. Defaults to `0`.
  - Output schema:

    ```ts
    {
      documents: Array<{
        scope: "global";
        ownerSlug: null;
        relativePath: string;
        fullPath: string;
        title: string;
        description: string | null;
        author: string | null;
      }>;
      totalMatches: number;
      nextOffset: number | null;
    }
    ```

  - Example output:

    ```json
    {
      "documents": [
        {
          "scope": "global",
          "ownerSlug": null,
          "relativePath": "design/overview.md",
          "fullPath": "/workspace/Documents/design/overview.md",
          "title": "Overview",
          "description": "Shared design overview for the project.",
          "author": "planner"
        }
      ],
      "totalMatches": 1,
      "nextOffset": null
    }
    ```

- `register_private_document`
  - Creates/registers a document under the current specialist's private
    `Documents/` folder.
  - Creates the private `Documents/` folder lazily if it does not exist.
  - Input parameters:
    - `path` (required): path relative to the current specialist's private
      `Documents/` folder, e.g. `notes/research.md`. Must be markdown, use `/`
      separators, and live inside at least one folder.
    - `title` (optional): human-readable title for the document.
    - `description` (optional): short description of the document.
    - `author` (optional): author name. Defaults to the calling specialist slug.
  - Output schema:

    ```ts
    {
      scope: "private";
      ownerSlug: string;
      relativePath: string;
      fullPath: string;
      title: string;
      description: string | null;
      author: string | null;
      created: boolean;
    }
    ```

  - Example output when creating a new file:

    ```json
    {
      "scope": "private",
      "ownerSlug": "planner",
      "relativePath": "notes/research.md",
      "fullPath": "/workspace/specialists/planner/Documents/notes/research.md",
      "title": "Research",
      "description": "Working notes for the launch plan.",
      "author": "planner",
      "created": true
    }
    ```

  - Example output when the file already exists and metadata is updated:

    ```json
    {
      "scope": "private",
      "ownerSlug": "planner",
      "relativePath": "notes/research.md",
      "fullPath": "/workspace/specialists/planner/Documents/notes/research.md",
      "title": "Research Notes",
      "description": "Updated planning notes.",
      "author": "planner",
      "created": false
    }
    ```

- `register_global_document`
  - Creates/registers a document under the shared workspace `Documents/`
    folder.
  - Input parameters:
    - `path` (required): path relative to the global `Documents/` folder, e.g.
      `design/overview.md`. Must be markdown, use `/` separators, and live
      inside at least one folder.
    - `title` (optional): human-readable title for the document.
    - `description` (optional): short description of the document.
    - `author` (optional): author name. Defaults to the calling specialist slug.
  - Output schema:

    ```ts
    {
      scope: "global";
      ownerSlug: null;
      relativePath: string;
      fullPath: string;
      title: string;
      description: string | null;
      author: string | null;
      created: boolean;
    }
    ```

  - Example output:

    ```json
    {
      "scope": "global",
      "ownerSlug": null,
      "relativePath": "design/overview.md",
      "fullPath": "/workspace/Documents/design/overview.md",
      "title": "Overview",
      "description": "Shared design overview for the project.",
      "author": "planner",
      "created": true
    }
    ```

- Optional later: full-text document content search. Metadata/path filtering is
  handled by the list tools above.

Avoid allowing arbitrary `ownerSlug` input for self tools. The current
specialist should come from the MCP token/route context.

Administrative tools for managers can be separate later if cross-specialist
access is needed.

## API / MCP Token Document Permissions

Status: planned follow-up. This section is not implemented in the current
private/global owner-facing document slice.

Extend token permission payloads with document access configuration.

Recommended schema shape:

```ts
documents: {
  global: boolean;
  privateSpecialistIds: string[];
}
```

Meaning:

- `global: true` grants global `workspace/Documents/`.
- `privateSpecialistIds: ["sp_...", "sp_..."]` grants only those specialists'
  private document roots.
- Empty/default means no document access even if document capabilities are
  selected.

The token-edit UI can display specialist names/slugs, but persisted permissions
must use stable ids. If a specialist is renamed, the token still grants the same
specialist's current private document root. If a specialist is archived or
deleted, public document tools should fail closed for that private root.

Keep operation capability ids separate from document access configuration:

- `list_documents`
- `search_documents`
- `read_document`

The token decides the accessible document universe. Public tools can offer
optional `scope` / `owner` filters later, but clients should not need to pass a
scope just to retrieve allowed documents.

Frontend API-token UI:

- Add Documents capability group.
- Add document access controls:
  - Global Documents checkbox.
  - Private Documents specialist multi-select/list.
- Disable or hide document access controls unless at least one document
  capability is selected.

Audit target convention for later public tools:

- `targetKind = "document"`
- `targetId = "global:<relativePath>"` or
  `"private:<slug>:<relativePath>"`

## Tests

Backend:

- `register_private_document` creates the private `Documents/` folder lazily.
- `list_private_documents` returns an empty list without creating the folder.
- `list_global_documents` and `list_private_documents` filter by query, path,
  title, and description with case-insensitive substring matching.
- `list_global_documents` and `list_private_documents` apply `limit`/`offset`
  and return `totalMatches` plus `nextOffset`.
- Document DB migration preserves existing document metadata as `scope=global`.
- Document DB uniqueness rejects duplicate global rows for the same
  `relative_path`.
- Document DB uniqueness rejects duplicate private rows for the same
  `owner_specialist_id` and `relative_path`.
- Document service root resolution prevents escaping each scoped root.
- Private document root resolution rejects unknown, archived, or malformed
  owners.
- Global and private documents can have the same relative path without collision.
- Reconciler indexes global documents and existing private document roots.
- Reconciler does not create missing private document roots.
- Reconciler stale cleanup is scoped and does not delete rows outside the root
  currently being reconciled.
- System prompt rendering includes `SPECIALIST_DIR`.
- Identity prompt includes the workspace-boundary rule.
- Internal private document MCP tools operate only on current specialist scope.

Frontend:

- Documents sidebar renders Global Documents.
- Private Documents only shows specialists with private documents.
- Opening old `/documents?path=...` routes to global documents.
- Opening scoped private URLs loads private documents.
- Create/edit actions send the selected document scope.

Verification:

- `pnpm eslint --fix`
- focused backend document/prompt tests
- focused frontend Documents tests
- `pnpm --parallel --filter './packages/*' typecheck`

## Out of Scope

- Cross-specialist private document editing by non-admin specialists.
- Public/API-token document permissions and public document read tools.
- Public document write APIs/tools.
- Per-file ACLs inside a specialist's private Documents folder.
- Binary/non-markdown document support.
- Embeddings/vector search.

## Open Questions

1. Should private documents appear in owner global search by default, or only
   when the user selects a private document filter?
2. Should private `Documents/AGENTS.md` be seeded on first private document
   registration, or is the identity prompt plus generated specialist `AGENTS.md`
   enough?
3. Should public document tools expose archived specialists' private documents?
   Recommended no for token/API access; archived workspaces can remain visible
   only to owner/admin UI flows if needed later.

## Implementation Checklist

This checklist tracks the implemented private/global owner-facing document
slice. Public/API-token document access remains in the follow-up section above.

1. [x] Update shared document schemas with scoped identity, list filters, and
       paged list responses.
2. [x] Update the Drizzle documents schema and generate the SQLite migration.
3. [x] Refactor `DocumentService` to resolve scoped roots, enforce scoped DB
       keys, list with filters/paging, and reconcile global/private roots.
4. [x] Update document routes to accept scoped query/body parameters while
       preserving `/documents?path=...` as global in the owner UI.
5. [x] Replace default document MCP tools with `list_global_documents`,
       `register_global_document`, `list_private_documents`, and
       `register_private_document`.
6. [x] Add `SPECIALIST_DIR` to system prompt rendering and workspace-boundary
       instructions.
7. [x] Update the Documents UI/API wrappers to use scoped document identities and
       show global/private groups.
8. [x] Add owner UI support for creating the first private document for a
       specialist.
9. [x] Add focused backend and frontend tests for scoped documents, MCP filters,
       prompt rendering, and UI routing.
10. [x] Add workspace migration tests for updating document guide MCP tool names.
11. [x] Run `pnpm eslint --fix`, focused tests, and typecheck.

## Follow-Up Checklist

1. [ ] Extend API token permission payloads with document access configuration.
2. [ ] Add public document capability ids (`list_documents`, `search_documents`,
       `read_document`) and enforce them on REST/MCP public document reads.
3. [ ] Add API-token UI controls for global/private document access.
4. [ ] Add public document MCP/API tests and token-audit target coverage.
