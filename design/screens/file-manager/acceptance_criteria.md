# File Manager Acceptance Criteria

- Selecting the file manager action from dashboard quick actions opens the file manager screen.
- When the user opens the file manager screen, the screen shows a file browsing workspace with a folder tree or equivalent directory navigation, breadcrumbs for the current location, and a primary area for file browsing or editing.
- The file manager allows the user to browse agent workspace files.
- The file manager allows the user to browse the host filesystem available to the single operator.
- When the user selects a folder in the file manager, the screen updates to show that folder as the current location and updates the visible file listing or tree state for that location.
- When the user selects a file in the file manager, the screen opens that file in the file viewing or editing surface.
- When the selected file type is supported for editing, the file manager allows the user to edit the file in the web app.
- When the file manager opens a supported text file, the editing surface shows syntax highlighting for that file.
- When the user saves changes to an editable file, the system persists those changes to the underlying file and the file manager continues to show the updated contents.
- The file manager allows the user to create a new file or folder in the current location.
- The file manager allows the user to rename an existing file or folder.
- The file manager allows the user to delete an existing file or folder, with a confirmation prompt before deletion.
- When the user attempts to rename or delete a file or folder that the system marks as critical for agent operation (such as AGENTS.md, memory files, or preferences files), the file manager shows a warning explaining that the file or folder is required by an agent before allowing the action to proceed.
- When the user opens the file manager from direct chat for a specific file, the file manager opens focused on that file.
- When the user opens the file manager from direct chat for a specific folder, the file manager opens focused on that folder.
- On desktop-sized layouts, the file manager supports a docked file browsing and editing workspace and may include additional context or bottom panels when enabled by the page.
- On mobile-sized layouts, the file manager preserves the same file and editing workflow while adapting auxiliary panels into overlays or sheets instead of side-by-side panes.
