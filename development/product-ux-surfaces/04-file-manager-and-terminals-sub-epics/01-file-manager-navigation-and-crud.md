# U4.1 File Manager Navigation and CRUD✅

## Goal

Replace the placeholder file manager page with a real browsing workspace that can navigate agent workspaces and the host filesystem, open files/folders from chat handoff, and support core file operations.

## Pre-Conditions

- U0 Frontend Foundation is complete.
- E3 API and Realtime Foundation is complete.
- U3.3 Rich Message Display and Workspace Sidebar is complete enough that the existing `WorkspaceFilesTab` groundwork can be reused rather than duplicated.
- Route `/files` already exists with a placeholder `FileManagerPage`.

## Scope

### Root Context and Navigation

- Replace the placeholder `FileManagerPage` with a functional file manager workspace.
- Add an explicit root/source switcher so the user can browse:
  - the current or selected agent workspace
  - the host filesystem available to the single operator
- Show breadcrumbs for the current location.
- Support folder tree or equivalent directory navigation in the main browsing surface.
- Support query-param-driven handoff so direct chat can open the page focused on a specific file or folder.

### Browser Experience

- Reuse and expand the file tree patterns already introduced in the chat sidebar.
- Selecting a folder updates the current location and visible listing/tree state.
- Selecting a file updates the current selection and hands off to the editor surface.
- Preserve clear empty, loading, and error states for root loading and directory loading.

### CRUD Flows

- Create new file in the current location.
- Create new folder in the current location.
- Rename file or folder.
- Delete file or folder with confirmation.
- Refresh listing/tree state after each mutation without full page reload.

### Critical File Warnings

- Before rename/delete of agent-critical files or directories, show a warning that explains the operational risk.
- Critical-file handling should cover at minimum the files already called out in the design and workspace contract, including `AGENTS.md` and other agent/runtime-sensitive files CC owns.
- Warning is advisory, not a hard block.

## Out of Scope

- Monaco editor integration and text editing surface details (Sub-Epic 2).
- Terminal integration or “open in terminal” actions (Sub-Epic 3).
- Rich preview support for images/PDFs beyond basic file selection state.
- Bulk file actions.

## Acceptance Criteria

- Navigating to `/files` opens a functional file manager instead of a placeholder.
- The screen supports browsing both an agent workspace and the broader host filesystem.
- Folder selection updates breadcrumbs and visible navigation state.
- File selection updates the current selection and passes the selected file to the editor surface.
- The user can create, rename, and delete files/folders from the file manager.
- Delete actions require confirmation.
- Renaming or deleting critical agent files/folders shows a warning before proceeding.
- When opened from direct chat with a file or folder target, the file manager lands focused on that target.
- Mobile layouts preserve the browsing workflow using overlays/sheets where needed instead of desktop side-by-side panes.

## Key Files to Create/Modify

- `packages/frontend/src/pages/FileManagerPage.tsx`
- `packages/frontend/src/components/workspace/` new or expanded components for file browser shell, breadcrumbs, root switcher, and action dialogs
- `packages/frontend/src/lib/api.ts` for dedicated file-manager endpoints if current chat-oriented helpers are too narrow
- `packages/backend/src/routes/` add file manager routes for create/rename/delete/list as needed
- `packages/backend/src/services/` add or extend a filesystem service for safe file-manager operations
- `packages/shared/src/schemas/` add file manager request/response schemas

## Reference

- Parent epic: `development/product-ux-surfaces/04-file-manager-and-terminals.md`
- Design: `design/screens/file-manager/description.md`
- Acceptance criteria: `design/screens/file-manager/acceptance_criteria.md`
- Existing groundwork: `packages/frontend/src/components/workspace/WorkspaceFilesTab.tsx`
- Existing workspace tree/search endpoints: `packages/backend/src/routes/agents.ts`, `packages/backend/src/services/opencode-service.ts`
