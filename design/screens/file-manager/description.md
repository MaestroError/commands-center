# File Manager

## Purpose

File Manager is the main screen for browsing and editing files in CommandsCenter. It should let the single operator move through agent workspaces and the host filesystem, open files for reading or editing, and continue deeper file work in a larger surface than the direct chat sidebar.

## Functional Description

- Show a dedicated file browsing workspace with folder navigation, file tree navigation, and breadcrumbs.
- Let the user browse both agent workspace files and the broader machine filesystem available to the single operator.
- Let the user create new files and folders, rename existing files and folders, and delete files and folders.
- Let the user open files for reading and editing directly in the web app.
- Provide a file editing surface with syntax highlighting for supported file types.
- Show a system warning when the user attempts to rename or delete a file or folder that the system considers critical for agent operation, such as AGENTS.md, memory files, or preferences files.
- Support opening the file manager focused on a specific file or folder when the user hands off from direct chat.
- Use the main file manager surface for deeper file work rather than treating chat as the primary editing interface.

## User Stories

- As a single user, I want to create new files and folders, rename existing ones, and delete them, so that I can manage workspace contents directly from the app.
- As a single user, I want a warning before renaming or deleting files that agents depend on, so that I do not accidentally break an agent's operation.
- As a single user, I want to browse files and folders in one dedicated screen, so that I can locate the content I need without relying on chat context.
- As a single user, I want to move through both agent workspaces and the host filesystem, so that I can inspect and manage files wherever my work requires.
- As a single user, I want to open and edit files in the browser with syntax highlighting, so that I can work on configuration and code files without leaving the app.
- As a single user, I want the file manager to open at a file or folder selected from direct chat, so that I can continue file work without re-navigating to the same location.
- As a single user, I want a larger editing surface than the chat sidebar provides, so that I can comfortably perform deeper file inspection and editing tasks.
