# Public MCP Documents Context

## Goal

Expose CommandsCenter documents to external MCP clients and public API callers as
a read-only source of context and source-of-truth material.

This plan depends on the private specialist documents plan:

- [private-specialist-documents-permissions.md](private-specialist-documents-permissions.md)

The public surface should let external agents:

- Discover all documents the token is allowed to see.
- Search document metadata (`path`, `title`, `description`, `author`).
- Search markdown content, scoped strictly to token-authorized document roots.
- Read a specific document by document identity.

## Current State

- Internal Documents module stores global markdown files under
  `config.paths.subdirectories.documents`.
- Planned private specialist documents live under
  `workspace/specialists/<slug>/Documents/`.
- `document-service.ts` already supports global:
  - `getTree()`
  - `list()`
  - `read(relativePath)`
  - `search(query)` for metadata/path fields only
  - create/update methods for the owner UI
- Internal owner routes exist under `/api/documents/*`.
- Global search already includes `documentService.search(query)` as
  `documentMatches`.
- CC-managed specialist tools currently include:
  - `list_project_documents`
  - `register_project_document`
- Public MCP and public REST currently expose task/template surfaces only.

## Design Decisions

1. **Read-only first.** Public MCP/API should not create or mutate documents in
   this phase. Treat documents as source-of-truth context, not externally
   writable state.
2. **Dedicated document permission group.** Add a new `documents` token
   capability group instead of folding document reads into `tasks` or
   `templates`.
3. **Token permissions define the accessible universe.** `list_documents` and
   `search_documents` should return all documents the token is allowed to see by
   default. Clients should not need to know CC's storage model to retrieve
   allowed documents.
4. **Use optional filters only.** Public tools/routes may accept optional
   `scope` (`"global" | "private"`) and `owner` filters when a client wants to
   narrow results, but these filters never grant access beyond the token.
5. **No absolute path leakage.** Public responses should not include `fullPath`;
   expose scoped document identity and metadata.
6. **Scoped full-text search.** Content search is acceptable if it only traverses
   token-authorized global/private document roots, skips hidden/excluded entries,
   enforces limits, and returns snippets rather than whole matching files.
7. **Shared implementation.** REST and MCP should call the same public document
   service helpers so behavior stays aligned.

## Public Capabilities

Add these capability ids to `packages/shared/src/schemas/api-token-catalog.ts`:

- `list_documents`
  - Group: `documents`
  - Label: `List documents`
  - Description: `List documents available to this token.`
- `search_documents`
  - Group: `documents`
  - Label: `Search documents`
  - Description: `Search document metadata and markdown content.`
- `read_document`
  - Group: `documents`
  - Label: `Read document`
  - Description: `Read a specific document.`

Update:

- `API_TOKEN_CAPABILITY_GROUPS` to include `"documents"`.
- `API_TOKEN_PRESETS.documents` to include the three document capabilities.
- `ApiPage.tsx` `GROUP_LABELS` with `documents: "Documents"`.
- Permission badge summarization tests and shared catalog tests.

No DB migration is needed for capability ids because
`permissions_json.capabilities` is dynamic string ids validated against the
catalog. Document access configuration is handled by the private-documents plan.

## Shared Schemas

Add public document schemas, likely in a new
`packages/shared/src/schemas/public-documents.ts` or in `documents.ts` if the
project prefers co-location:

- `publicDocumentIdentitySchema`
  - `scope`: `"global" | "private"`
  - `owner`: nullable specialist slug
  - `relativePath`
- `publicDocumentSummarySchema`
  - identity fields
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
  - `matches`: array of:
    - `kind`: `"metadata" | "content"`
    - `field`: `"relativePath" | "title" | "description" | "author" | "content"`
    - `lineNumber`: nullable number
    - `excerpt`: string
- query/input schemas:
  - list query: optional `scope`, optional `owner`, optional `query`, `limit`
  - search query/input: `query`, optional `scope`, optional `owner`, optional
    `includeContent`, `limit`, `maxSnippetsPerDocument`
  - read query/input: `scope`, optional `owner`, `path`

Prefer public projections that omit `fullPath`.

## Backend Service

Add a public-facing document helper, either:

- `packages/backend/src/services/public-document-api-service.ts`, or
- a clearly named section inside `document-service.ts`.

Recommended methods:

- `listDocuments(options): Promise<PublicDocumentSummary[]>`
  - Receives token document access configuration.
  - Defaults to all token-authorized document roots.
  - Applies optional `scope` / `owner` / metadata query filters.
  - Drops `fullPath`.
- `readDocument(identity): Promise<PublicDocumentRead | null>`
  - Requires explicit `scope` and `path`; `owner` is required for private docs.
  - Verifies the token grants that document root before reading.
  - Drops `fullPath`.
- `searchDocuments(options): Promise<PublicDocumentSearchMatch[]>`
  - Receives token document access configuration.
  - Defaults to all token-authorized document roots.
  - Applies optional `scope` / `owner` filters.
  - Searches metadata over `relativePath`, `title`, `description`, `author`.
  - Searches content over authorized markdown files only.
  - Returns snippets with line numbers, not entire files.
  - Enforces max result count and max snippets per document.

Content-search guardrails:

- Search only `.md` / `.markdown`.
- Search only global/private document roots granted by the token.
- Skip hidden directories/files and excluded directories such as `node_modules`.
- Skip files larger than the existing document read cap.
- Cap total files scanned or total bytes read if needed.
- Escape/normalize paths through existing document path validation.

