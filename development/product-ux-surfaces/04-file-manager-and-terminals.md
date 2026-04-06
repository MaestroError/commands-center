# U4 File Manager and Terminals

## Outcome

The user can browse and edit files from the workspace and host filesystem, and can use both the global terminal and agent-scoped terminal sessions.

## Why this is a separate PR

This is a complete workspace-interaction feature slice and can ship after the data and realtime layers are stable.

## Blockers

- C1 Database and Workspace Foundation
- E3 API and Realtime Foundation

## Unblocks

- No hard blockers. This is a major usability milestone.

## Scope

- Implement file manager screen with tree, breadcrumbs, editor, and create/rename/delete flows
- Implement critical-file warnings for agent-sensitive files
- Implement global terminal screen using PTY and websocket transport with 16ms flow-control buffering from E3 infrastructure
- Reuse agent terminal backend for chat-embedded terminals
- Support opening files and folders from chat sidebar into file manager or terminal context
- Ensure file manager and terminal screens are responsive on mobile viewports

## Acceptance Criteria

- The user can browse and edit workspace files with syntax-highlighted editing
- The user can browse the wider machine filesystem where allowed by the app model
- The user can open a global terminal and run interactive commands
- Terminal output renders smoothly during high-throughput operations without UI freezing
- The user can open an agent terminal in workspace context and maintain multiple sessions
- File manager and terminal flows interoperate with direct chat entry points
- File manager and terminal layouts adapt correctly to mobile viewports

## Non-Goals

- Automation scheduling
- Provider and MCP auth flows
