# Global Document Folder Access per API Token

**Status:** Complete. Authored and completed 2026-07-21.

## Goal

Let the owner grant an API token access to selected folders under the global
`Documents/` root without exposing unselected folders or documents.

The completed feature must ensure:

- Selecting a global folder grants that folder and all of its descendants.
- Unselected global documents are omitted from list and search results.
- Direct reads outside the granted folders return the same `404` response as a
  document that does not exist.
- Document creation, when enabled for the token, is limited to granted folders.
- REST and public MCP document operations enforce exactly the same policy.
- The token form shows the global document hierarchy with at most five visible
  folder levels, matching the Documents sidebar limit.
- Existing permission JSON without `globalFolderPaths` receives the schema
  default `[]`; no bespoke token migration or backfill is added.

## Decisions Locked In

1. **Use an allow-list, not allow/deny ACL rules.** A token has full global
   access, selected global folder access, or no global access. There are no
   descendant deny exceptions in this version.
2. **Folder grants are recursive.** A grant for `clients/acme` authorizes paths
   at `clients/acme/*` regardless of how deeply they are nested.
3. **Folder identity is path-based.** Renaming a folder stops the old grant from
   matching. Recreating the same path makes that path accessible again.
4. **Keep private document permissions unchanged.** Selected specialists still
   grant their entire private Documents root. Per-folder private access is out
   of scope.
5. **Enforce access in the backend before filesystem reads.** The UI is only a
   permission editor and is never an authorization boundary.
6. **Use `404` for unauthorized document identities.** This preserves the
   current behavior where callers cannot distinguish inaccessible documents
   from missing documents.
7. **Show at most five folder levels.** A selected folder at level five still
   grants every deeper descendant even though deeper folders are not rendered
   in the token form.
8. **Do not add a database migration.** Token permissions already live in the
   JSON `permissions_json` column.

## Current Foundation to Reuse

- `apiTokenDocumentAccessSchema` already stores whole-global and selected
  private-specialist access in
  `packages/shared/src/schemas/api-tokens.ts`.
- `createPublicDocumentApiService()` is shared by public REST and public MCP, so
  it is the correct enforcement boundary for list, search, read, and create.
- `DocumentService` already validates relative document paths, prevents
  traversal, and rejects symlink traversal for direct reads and folder listings.
- `GET /api/documents/tree` and frontend `getDocumentTree()` already return the
  recursive global document tree to the authenticated owner UI.
- The CC-owned `Checkbox` supports checked and indeterminate states.
- The Documents sidebar currently uses a five-level folder limit.

## Permission Contract

Extend the document access payload:

```ts
documents: {
  global: boolean;
  globalFolderPaths: string[];
  privateSpecialistIds: string[];
}
```

Example:

```ts
documents: {
  global: false,
  globalFolderPaths: ["clients/acme", "knowledge/public"],
  privateSpecialistIds: [],
}
```

Semantics:

- `global: true` grants the complete global Documents root and causes persisted
  `globalFolderPaths` to normalize to `[]`.
- `global: false` uses `globalFolderPaths` as the recursive allow-list.
- `global: false` plus `globalFolderPaths: []` grants no global documents.
- Private roots remain controlled by `privateSpecialistIds`.
- A token with any document capability must have at least one of: full global
  access, a global folder grant, or a selected private specialist root.

Add `globalFolderPaths: z.array(...).default([])` so permission JSON that omits
the field parses as an empty list. Do not add legacy-token branches or a data
backfill.

Use a shared folder-grant path schema that follows the existing portable
document path rules:

- Relative `/`-separated paths only.
- No leading slash, Windows drive prefix, backslash, `..`, empty segment, or
  hidden segment.
- Folder paths must not include a trailing slash.
- At most five path segments, so every persisted explicit grant is editable in
  the five-level UI.

Move the existing numeric folder-depth value to a shared constant rather than
duplicating `5` between the sidebar, schema validation, and access selector.

## Authorization Policy

Add a backend-only pure policy module, for example:

`packages/backend/src/services/document-access-policy.ts`

Responsibilities:

- Normalize global folder paths by trimming, deduplicating, and sorting.
- Remove redundant descendants. If `clients` is granted, discard an explicit
  `clients/acme` grant.
- Perform segment-aware matching:

  ```ts
  candidate === grant || candidate.startsWith(`${grant}/`);
  ```

- Never use a raw prefix such as `candidate.startsWith(grant)`, which would let
  a grant for `sales` expose `sales-private`.
- Answer whether a global document destination is authorized.

Use the same normalization in both token create/update validation and persisted
permission resolution so API responses and authorization see deterministic
values.

Add `create_document` to the set of capabilities that require document access.
The current set includes list/search/read but omits create; folder restrictions
must apply even when create is the token's only document capability.

## Restricted Filesystem Traversal