## Public REST API

Add read-only routes under `packages/backend/src/routes/public-api.ts` or a new
public documents route module registered with the public API routes:

- `GET /api/public/v1/documents`
  - Capability: `list_documents`
  - Query: optional `scope`, optional `owner`, optional `query`, `limit`
  - Default behavior: return all documents allowed by the token.
  - Response: `{ documents: PublicDocumentSummary[] }`
- `GET /api/public/v1/documents/search`
  - Capability: `search_documents`
  - Query: `query`, optional `scope`, optional `owner`, optional
    `includeContent`, `limit`, `maxSnippetsPerDocument`
  - Default behavior: search all documents allowed by the token.
  - Response: `{ documents: PublicDocumentSearchMatch[] }`
- `GET /api/public/v1/documents/read?scope=<global|private>&owner=<slug>&path=<relativePath>`
  - Capability: `read_document`
  - Response: `PublicDocumentRead`

Update `packages/backend/src/lib/public-api-capabilities.ts` route mapping.

Route choice note: use query-param `path` for reading because document paths
contain slashes; this avoids wildcard route ambiguity and mirrors the owner route
`/api/documents/file?path=...`.

## Public MCP Tools

Add public MCP document tools to `packages/backend/src/mcp/public/registry.ts`.

Tool names and descriptions:

- `list_documents`
  - Capability: `list_documents`
  - Description: `List documents available to this token, returning scoped document identity and metadata.`
  - Input:
    - optional `scope`: `"global" | "private"`
    - optional `owner`
    - optional `query`
    - optional `limit`
  - Output:
    - `{ documents: PublicDocumentSummary[] }`

- `search_documents`
  - Capability: `search_documents`
  - Description: `Search document metadata and markdown content across documents available to this token. Optional scope and owner filters can narrow the search.`
  - Input:
    - `query`
    - optional `scope`: `"global" | "private"`
    - optional `owner`
    - optional `includeContent` default `true`
    - optional `limit`
    - optional `maxSnippetsPerDocument`
  - Output:
    - `{ documents: PublicDocumentSearchMatch[] }`

- `read_document`
  - Capability: `read_document`
  - Description: `Read a document by scoped identity and return its markdown content plus metadata.`
  - Input:
    - `scope`: `"global" | "private"`
    - optional `owner`
    - `path`
  - Output:
    - `PublicDocumentRead`

Audit behavior follows existing public MCP audit:

- `surface: "mcp"`
- `action`: tool name
- `capabilityId`: matching document capability
- `targetKind: "document"`
- `targetId`: `global:<relativePath>` or `private:<owner>:<relativePath>`

Extend `deriveMcpTarget()` in `mcp/public/service.ts` to recognize document tool
arguments.

## Frontend / Docs

Update `packages/frontend/src/components/api/EndpointsTab.tsx`:

- Add a Documents section after MCP guidance or after Tasks.
- Show REST examples for list/search/read.
- Mention token capability requirements.
- Mention that list/search default to all document roots granted to the token.
- Mention that `scope=global|private` and `owner=<slug>` are optional filters
  for list/search.
- Mention that `?key=` URL-token auth is a temporary MCP fallback and should use
  minimal document permissions.

Update docs:

- Add or extend docs for public MCP documents.
- Cross-link from `docs/public-mcp-url-token-fallback.md` warning that URL-token
  clients should use narrowly scoped document capabilities and document access.

## Tests

Backend:

- public document service tests:
  - list omits `fullPath`.
  - list returns all token-authorized global/private docs by default.
  - list respects optional `scope` / `owner` filters.
  - metadata search matches title/description/author/path.
  - content search returns line-numbered excerpts.
  - content search stays inside token-authorized document roots.
  - content search does not include unauthorized private specialist docs.
  - large files are skipped or handled according to cap.
- public REST route tests:
  - `401` without token.
  - `403` without required capability.
  - list/search/read succeed with matching capability and document access.
  - list/search omit unauthorized document roots.
  - read unauthorized private document returns `403` or not-found-style response.
  - read missing document returns `404`.
  - public projection does not leak absolute paths.
- public MCP route tests:
  - tools appear only for tokens with document capabilities.
  - `list_documents`, `search_documents`, `read_document` return expected
    structured content.
  - list/search default to all token-authorized document roots.
  - optional filters narrow results without expanding access.
  - content search results include snippets.
  - URL-token auth works for document tools because public MCP auth is
    endpoint-level.

Frontend:

- `ApiPage` / token permission tests for the new Documents group and document
  access controls.
- `EndpointsTab` renders document REST/MCP guidance.

Shared:

- capability catalog test updated for new `documents` group.
- public document schema validation tests if schemas are non-trivial.

Verification:

- `pnpm eslint --fix`
- focused backend tests for documents/public MCP/public API
- focused frontend tests for API token UI and endpoint docs
- `pnpm --parallel --filter './packages/*' typecheck`

## Out of Scope

- Public document create/update/delete.
- Binary document formats beyond markdown in document roots.
- Embeddings/vector search.
- Cross-workspace or arbitrary filesystem search.
- Per-file ACLs inside a document root.

## Open Questions

1. Should public read return the full markdown content always, or add an optional
   max-content/truncation mode for very large docs?
2. Should `search_documents` default `includeContent` to true? Recommended yes
   for MCP agent usefulness, with strict caps.
3. Should the existing internal `list_project_documents` name be mirrored
   publicly, or should public MCP use the shorter `list_documents`? Recommended
   `list_documents` for external clients.
