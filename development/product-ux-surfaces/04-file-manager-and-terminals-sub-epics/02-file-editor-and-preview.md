# U4.2 File Editor and Preview

## Goal

Add the actual file reading and editing experience to the file manager: open files, edit supported text files with Monaco, save changes, and handle unsupported files gracefully.

## Pre-Conditions

- Sub-Epic 1 (File Manager Navigation and CRUD) is complete.
- Sub-Epic 4 (OpenCode File Endpoints Integration) is complete.
- The file manager page can resolve the currently selected file and current directory context.
- The project has the lazy-loading strategy for heavy frontend dependencies available for Monaco.

## Scope

### File Open and Read

- When the user selects a file, load its contents into the primary editing surface.
- Double-clicking a file in the file manager should open it for editing.
- Use OpenCode `GET /file/content?path=<p>` as the primary read path for agent/workspace-scoped file previews and editor opening, rather than inventing a separate preview contract.
- Distinguish editable text files from unsupported/binary files.
- Preserve loading and error states while fetching file contents.

### Monaco Editor

- Integrate Monaco as the page-level editor for supported text files.
- Enable syntax highlighting based on file type.
- Keep the editing experience focused on practical code/config/document editing rather than IDE-scale features.
- Ensure Monaco is lazy-loaded so it does not bloat the initial bundle.

### Save Flow

- Let the user edit a supported text file and explicitly save changes.
- Persist file contents back to disk.
- Keep the file manager focused on the same file after save.
- Show dirty state and save feedback.

### Unsupported Files and Lightweight Preview

- Use the `FileContent` response from OpenCode `GET /file/content?path=<p>` to branch preview behavior for text vs binary content.
- For non-editable files, show a clear fallback state rather than a broken editor.
- Fallback may include filename, path, type, size, and a message that the file is not editable in-app.
- If lightweight preview is feasible for certain formats, prefer using the `mimeType`, `type`, `encoding`, and `content` fields already returned by OpenCode before creating custom preview metadata layers.

### Responsiveness

- On desktop, keep the file browser and editor usable in the same workspace.
- On mobile, adapt tree/actions into overlays or sheets while preserving the read/edit/save flow.

## Out of Scope

- Advanced IDE features like diff view, multi-cursor workflows, or language-server integration.
- Embedded terminal inside the file manager.
- Git-aware editor decorations.
- Multi-file tabs inside the file manager unless implementation naturally requires them.

## Acceptance Criteria

- Selecting a supported text file opens it in an in-app editor.
- Double-clicking a file in the file manager opens it for editing.
- File open and preview behavior uses OpenCode `GET /file/content?path=<p>` for agent/workspace-scoped files.
- Supported text files display syntax highlighting.
- Editing and saving a file persists the updated contents to disk.
- The screen provides clear loading, error, and dirty/saving states.
- Unsupported files fall back to a readable non-editor state instead of failing.
- The file editing workflow remains usable on mobile layouts.

## Key Files to Create/Modify

- `packages/frontend/src/pages/FileManagerPage.tsx`
- `packages/frontend/src/components/workspace/` editor-related components
- `packages/frontend/src/lib/api.ts` file read/write helpers
- `packages/backend/src/routes/` file read/write endpoints
- `packages/backend/src/services/` file manager service for reading/writing file contents
- `packages/shared/src/schemas/` file read/write payload schemas

## Reference

- Parent epic: `development/product-ux-surfaces/04-file-manager-and-terminals.md`
- Sub-Epic 1: `04-file-manager-and-terminals-sub-epics/01-file-manager-navigation-and-crud.md`
- Sub-Epic 4: `04-file-manager-and-terminals-sub-epics/04-opencode-file-endpoints-integration.md`
- Design: `design/screens/file-manager/description.md`
- Acceptance criteria: `design/screens/file-manager/acceptance_criteria.md`
- Stack choice: `AGENTS.md` tech stack section for Monaco (`@monaco-editor/react`)