Do not scan the entire global Documents root and filter the returned metadata
afterward. Unauthorized directories should not be traversed or read while
serving a token request.

Extend `DocumentService` with an internal way to list/search from selected
relative folder roots:

- Resolve each selected folder beneath the scoped Documents root.
- Reuse or extract the symlink-safe directory validation currently used by
  `listFolder()`.
- Treat a missing selected folder as an empty subtree, not as broader access and
  not as a request failure.
- Start recursive collection at each authorized folder while retaining full
  Documents-relative paths in returned records.
- Rely on normalized non-overlapping grants to prevent duplicate results.
- Keep existing deterministic sorting and public search caps.

Full-global and private-root calls keep their current root traversal behavior.

## Public REST and MCP Enforcement

Update `createPublicDocumentApiService()` so each operation uses one resolved
authorization context:

### List

- Full global access lists the existing global root.
- Folder-limited global access lists only the selected subtrees.
- Private roots continue to use selected stable specialist IDs.
- Apply query filters and pagination only after assembling authorized results,
  so counts and offsets reveal nothing about hidden documents.

### Search

- Generate candidates only from authorized subtrees.
- Read markdown content only for authorized candidates.
- Preserve the existing global candidate/read/byte/result limits.

### Read

- Validate that the requested global path is inside a granted folder before
  calling `DocumentService.read()`.
- Return `NotFoundError("Document not found.")` when it is outside the allow-list.
- Preserve the same response for a missing authorized file.

### Create

- Require the new document path to be inside a granted global folder before
  calling `DocumentService.create()`.
- Return a generic `404` for an unauthorized destination.
- Allow creation in any deeper descendant of an authorized folder.

No separate MCP authorization implementation is added. Public MCP document
tools already call the same public document API service used by REST.

## Token Settings UI

Create a focused API-domain component, for example:

`packages/frontend/src/components/api/GlobalDocumentAccessTree.tsx`

Do not reuse `DocumentTreeGroup` directly: the sidebar version owns navigation,
document/folder creation, selected routes, and open-document behavior. The token
selector only owns hierarchical permission selection.

Data and loading:

- Reuse `getDocumentTree()` and `queryKeys.documentTree`.
- Enable the query only while document capabilities are selected and the token
  form is visible.
- Render only the response's global `tree`; ignore `privateTrees` here.
- Show the existing loading and error patterns within the document-access
  fieldset without blocking unrelated token permissions.

Interaction:

- Keep `Global Documents` as the root checkbox.
- Root checked means `global: true`; all rendered descendants appear inherited.
- Root indeterminate means one or more folders are selected while full-global
  access is off.
- Only directory nodes have selectable checkboxes.
- Files may be shown as non-interactive context rows so the owner can understand
  what a folder grant contains.
- Checking a folder adds its path and removes explicit descendant grants.
- Unchecking an explicitly selected folder removes that grant.
- A folder inherited from a selected ancestor appears checked and disabled; the
  owner must uncheck the ancestor to remove inherited access.
- A folder with selected descendants appears indeterminate.
- When full-global access is enabled, submit `globalFolderPaths: []`.
- When document capabilities are removed, clear full-global, folder, and private
  document access before submission.

Depth behavior:

- Treat the global root as level zero.
- Render directory levels one through five.
- Do not render directories or files nested below level five.
- A level-five selection still grants all deeper filesystem descendants.
- If a level-five directory contains deeper content, show concise helper text or
  an accessible label indicating that deeper descendants are included.

Use the CC design system:

- `@/components/ui/checkbox` for checked/indeterminate/disabled behavior.
- Lucide `ChevronRight`, `Folder`, and document icons.
- Semantic Tailwind roles such as `text-text-primary`, `text-text-secondary`,
  `border-border`, and `bg-surface`; no raw palette colors or authored CSS.
- Accessible names, `aria-expanded`, keyboard-operable expand buttons, and
  visible focus states.

Update the help copy from roots/read-specific wording to:

> Select document roots or global folders this token may access. Folder access
> includes all documents and subfolders; unselected folders are hidden.

Update token summaries to distinguish:

- `Global documents` for full access.
- `N global document folders` for folder-limited access.
- Existing private-root summary.

## Implementation Sequence

- [x] **1. Shared permission contract**
  - Add the shared max-depth constant and folder-grant path schema.
  - Add `globalFolderPaths` with default `[]`.
  - Update schema exports, types, fixtures, and schema tests.
  - Verify omitted `globalFolderPaths` parses to `[]` and paths deeper than five
    levels are rejected.

- [x] **2. Token permission normalization**
  - Add the pure access-policy helpers.
  - Normalize global folder paths on create, update, and permission resolution.
  - Include `create_document` in document-capability detection.
  - Update validation so folder-only global access satisfies the required-root
    rule.
  - Verify duplicates, nested redundant grants, invalid paths, full-global
    normalization, and clearing when document capabilities are removed.

