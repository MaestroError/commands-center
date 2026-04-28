# U4.5 Global Search and Resource Palette✅

## Goal

Build a global search surface in CC that is available from the app header and by keyboard shortcut, designed from the start to support multiple resource types and actions. The first version should search agents plus files by both file name and file content.

## Why this is a separate PR

This is a cross-surface navigation system, not just a file-manager feature. It needs shared keyboard handling, a reusable palette architecture, provider-based search composition, and result actions that route into agents, file manager, previews, and the file editor.

## Pre-Conditions

- U4.4 OpenCode File Endpoints Integration is complete.
- U4.2 File Editor and Preview is complete.
- U2 Agents and Agent Editor is complete.
- App-shell/header work is available so the search entry point can live in the global header.

## Scope

### Global Entry Points

- Add a globally available search trigger in the app header.
- Add keyboard shortcut: `Ctrl/Cmd + Shift + F`.
- The search UI should open as a modal/palette surface and be accessible from any main app area.

### Extensible Search Architecture

- Build the palette around result providers so later object types and actions can be added without rewriting the shell.
- Result items should support:
  - title
  - subtitle/context
  - type/category
  - primary action
  - optional secondary actions
- The first version should implement only two searchable resource groups:
  - Agents
  - Files

### Agent Search

- Search agents using CC-managed data, not OpenCode file APIs.
- Match against practical agent identity fields such as name and slug.
- Agent result actions:
  - Primary: open agent
  - Secondary: open agent edit page

### File Search

- Search files by both:
  - file name / path using OpenCode `GET /find/file?query=<q>`
  - text content using OpenCode `GET /find?pattern=<pat>`
- Merge and present these file results in one file-oriented result section while preserving enough metadata to distinguish why a file matched.
- For the first version, keep the UI file-centric rather than building a full grep-results browser. Path matches, just make matching part bold, when content matches, no bold path + some icon that simbolizes content

### File Result Actions

- File result actions should follow these decisions:
  - Primary: open file in preview
  - Secondary: open containing folder in file manager and focus/reveal that file
  - Secondary: open file in editor
- "Open containing folder" should:
  - navigate to file manager
  - open the containing directory
  - select the file
  - scroll/reveal it in the list
- Direct editor opening depends on U4.2 file editor support.

### Decisions

- The search palette should be built as a general resource/action palette, not a file-only modal, so later support for tools, MCP servers, skills, sessions, and app commands fits naturally.
- The first version intentionally excludes commands/actions from results even though the architecture should support them later.
- File search should combine file-name and content results now, because users expect a single place to find files.
- File preview should use the `file/content` integration added in U4.4 and the preview/editor capability delivered in U4.2.

## Out of Scope

- Searching tools, MCP servers, skills, sessions, providers, or app commands in the first version.
- Symbol-search UI even though the backend integration exists.
- Full grep-style line-result browsing UX.

## Acceptance Criteria

- A global search trigger exists in the app header.
- `Ctrl/Cmd + Shift + F` opens the search palette.
- The palette architecture supports multiple result groups and actions.
- The first version returns only Agents and Files.
- Agent results support primary open and secondary edit actions.
- File results combine file-name and text-content matches.
- File results support:
  - primary preview open
  - secondary open file location in file manager and focus that file
  - secondary open in editor
- The file-location action correctly reveals the file in file manager.

## Key Files to Create/Modify

- `packages/frontend/src/components/` shared search/palette UI
- `packages/frontend/src/components/layout/` app-header integration
- `packages/frontend/src/lib/api.ts`
- `packages/frontend/src/pages/FileManagerPage.tsx` for reveal/focus handoff
- `packages/frontend/src/pages/` routing hooks for opening agents, previews, and file editor targets
- `packages/backend/src/routes/` search facade routes if the frontend needs combined search endpoints
- `packages/backend/src/services/` aggregation layer for file-name plus text-content search if needed

## Reference

- Parent epic: `development/product-ux-surfaces/04-file-manager-and-terminals.md`
- Dependency: `04-file-manager-and-terminals-sub-epics/04-opencode-file-endpoints-integration.md`
- Dependency: `04-file-manager-and-terminals-sub-epics/02-file-editor-and-preview.md`
- Existing chat file mention search: `packages/frontend/src/components/chat/FileMentionPopover.tsx`
- OpenCode file routes: `examples/opencode/packages/opencode/src/server/routes/instance/file.ts`
- OpenCode command/search concepts: `examples/opencode/packages/app/src/pages/session/use-session-commands.tsx`
