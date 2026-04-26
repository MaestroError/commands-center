# U4.2 File Editor and Preview

## Goal

Add the actual file reading and editing experience to the file manager: open files, edit supported text files with Monaco, save changes, and handle unsupported files gracefully.

## Pre-Conditions

- Sub-Epic 1 (File Manager Navigation and CRUD) is complete.
- Sub-Epic 4 (OpenCode File Endpoints Integration) is complete.
- The file manager page can resolve the currently selected file and current directory context.
- The project has the lazy-loading strategy for heavy frontend dependencies available for Monaco.

## Scope

### Layout Decision

- The file editor and preview experience should live inside the existing `/files` page, not in a modal and not as a separate primary route.
- `FileManagerPage` should evolve from a list-only primary area into a file workspace with three responsibilities visible at once on desktop.
- The desktop layout should be: file browser on the left side of the primary area, editor or preview surface on the right side of the primary area, and the existing `WorkspaceLayout` context pane on the far right for details and actions.
- This is intentionally a focused browse-and-edit workspace, not a full IDE clone.
- Monaco should be used only inside the editor surface area for supported text files.
- The existing context pane should remain for metadata and actions. It should not become the main editor host because it is too narrow for comfortable editing.
- The editor should not be introduced as a modal because file editing requires persistent space for loading, dirty state, save flow, conflicts, and preview fallbacks.

### Current-to-Target Layout Migration

- Today, `FileManagerPage` uses `WorkspaceLayout` with a primary area that only shows the current file list and a context pane with Details and Actions tabs.
- The implementation for this sub-epic should keep `WorkspaceLayout` itself and change what is rendered inside `primary`.
- Developers should think of the current primary area as a general file workspace container, not as a permanent file-list-only component.
- The practical migration path is: keep the existing page header and root switching controls, keep the existing context pane tabs, split the current primary area into two internal panes, move the existing list UI into a dedicated browser pane on the left, and add a new editor or preview surface on the right.
- This means the page does not need a new route. The page needs a better internal composition.

### State Model Decision

- The page should distinguish between file selection and file opening.
- `selectedPath` should continue to represent the highlighted item in the browser for details and actions.
- A separate open-file state should drive the editor or preview surface.
- This separation matters because the user may select a file without opening it yet, open a file and then browse other entries without immediately replacing the editor, or need unsaved-change protection before opening a different file.
- The first implementation may keep selection and opening closely coupled if that reduces complexity, but the structure should leave room for them to diverge cleanly.

### File Open and Read

- When the user opens a file, load its contents into the editor or preview surface in the primary area.
- Double-clicking a file in the file manager should open it for editing or preview.
- On desktop, keep single-click focused on selection and double-click focused on opening so the current list-first interaction remains understandable while the editor is introduced.
- Keyboard open behavior should match double-click behavior for accessibility.
- Use OpenCode `GET /file/content?path=<p>` as the primary read path for agent/workspace-scoped file previews and editor opening, rather than inventing a separate preview contract.
- Distinguish editable text files from unsupported/binary files.
- Preserve loading and error states while fetching file contents.

### Monaco Editor

- Integrate Monaco as the page-level editor for supported text files.
- Enable syntax highlighting based on file type.
- Keep the editing experience focused on practical code/config/document editing rather than IDE-scale features.
- Ensure Monaco is lazy-loaded so it does not bloat the initial bundle.
- Monaco should occupy the editor surface inside the primary area, not the context pane.
- The editor surface should include a lightweight file toolbar above Monaco with at least file name, visible path or relative location, dirty state indicator, save action, and reload or revert action.
- Monaco should be treated as the content area of the surface, not as the entire layout.
- Minimap, multi-tab IDE chrome, source-control gutters, and similar heavy IDE affordances should remain off by default or out of scope for this sub-epic.

### Save Flow

- Let the user edit a supported text file and explicitly save changes.
- Persist file contents back to disk.
- Keep the file manager focused on the same file after save.
- Show dirty state and save feedback.
- Handle parallel edits gracefully (The agent may edit file before user saves it)
- If the file changed on disk after it was opened, show an inline conflict state in the editor surface instead of silently overwriting or silently discarding.
- The first implementation should prefer explicit user actions such as reload from disk or overwrite with current editor contents.

### Unsupported Files and Lightweight Preview

- Use the `FileContent` response from OpenCode `GET /file/content?path=<p>` to branch preview behavior for text vs binary content.
- For non-editable files, show a clear fallback state rather than a broken editor.
- Fallback may include filename, path, type, size, and a message that the file is not editable in-app.
- If lightweight preview is feasible for certain formats, prefer using the `mimeType`, `type`, `encoding`, and `content` fields already returned by OpenCode before creating custom preview metadata layers.
- The most of formats of Images and Videos should be previewable.
- Images and videos should reuse the same right-hand editor or preview surface slot as text files so the page layout stays stable while the content mode changes.
- Unsupported binary files should still render inside that same surface as a readable fallback card, not as a detached alert elsewhere on the page.

