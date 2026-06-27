# Documents Module With Milkdown

## Goal

Add a first-class Documents domain for shared project context. Documents are markdown files stored under the portable workspace folder `Documents/`, edited by humans through a Milkdown WYSIWYG editor, discoverable through the app sidebar and global search, mentionable through existing `#` composer flows, and discoverable/creatable by specialists through the CommandsCenter default MCP server.

The module must preserve the workspace portability rule: markdown content lives only in the workspace filesystem. SQLite stores derived metadata and runtime indexes only.

## Product Scope

- Add a `Documents` section to the main left sidebar.
- When the sidebar is expanded, show a tree of folders and markdown documents under `workspace/Documents`.
- Allow creating folders and markdown documents from the expanded sidebar tree.
- Open a document into a dedicated Documents page with a Milkdown editor in the center.
- Use the existing `WorkspaceLayout` right context pane pattern for document info and actions.
- Store document metadata in SQLite: author, title, relative path, description, timestamps.
- Never store markdown content in SQLite.
- Add default MCP tools for specialists:
  - list project documents with relative path, full path, title, and short description.
  - register or create a project document with title, short description, and path relative to `Documents/`.
- Support documents added outside the UI/MCP path by deriving title from filename and description from the first 200 characters of the markdown file.
- Include documents in `#` mention search in chat/task composers and in centralized global search.

## Milkdown Notes

Milkdown is a plugin-driven WYSIWYG markdown editor framework. Its docs position `@milkdown/crepe` as the quickest production-ready entry point and `@milkdown/kit` as the lower-level custom build path. Because CommandsCenter needs a polished markdown editor quickly while retaining theme control, start with `@milkdown/crepe`, lazy-load the editor surface, and wrap/override Crepe styles with existing theme classes and CSS variables.

References:

- https://milkdown.dev/
- https://milkdown.dev/docs/guide/getting-started

## Assumptions

- The canonical folder name is exactly `Documents` under `config.paths.workspaceDir`.
- The module handles `.md` and `.markdown` files as documents. New UI/MCP-created files default to `.md`.
- Persist `relative_path`, not absolute path, in SQLite. Full paths are derived from the active workspace at response time to keep the database cache portable.
- `author` is optional. UI-created documents use `operator`; MCP-created documents use the calling specialist slug unless an explicit author is supplied.
- Existing `#` mention semantics remain workspace-relative, so selecting `Documents/design.md` inserts the same path form used by generic files.
- Deleting and moving documents are not required for the first slice unless added during implementation review. Metadata editing, content editing, and create folder/document are in scope.

## Acceptance Criteria

- On startup, `workspace/Documents` exists.
- The main sidebar includes a `Documents` section.
- With the sidebar expanded, the `Documents` section can expand/collapse and display the folder/document tree from `workspace/Documents`.
- Hidden folders/files, `node_modules`, and non-markdown files are excluded from the Documents tree.
- A human can create a folder from the Documents tree.
- A human can create a markdown document from the Documents tree with title, optional short description, and path.
- Opening a document navigates to the Documents page and loads its current markdown content from disk.
- Editing and saving in Milkdown writes markdown content to the filesystem only.
- The right context pane shows relative path, full filesystem path, title, short description, author, timestamps, and save/metadata actions.
- Title and short description are editable without rewriting document content.
- If a markdown file is added directly under `Documents/`, the app lists it without requiring a DB row.
- Bypassed documents display filename-derived title and first-200-character description until metadata is explicitly saved.
- SQLite contains document rows for discovered or registered documents, but no markdown body/content column exists.
- `cc_default` exposes tools to list and register/create documents.
- `list_project_documents` returns relative path, full path, title, and short description for all markdown documents under `Documents/`.
- `register_project_document` creates a missing markdown file or updates metadata for an existing file without overwriting existing content.
- `#` mention popovers in chat and task prompt composers surface matching documents.
- Selecting a document mention produces a workspace-relative path like `#Documents/design.md`.
- Global search shows matching documents as a dedicated result group and opens them in the Documents page.
- Existing generic file search behavior remains intact.
- Backend unit/route tests cover document service, route validation, metadata fallback, path traversal rejection, and MCP tools.
- Frontend tests cover sidebar document tree, create document/folder, editor page loading, metadata panel, global search, and composer mentions.
- E2E coverage opens the app, creates a document, edits content in Milkdown, mentions it from a composer, and reopens it after navigation.
- Final verification runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, and relevant Playwright tests.

