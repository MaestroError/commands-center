# U4.3 Terminal Surfaces✅

## Goal

Implement the shared terminal foundation for CommandsCenter, including the dedicated global terminal page and the chat-embedded agent terminal that runs inside the current agent workspace.

## Pre-Conditions

- U0 Frontend Foundation is complete.
- E3 API and Realtime Foundation is complete.
- For the embedded agent terminal, the direct chat layout from U3 is already in place.

## Scope

### OpenCode PTY Architecture

- Implement a `TerminalBackend` interface with methods: `spawn()`, `resize()`, `write()`, `onData()`, `onExit()`.
- **OpenCode PTY Backend**: Proxy to OpenCode's `/pty`, `/pty/:ptyID`, `/pty/:ptyID/connect` endpoints. Use for everyday global and agent-scoped terminal sessions.
- Keep terminal semantics aligned with OpenCode's PTY model instead of mixing in a second local shell implementation.

### Shared Terminal Foundation

- Build a reusable terminal session UI using `xterm.js`.
- Support session create, attach/connect, input, output, resize, reconnect, and close flows.
- Support multiple sessions as tabs.

### Global Terminal Screen

- Replace the `/terminal` placeholder page with a real full-page terminal workspace.
- Run sessions in the host/global environment rather than a single agent workspace.
- Support creating multiple tabs and switching between them.
- Keep the terminal as the main page content, not a small docked utility panel.

### Embedded Agent Terminal

- Add a chat-embedded terminal surface for agent workspaces.
- The terminal should be closed by default and open in the bottom work surface of the direct chat layout.
- Sessions are scoped to the current agent workspace directory.
- Support multiple terminal sessions in the agent context as tabs.
- Support handoff from workspace files to terminal context where practical once both surfaces exist.

### Performance and UX

- Terminal output should remain smooth during high-throughput commands without freezing the UI.
- Reconnect and resize behavior should follow OpenCode PTY semantics.
- Mobile layouts should preserve the tab/session workflow in a full-screen or sheet-based presentation where needed.

## Out of Scope

- Shell history sync across sessions.
- Rich terminal persistence beyond what OpenCode already provides.
- File-manager editing features.

## Acceptance Criteria

- Navigating to `/terminal` opens a functional global terminal screen instead of a placeholder.
- The global terminal supports multiple sessions as tabs.
- Terminal sessions run in the host/global environment for the global terminal screen.
- The direct chat screen can open a bottom-docked agent terminal that runs in the current agent workspace.
- The embedded agent terminal is closed by default and supports multiple sessions.
- Terminal output remains usable during high-throughput commands.
- Mobile layouts preserve the terminal session workflow for both global and agent-scoped terminals.

## Key Files to Create/Modify

- `packages/frontend/src/pages/GlobalTerminalPage.tsx` or equivalent replacement for the current placeholder route
- `packages/frontend/src/pages/WorkspaceChatPage.tsx` to host the embedded agent terminal surface
- `packages/frontend/src/components/terminal/` shared terminal session, tab strip, and workspace components
- `packages/frontend/src/lib/api.ts` PTY session helpers if not already present
- `packages/backend/src/services/terminal-backend.ts` TerminalBackend interface and factory
- `packages/backend/src/services/terminal/opencode-pty-backend.ts` OpenCode PTY implementation
- `packages/backend/src/services/opencode-service.ts` PTY helper methods that proxy to OpenCode's PTY endpoints (for OpenCode backend)
- `packages/backend/src/routes/` PTY-facing API routes if CC needs a backend facade over OpenCode
- `packages/shared/src/schemas/` PTY session payload/event schemas as needed
- `packages/shared/src/types/` TerminalBackend type definitions

## Reference

- Parent epic: `development/product-ux-surfaces/04-file-manager-and-terminals.md`
- Design: `design/screens/global-terminal/description.md`
- Acceptance criteria: `design/screens/global-terminal/acceptance_criteria.md`
- Agent-terminal product requirements: `GOAL.md`, `PRD.md`
- Direct chat note deferring terminal until U4: `development/product-ux-surfaces/03-direct-chat-sub-epics/03-rich-display-and-sidebar.md`
- OpenCode PTY notes from parent epic and upstream PTY endpoints