- [x] **3. Safe subtree document operations**
  - Add symlink-safe selected-folder traversal to `DocumentService`.
  - Preserve full relative paths, deterministic ordering, and search limits.
  - Verify missing folders fail closed and symlinks cannot escape the Documents
    root.

- [x] **4. REST/MCP enforcement**
  - Apply the policy to list, search, read, and create in the shared public
    document API service.
  - Preserve generic `404` behavior for unauthorized direct paths.
  - Verify REST and MCP cannot expand access with scope, owner, path, query, or
    create inputs.

- [x] **5. Token settings tree**
  - Add the global document access selector and integrate it with `TokenForm`.
  - Reuse the existing tree query and shared five-level constant.
  - Update permission summaries and help text.
  - Verify create/edit hydration, parent inheritance, indeterminate state,
    depth cutoff, loading/error UI, and serialized permission payloads.

- [x] **6. Documentation and final verification**
  - Update the Endpoints tab descriptions to explain recursive folder grants.
  - Run formatting/lint fixes, typechecking, unit/integration tests, public API
    tests, MCP tests, design-system audit, and relevant Playwright coverage.

## Final Verification

- `pnpm exec eslint . --fix` and `pnpm lint` passed.
- `pnpm format` and `pnpm typecheck` passed.
- `pnpm test` passed with 2,997 tests across backend, frontend, shared, and CLI.
- The real Streamable HTTP MCP client E2E suite passed with seven tests,
  including recursive folder listing, search isolation, generic read denial,
  allowed in-folder creation, and denied out-of-folder creation.
- `pnpm design-system:audit` passed.
- Chromium design-system Playwright coverage passed with 56 tests.

## Test Plan

### Shared schemas

- Missing `globalFolderPaths` defaults to `[]`.
- Valid portable folder paths are accepted.
- Absolute, backslash, hidden, empty-segment, traversal, trailing-slash, and
  deeper-than-five paths are rejected.

### Token service and policy

- Folder paths are sorted and deduplicated.
- Descendant grants are removed when an ancestor is present.
- `sales` authorizes `sales/report.md` but not `sales-private/report.md`.
- Full-global access clears explicit folder grants.
- Folder-only access satisfies document-root validation.
- A create-only document token still requires document access.

### Public document service

- List returns documents from selected folders and all descendants only.
- List totals and pagination exclude hidden documents.
- Search metadata and content never inspect or return hidden documents.
- Read succeeds inside a granted folder.
- Reads of sibling, ancestor, and similarly prefixed folders return `404`.
- Create succeeds inside a granted folder and fails outside it with `404`.
- Private specialist root behavior remains unchanged.
- Deleted/missing granted folders yield no results and no broader access.
- Selected-folder symlinks cannot escape the Documents root.

### REST and MCP integration

- REST list/search/read/create enforce the folder allow-list.
- MCP list/search/read/create produce the same results and failures.
- Capability gating remains independent from resource access: the token needs
  both the operation capability and an authorized root/folder.

### Frontend

- The tree loads only when document permissions are being configured.
- Root full-global selection submits `global: true` and an empty folder array.
- Selecting a folder submits its path.
- Parent selection removes redundant child paths.
- Selected descendants make ancestors indeterminate.
- Inherited descendants are checked and disabled.
- No folder deeper than level five is rendered.
- A level-five grant communicates that deeper descendants are included.
- Editing a token restores folder selections.
- Removing all document capabilities clears all document access fields.

## Required Verification Commands

Run after implementation:

```bash
pnpm exec eslint . --fix
pnpm lint
pnpm typecheck
pnpm test
pnpm design-system:audit
pnpm --filter @cc/frontend exec playwright test e2e/design-system --project=chromium
```

Also run the focused backend public document/API/MCP tests and focused frontend
`ApiPage` tests during implementation before the full suite.

## Acceptance Criteria

- The owner can grant one or more global folders to a token from the token form.
- A grant automatically covers all descendants, including content deeper than
  the five levels displayed by the form.
- The form never renders more than five folder levels.
- List and search responses contain no unauthorized document metadata or
  content and expose no unauthorized counts.
- Unauthorized direct reads and creates return generic `404` responses.
- REST and MCP share the same authorization behavior.
- Full-global and private-specialist permissions continue to work.
- Permission JSON without `globalFolderPaths` parses with `[]`.
- No SQLite or workspace filesystem migration is introduced.
- Lint, typecheck, tests, design-system audit, and relevant Playwright checks
  pass.

## Non-Goals

- Per-document grants.
- Per-folder private specialist grants.
- Explicit deny rules beneath an allowed folder.
- Stable folder IDs across rename/move operations.
- Exposing a token-specific folder-tree endpoint to public REST or MCP clients.
- Increasing or changing the Documents sidebar's existing folder-depth UX.