## Implementation Plan

### 1. Shared Schemas and Types

- Add `packages/shared/src/schemas/documents.ts`.
- Export it from `packages/shared/src/schemas/index.ts`.
- Define schemas for:
  - `DocumentMetadata`
  - `DocumentTreeNode`
  - `DocumentListResponse`
  - `DocumentReadResponse`
  - `CreateDocumentInput`
  - `CreateDocumentFolderInput`
  - `UpdateDocumentMetadataInput`
  - `SaveDocumentContentInput`
  - `SearchDocumentsResponse`
  - MCP tool output shapes if reused by backend tool tests.
- Reuse `fileManagerFileRevisionSchema` for optimistic save conflict detection.
- Keep `title`, `description`, and `author` nullable or optional at persistence boundaries, but expose effective display values in read/list responses.

Verify:

- Shared schema tests validate path rules, optional metadata, markdown extension handling, and response shapes.

### 2. Runtime Path and Workspace Bootstrap

- Add `documents: resolve(workspaceDir, "Documents")` to `RuntimeConfig["paths"]["subdirectories"]`.
- Let `bootstrapRuntimePaths` create the folder automatically with the existing subdirectory loop.
- If a one-time filesystem migration is needed later, follow `skills/write-filesystem-migration/SKILL.md`; for this first slice, folder bootstrap should be enough because there is no old source path to transform.

Verify:

- Runtime config tests cover the derived Documents path.
- Startup/bootstrap tests assert the Documents folder is created.

### 3. Database Schema and Migration

- Add `packages/backend/src/db/schema/documents.ts`.
- Export it from `packages/backend/src/db/schema/index.ts`.
- Proposed table: `documents`
  - `id text primary key`
  - `relative_path text not null unique`
  - `author text`
  - `title text`
  - `description text`
  - `created_at integer timestamp_ms not null`
  - `updated_at integer timestamp_ms not null`
  - `last_seen_at integer timestamp_ms not null`
- Do not add any content/body column.
- Generate migration with `pnpm --filter @cc/backend db:generate`.
- Review generated SQL and Drizzle metadata for duplicate/stale changes before keeping it.

Verify:

- Migration appears with SQL and meta snapshot updates.
- DB tests assert schema migration succeeds from an empty database.

### 4. Backend Documents Service

- Add `packages/backend/src/services/document-service.ts`.
- Responsibilities:
  - Resolve the Documents root.
  - Normalize document-relative paths to POSIX-style workspace paths.
  - Reject absolute paths, `..`, empty segments, hidden control paths, and non-markdown document paths.
  - Scan `Documents/` recursively for folders and markdown files.
  - Build a sorted tree with folders first, then documents.
  - Upsert discovered markdown files as derived DB rows with nullable metadata.
  - Delete or mark stale rows whose files no longer exist. Prefer deletion because SQLite is a cache.
  - Read document content from disk with revision metadata.
  - Save document content to disk with optimistic revision checks.
  - Create folders.
  - Create documents and parent folders when requested.
  - Update metadata without touching content.
  - Compute fallback title from filename.
  - Compute fallback description from the first 200 text characters after stripping leading heading syntax where simple and safe.
- Keep content reads capped similarly to file manager text editor limits.
- Reuse existing `BadRequestError`, `ConflictError`, `ForbiddenError`, and `NotFoundError` patterns.

Verify:

- Unit tests cover tree scanning, fallback title/description, metadata upsert, content save conflict, create folder, create document, existing document registration, and traversal rejection.

### 5. Boot Reconciliation

- Add `documentReconciler` using the existing `WorkspaceReconciler` pattern.
- Register it in `start-server-runtime.ts` after settings/MCP/secrets and before services that may expose document metadata.
- The reconciler scans `Documents/`, upserts document rows, and removes rows for missing files.
- Because the DB is derived cache, reconciler failure should log and allow boot to continue like existing reconcilers.

Verify:

- Reconciler tests cover empty Documents folder, external markdown file discovery, stale row cleanup, and idempotency.

### 6. Backend Routes

- Add `packages/backend/src/routes/documents.ts` and register it in `routes/index.ts`.
- Endpoints:
  - `GET /api/documents/tree`
  - `GET /api/documents/search?query=...`
  - `GET /api/documents/:encodedPath` or query-based `GET /api/documents/file?path=...`
  - `POST /api/documents`
  - `POST /api/documents/folders`
  - `PATCH /api/documents/metadata`
  - `PUT /api/documents/content`
