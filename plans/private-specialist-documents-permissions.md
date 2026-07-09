# Private Specialist Documents and Document Permissions

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
   metadata keys are `(scope, owner_slug, relative_path)` instead of globally
   unique `relative_path`.
6. **Specialist self tools should default to self workspace.** Internal
   specialist tools can create/list private documents for the current specialist
   without letting one specialist casually target another specialist's private
   document root.

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
- Add nullable `owner_slug` for private specialist documents.
- Keep `relative_path` relative to that scope's `Documents/` root.
- Replace global unique `relative_path` with a scoped unique index over
  `(scope, owner_slug, relative_path)`.

Expected examples:

- Global document:
  - `scope = "global"`
  - `owner_slug = null`
  - `relative_path = "design/overview.md"`
  - filesystem path `workspace/Documents/design/overview.md`
- Private specialist document:
  - `scope = "private"`
  - `owner_slug = "planner"`
  - `relative_path = "notes/research.md"`
  - filesystem path `workspace/specialists/planner/Documents/notes/research.md`

Create a Drizzle migration for the SQLite schema change. Existing rows migrate
to `scope = "global"` and `owner_slug = null`.

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
- private scope -> `config.paths.subdirectories.specialists/<slug>/Documents`

Update `DocumentService` APIs to accept scope where needed:

- `getTree(scope, ownerSlug?)`
- `list(scopes)`
- `read({ scope, ownerSlug, relativePath })`
- `create({ scope, ownerSlug, path, ... })`
- `createFolder({ scope, ownerSlug, path })`
- `saveContent({ scope, ownerSlug, path, ... })`
- `updateMetadata({ scope, ownerSlug, path, ... })`
- `search({ scopes, query })`
- `upsertFromFilesystem({ scope, ownerSlug, relativePath })`

The existing shared-document routes can default to `scope=global` for backward
compatibility.

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

Current CC-managed default document tools:

- `list_project_documents`
- `register_project_document`

Recommended additions:

- `list_private_documents`
  - Lists documents under the current specialist's private `Documents/` folder.
  - Returns an empty list when the private folder does not exist.
- `register_private_document`
  - Creates/registers a document under the current specialist's private
    `Documents/` folder.
  - Creates the private `Documents/` folder lazily if it does not exist.
- Optional later: `search_private_documents`.

Avoid allowing arbitrary `ownerSlug` input for self tools. The current
specialist should come from the MCP token/route context.

Administrative tools for managers can be separate later if cross-specialist
access is needed.

## API / MCP Token Document Permissions

Extend token permission payloads with document access configuration.

Recommended schema shape:

```ts
documents: {
  global: boolean;
  private: string[];
}
```

Meaning:

- `global: true` grants global `workspace/Documents/`.
- `private: ["planner", "writer"]` grants only those specialists' private
  document roots.
- Empty/default means no document access even if document capabilities are
  selected.

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
- Document DB migration preserves existing document metadata as `scope=global`.
- Document service root resolution prevents escaping each scoped root.
- Global and private documents can have the same relative path without collision.
- Reconciler indexes global documents and existing private document roots.
- Reconciler does not create missing private document roots.
- System prompt rendering includes `SPECIALIST_DIR`.
- Identity prompt includes the workspace-boundary rule.
- Internal private document MCP tools operate only on current specialist scope.

Frontend:

- Documents sidebar renders Global Documents.
- Private Documents only shows specialists with private documents.
- Opening old `/documents?path=...` routes to global documents.
- Opening scoped private URLs loads private documents.
- Create/edit actions send the selected document scope.
- API token form can select document capabilities and allowed document access.

Verification:

- `pnpm eslint --fix`
- focused backend document/prompt/token tests
- focused frontend Documents/API token tests
- `pnpm --parallel --filter './packages/*' typecheck`

## Out of Scope

- Cross-specialist private document editing by non-admin specialists.
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
3. Should API tokens store private specialist permissions by slug or specialist
   id? Recommended slug because the filesystem path is slug-based and portable,
   but token-edit UI should handle renamed specialists carefully.
