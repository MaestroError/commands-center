# U4 File Manager and Terminals

## Outcome

The user can browse and edit files from the workspace and host filesystem, and can use both the global terminal and agent-scoped terminal sessions.

## Why this is a separate PR

This is a complete workspace-interaction feature slice and can ship after the data and realtime layers are stable.

## Blockers

- U0 Frontend Foundation
- C1 Database and Workspace Foundation
- E3 API and Realtime Foundation

## Unblocks

- No hard blockers. This is a major usability milestone.

## Scope

- Implement file manager screen with tree, breadcrumbs, editor, and create/rename/delete flows
- Implement critical-file warnings for agent-sensitive files
- Implement global terminal screen backed by OpenCode PTY sessions
- Reuse OpenCode PTY session model for chat-embedded agent terminals, with workspace directory passed per agent
- Support opening files and folders from chat sidebar into file manager or terminal context
- Ensure file manager and terminal screens are responsive on mobile viewports

## Design References

- `design/screens/file-manager/description.md`
- `design/screens/file-manager/acceptance_criteria.md`
- `design/screens/global-terminal/description.md`
- `design/screens/global-terminal/acceptance_criteria.md`
- `GOAL.md` for the agent-terminal requirement and host-filesystem access model
- `PRD.md` for the requirement that both global and agent-scoped terminals exist

## Implementation Decisions

- The file manager should use a dedicated root switcher or equivalent source selector so the user can browse both agent workspaces and the wider host filesystem without conflating them into a single ambiguous tree.
- The file browser/tree already introduced in direct chat should be treated as groundwork, not a separate competing implementation. U4 should evolve that work into the dedicated file manager experience.
- The main file editing surface should be page-level and editor-first, using Monaco for supported text files.
- Unsupported or non-text files should still be openable in the file manager, but may fall back to read-only metadata/preview behavior instead of full editing.
- Terminal work should reuse one shared terminal UI foundation across the global terminal page and the chat-embedded agent terminal.
- The chat-embedded agent terminal remains part of U4 even though it does not yet have its own dedicated design screen; its behavior should follow `GOAL.md` and `PRD.md`: bottom-docked, closed by default, multi-session capable, and scoped to the current agent workspace.
- Local machine or emergency terminal access is intentionally deferred into a separate future enhancement so the main terminal experience can stay aligned with OpenCode PTY semantics.

## OpenCode Findings

- OpenCode already exposes PTY session management routes (`/pty`, `/pty/:ptyID`, `/pty/:ptyID/connect`) and uses them in its own app for terminal support
- Terminal-specific reconnect, cursor replay, and resize behavior should follow the upstream PTY contract so we stay aligned with OpenCode semantics
- If upstream PTY throughput needs additional smoothing in the UI, prefer frontend-side buffering/render strategies first; avoid forking backend PTY transport unless OpenCode proves insufficient

## Acceptance Criteria

- The user can browse and edit workspace files with syntax-highlighted editing
- The user can browse the wider machine filesystem where allowed by the app model
- The user can open a global terminal and run interactive commands
- Terminal output renders smoothly during high-throughput operations without UI freezing while using OpenCode's PTY transport
- The user can open an agent terminal in workspace context and maintain multiple sessions
- File manager and terminal flows interoperate with direct chat entry points
- File manager and terminal layouts adapt correctly to mobile viewports

## Non-Goals

- Automation scheduling
- Provider and MCP auth flows

## Suggested Sub-Epics

- `04-file-manager-and-terminals-sub-epics/01-file-manager-navigation-and-crud.md`
- `04-file-manager-and-terminals-sub-epics/02-file-editor-and-preview.md`
- `04-file-manager-and-terminals-sub-epics/03-terminal-surfaces.md`
- `04-file-manager-and-terminals-sub-epics/04-opencode-file-endpoints-integration.md`
- `04-file-manager-and-terminals-sub-epics/05-global-search-and-resource-palette.md`
- `04-file-manager-and-terminals-sub-epics/06-file-upload-backend-and-settings.md`
- `04-file-manager-and-terminals-sub-epics/07-file-upload-ui-and-drag-drop.md`