- Prefer query/body `path` fields over path params to avoid slash encoding complexity.
- Return full paths only in API responses that need them. Persist relative path only.

Verify:

- Fastify inject tests cover success and validation failures for each endpoint.
- Route tests assert response schemas parse and content is not returned from list/search endpoints.

### 7. MCP Tools

- Add `packages/backend/src/mcp/cc-managed/groups/cc-default/tools/document-tools.ts`.
- Define:
  - `list_project_documents`
  - `register_project_document`
- Add metadata to the `cc_default` catalog in `server-registry.ts`.
- Add tool definitions to `defaultTools` when `db` and `config` are available.
- Tool behavior:
  - `list_project_documents` calls the document service, returns structured `documents`.
  - `register_project_document` validates a path relative to `Documents/`, creates the markdown file if missing, upserts metadata, and returns the created/registered document.
  - Existing content is never overwritten.
  - Calling specialist slug becomes default author.

Verify:

- MCP unit tests cover list output, create missing document, register existing document, invalid paths, and no content overwrite.

### 8. Search Integration

- Extend shared global search schemas with a `documentMatches` array, or add `searchDocuments` and merge it in the frontend. Prefer extending the existing search response only if it does not make generic file search consumers awkward.
- Backend document search should match:
  - relative path
  - title
  - description
  - author
  - optional markdown content snippets, if performance is acceptable with `opencodeService.findText` limited to `Documents/`.
- Global search UI adds a `Documents` group.
- Document primary action opens `/documents?path=<Documents-relative-path>`.
- Secondary action can reveal the same file in File Manager using `Documents/<relative-path>`.
- Avoid duplicating the same document prominently under both Documents and Files where practical. If both appear, Documents should rank first.

Verify:

- Global search tests cover path, title, and description matches.

### 9. Mention Integration

- Extend `FileMentionPopover` to search documents along with files when no specialist-specific file search is active.
- Return options with a lightweight kind: `document`, `file`, `directory`.
- Display document title first and `Documents/<path>` as secondary text.
- Keep `onSelect(path)` returning workspace-relative path: `Documents/<relativePath>`.
- Update chat/task composer tests to assert document mention options and selected chips.
- Leave specialist-scoped search behavior intact. If a delegated specialist is selected and file search is limited to that specialist workspace, do not mix global Documents unless product review decides documents are globally mentionable even in delegated feedback.

Verify:

- Chat and task composer mention tests cover document search and selection.

### 10. Frontend API Client and Query Keys

- Add document API functions to `packages/frontend/src/lib/api.ts`.
- Add schema-driven parsing for all responses.
- Add query keys to `packages/frontend/src/lib/query-keys.ts`.
- Use React Query for tree/search/read metadata; use mutations for create/update/save.

Verify:

- API client tests cover URL/query construction and request bodies.

### 11. Main Sidebar Documents Tree

- Add `Documents` route metadata in `packages/frontend/src/app/routes.tsx`, likely `/documents`.
- Add a `DocumentsSidebarSection` used by `AppShell`.
- In expanded sidebar:
  - Show a collapsible Documents header with a `FileText` or `BookOpenText` lucide icon.
  - Show create folder and create document icon buttons with tooltips.
  - Render the document tree with stable row heights and truncation.
  - Folder click expands/collapses.
  - Document click navigates to `/documents?path=<relativePath>`.
- In collapsed sidebar:
  - Show a single Documents nav icon.
- Keep styling on existing theme classes: `bg-sidebar`, `bg-surface`, `text-text-primary`, `text-text-secondary`, `border-border`, `accent`.

Verify:

- `WorkspaceLayout` and `AppShell` tests cover expanded/collapsed sidebar behavior and navigation.

### 12. Documents Page and Milkdown Editor

- Add `packages/frontend/src/pages/DocumentsPage.tsx`.
- Use `WorkspaceLayout`.
- Primary pane:
  - Empty state when no document is selected.
  - Lazy-loaded Milkdown/Crepe editor when a document is selected.
  - Dirty state and save action.
  - Conflict state if revision changed on disk.
- Right context pane:
  - Info tab: title, description, author, relative path, full path, timestamps.
  - Actions tab: save content, save metadata, reveal in file manager, copy paths, create sibling document/folder if useful.
