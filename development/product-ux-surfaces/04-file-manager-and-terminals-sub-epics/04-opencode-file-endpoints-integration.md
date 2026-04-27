# U4.4 OpenCode File Endpoints Integration✅

## Goal

Expose the full set of relevant OpenCode file/search endpoints through CC's backend service layer so file search, previews, mentions, review, and later search-palette features can reuse one upstream-aligned contract instead of growing separate filesystem APIs.

## Why this is a separate PR

This work is infrastructure for multiple later surfaces. It expands CC's OpenCode integration contract, reduces duplicate filesystem logic, and gives downstream UI epics a stable, reusable backend surface.

## Pre-Conditions

- E3 API and Realtime Foundation is complete.
- CC already has the base OpenCode service integration and scoped client pattern in place.
- U4.1 File Manager Navigation and CRUD may already be in progress, but this sub-epic should become the canonical backend integration layer for richer file operations.

## Scope

### OpenCode Service Coverage

- Ensure `packages/backend/src/services/opencode-service.ts` exposes wrappers for the following OpenCode endpoints:
  - `GET /find?pattern=<pat>` search for text in files
  - `GET /find/file?query=<q>` find files and directories by name
  - `GET /file?path=<path>` list files and directories
  - `GET /file/content?path=<p>` read a file
  - `GET /file/status` get status for tracked files
- Parse and validate the upstream responses at the service boundary using shared schemas or equivalent runtime validation.
- Keep these wrappers scoped by OpenCode directory, matching the existing pattern used for workspace-local operations.

### CC Backend Facade

- Add or extend CC backend routes only where CC frontend surfaces need a stable app-facing contract.
- Avoid inventing parallel filesystem response shapes when an upstream-compatible response is already useful.
- Document which surfaces should call CC backend routes versus which internal services should directly use `opencode-service.ts`.

### File Mention Search

- Update message-composer `FileMentionPopover` to use the OpenCode `find/file`-based path through CC.
- Ensure this search remains scoped to the current agent workspace.
- Prefer file/directory name search for this mention flow rather than text-content search.
- Preserve current keyboard interaction and lightweight popover behavior.

### Decisions

- `find/file` is the correct primitive for file-name search in chat mentions and the upcoming search palette.
- `file/content` is the correct primitive for file previews and later file-editor opening.
- `find` (text search) and `find/file` (name search) should remain distinct in the backend contract so future global search can merge results intentionally instead of conflating them.

## Out of Scope

- Building the actual global search palette UI.
- Monaco editor integration.
- File preview rendering beyond proving the read contract is available.
- Git review UI, even though `file/status` will enable it later.

## Acceptance Criteria

- CC's OpenCode service layer exposes wrappers for `find`, `find/file`, `file`, `file/content`, and `file/status`.
- Response validation exists for each wrapper.
- `FileMentionPopover` uses the `find/file`-backed path through CC and searches under the current agent workspace.
- Existing file mention UX continues to work after the service update.
- Downstream epics can rely on this sub-epic rather than adding new ad hoc OpenCode file wrappers.

## Key Files to Create/Modify

- `packages/backend/src/services/opencode-service.ts`
- `packages/backend/src/routes/` add facade routes only if needed by current frontend flows
- `packages/shared/src/schemas/` for upstream-aligned file/search response schemas as needed
- `packages/frontend/src/lib/api.ts`
- `packages/frontend/src/components/chat/FileMentionPopover.tsx`

## Reference

- Parent epic: `development/product-ux-surfaces/04-file-manager-and-terminals.md`
- OpenCode routes: `examples/opencode/packages/opencode/src/server/routes/instance/file.ts`
- Existing CC OpenCode wrappers: `packages/backend/src/services/opencode-service.ts`
- Existing file mention usage: `packages/frontend/src/components/chat/FileMentionPopover.tsx`