### Responsiveness

- On desktop, keep the file browser and editor usable in the same workspace.
- On mobile, adapt tree/actions into overlays or sheets while preserving the read/edit/save flow.
- On desktop, the default expectation is a split primary workspace: browser on the left, editor or preview on the right.
- On mobile, the editor or preview should take over the main reading area once a file is opened, while browsing controls can move into overlays, drawers, or sheets.
- The mobile experience should preserve the same open, edit, save, and fallback logic even if the visual arrangement becomes sequential instead of side-by-side.

## Implementation Approach

This section is intentionally detailed so a junior engineer can translate the current screen into the target screen without guessing.

### 1. Keep the outer page shell

- Do not replace `WorkspaceLayout`.
- Do not create a new `/editor` route.
- Do not move editing into the existing context pane.
- Keep the current page header, root selector, breadcrumbs, and context pane tabs.

The main structural change belongs inside `primary`.

### 2. Extract the current file list into a browser pane

- The current listing logic in `FileManagerPage.tsx` already handles loading directory data, selecting nodes, opening directories, and create, rename, and delete refresh flows.
- Move the visible list markup into a dedicated browser-oriented component or section inside the page.
- That browser pane should remain responsible for showing the current directory entries, highlighting the selected item, opening directories, and opening files for editing or preview on double click or keyboard open.

This preserves existing behavior while making room for a second pane.

### 3. Add a new editor or preview surface beside the browser pane

- Introduce a second pane inside the primary area.
- This pane should be empty-state driven when no file is open.
- Once a file is opened, it should render one of three modes: text editor mode via Monaco, rich preview mode for previewable media such as images or videos, or fallback mode for unsupported or binary files.

The simplest mental model is: the right side always exists, but what it shows depends on the opened file state.

### 4. Do not overload selection with editing semantics

- The current page already has `selectedPath`.
- Add a separate piece of state for the file currently shown in the editor or preview.
- The browser pane should update selection immediately.
- Opening should update the opened-file state.

This allows the page to support future UX improvements like unsaved change protection, preview before replace, and deep-linking to a file from chat.

### 5. Add a lightweight editor toolbar above Monaco

- Before rendering Monaco, render a simple file surface header.
- At minimum, this header should show current file name, path, dirty badge or unsaved marker, save button, and reload or revert button.
- This is important because file editing needs visible state and actions outside the editor text area.

Without this header, the user has no clear place to understand what file is open or what state it is in.

### 6. Keep the context pane focused on details and actions

- Details tab should continue showing metadata about the selected item.
- Actions tab should continue showing operations such as rename and delete.
- The context pane should complement the editor, not compete with it.

In other words, browser pane = navigation, editor pane = file work, and context pane = metadata and actions.

### 7. Treat file preview as part of the same surface, not a separate subsystem

- The editor surface should branch internally based on OpenCode file content data.
- Do not build one route for editor and another route for preview.
- Do not create a separate preview panel outside the editor surface.

This keeps the page stable and makes unsupported files understandable instead of surprising.

### 8. Defer IDE-style complexity

- Do not add multi-file tabs in this sub-epic unless they fall out naturally from implementation and remain simple.
- Do not add diff view, source control UI, terminal embedding, or language-server behavior here.
- The first version should succeed at opening one file, editing it well, saving it clearly, and handling unsupported files cleanly.

## Out of Scope

- Advanced IDE features like diff view, multi-cursor workflows, or language-server integration.
- Embedded terminal inside the file manager.
- Git-aware editor decorations.
- Multi-file tabs inside the file manager unless implementation naturally requires them.
- Editing in a modal dialog.
- Creating a separate dedicated editor route as the default way to work with files.

## Acceptance Criteria

- Selecting a supported text file opens it in an in-app editor.
- Double-clicking a file in the file manager opens it for editing.
- File open and preview behavior uses OpenCode `GET /file/content?path=<p>` for agent/workspace-scoped files.
- Supported text files display syntax highlighting.
- Editing and saving a file persists the updated contents to disk.
- The screen provides clear loading, error, and dirty/saving states.
- Unsupported files fall back to a readable non-editor state instead of failing.
- The file editing workflow remains usable on mobile layouts.
- On desktop, the `/files` screen shows browsing and editing in the same page without requiring a modal or route change.
- The existing context pane remains available for file details and actions while the editor or preview uses the main primary workspace.

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