- Add a separate `MilkdownDocumentEditor` component that isolates Milkdown lifecycle:
  - dynamic imports for `@milkdown/crepe` and CSS.
  - create editor on mount.
  - destroy editor on unmount.
  - update editor when selected document changes.
  - surface markdown changes to parent.
- Theme Milkdown through CSS variables and wrapper classes rather than hard-coded palette values.
- Keep Milkdown out of the initial app bundle where practical.

Verify:

- Component tests cover loading, empty state, metadata edits, save button state, and conflict UI.
- Add targeted manual or Playwright smoke for editor rendering because rich text editors are hard to unit test fully.

### 13. File Manager Interop

- Use existing File Manager APIs or route helpers where possible for reveal/open-location actions.
- Document full workspace path is `Documents/<relativePath>` for file-manager handoff.
- Dragging a document from the Documents tree may set `application/x-cc-file-mention` with `Documents/<relativePath>` after the core slice is stable.

Verify:

- Tests assert reveal action builds the expected File Manager URL.

### 14. Dependency Changes

- Add Milkdown dependencies to `packages/frontend/package.json`.
- Start with:
  - `@milkdown/crepe`
- Add lower-level `@milkdown/kit` only if Crepe cannot satisfy save/read/theming requirements.
- Check bundle impact and lazy-loading before finalizing.

Verify:

- Lockfile updates are intentional.
- Production build confirms Milkdown is split from the initial route where possible.

### 15. Test Matrix

- Shared:
  - document schemas.
  - global search schema changes.
- Backend:
  - document service.
  - document routes.
  - document reconciler.
  - MCP document tools.
  - migration test.
- Frontend:
  - API client.
  - sidebar tree.
  - Documents page.
  - global search.
  - FileMentionPopover.
  - ChatComposer and TaskPromptComposer integration.
- E2E:
  - create folder.
  - create document.
  - edit content in Milkdown.
  - update metadata.
  - search document.
  - mention document in chat/task composer.
  - reload/reopen and verify filesystem-backed content remains.

## Suggested File Map

Backend:

- `packages/shared/src/schemas/documents.ts`
- `packages/backend/src/db/schema/documents.ts`
- `packages/backend/src/services/document-service.ts`
- `packages/backend/src/routes/documents.ts`
- `packages/backend/src/mcp/cc-managed/groups/cc-default/tools/document-tools.ts`
- `packages/backend/test/services/document-service.test.ts`
- `packages/backend/test/routes/documents.test.ts`
- `packages/backend/test/mcp/cc-managed/document-tools.test.ts`

Frontend:

- `packages/frontend/src/pages/DocumentsPage.tsx`
- `packages/frontend/src/components/documents/DocumentsSidebarSection.tsx`
- `packages/frontend/src/components/documents/DocumentTree.tsx`
- `packages/frontend/src/components/documents/MilkdownDocumentEditor.tsx`
- `packages/frontend/src/components/documents/DocumentInfoPane.tsx`
- `packages/frontend/src/components/documents/DocumentCreateDialog.tsx`
- `packages/frontend/src/components/documents/DocumentFolderDialog.tsx`
- `packages/frontend/src/components/documents/*.test.tsx`

## Implementation Order

1. Add shared schemas and runtime Documents path.
2. Add DB schema and generated migration.
3. Build document service and reconciler with backend tests.
4. Add document API routes and client functions.
5. Add MCP document tools and tests.
6. Add global search backend/frontend integration.
7. Extend mention popover and composer tests.
8. Build sidebar Documents tree and creation dialogs.
9. Build Documents page with metadata panel.
10. Add lazy Milkdown editor and save flow.
11. Add E2E coverage.
12. Run lint, typecheck, tests, and targeted E2E.

## Risks and Decisions to Revisit

- Milkdown API surface: Crepe is fastest, but if save/change extraction or theme control is awkward, switch the editor component to `@milkdown/kit` while preserving the page/service contracts.
- Search duplication: Documents are also workspace files. Decide during UI review whether generic file search should exclude `Documents/` markdown files or allow duplicate File and Document results.
- Delegated specialist mentions: decide whether `#` search scoped to a selected specialist should still include global Documents.
- Rename/delete: not included in the first acceptance slice. Add only if product review says "manage context" requires it immediately.
- Author semantics: current plan uses optional text. If later we need strong provenance, add `author_type` and `author_id` in a follow-up migration.
- Concurrent edits: the plan relies on file revision checks. If users and agents frequently edit the same docs, add richer conflict diffing later.
