# U3.3 Rich Message Display & Workspace Sidebar

## Goal

Polish the message rendering with specialized tool displays and context grouping, add the workspace files sidebar, and ensure mobile layouts work. After this sub-epic, the direct chat screen matches its full acceptance criteria (excluding features that depend on unbuilt screens like file manager and global terminal).

## Pre-Conditions

- Sub-Epic 1 (Core Chat Loop) is complete — basic chat, streaming, and generic tool cards work.
- Sub-Epic 2 (Composer Enhancements) is complete — full composer with all input mechanisms.

## Scope

### Context Tool Grouping

- Consecutive context tool calls (read, glob, grep, list) are grouped into a single collapsible summary row.
- Summary shows counts: e.g. "3 reads, 2 searches".
- Expanding the group reveals the individual tool cards.
- Non-context tools break the group and render individually as before.
- Implementation: linear scan of parts to accumulate consecutive context tools into `ContextToolGroup` objects (~280 lines in opencode reference).

### Specialized Tool Renderers

Upgrade from the generic JSON-dump card to purpose-built renderers for common tools:

- **Bash/shell**: command + output in a monospace `<pre>` block with copy button, animated status subtitle while running.
- **Task (subagent)**: card showing the subagent's task description and completion status. (Linking to child session is deferred.)
- **Question**: Q&A display showing the question and the user's answer.
- **TodoWrite**: hidden from the stream (already shown in the todo dock from Sub-Epic 1).
- **Generic fallback**: the existing expandable JSON card for any unrecognized tool type.

### Error & Status Display

- Tool errors render as visually distinct error cards (red/warning styling, collapsible error details).
- Message-level errors shown at the bottom of a turn.
- Aborted/interrupted messages shown with an "Interrupted" divider.
- Retry countdown timer when the agent is retrying after an error.

### Right Sidebar — Workspace Files Tab

- Collapsible right sidebar using the existing `WorkspaceLayout` context pane.
- "Files" tab showing the agent's workspace as a navigable file tree.
- File tree fetched from the backend (agent workspace path).
- Single-select a file to mark it as the current preview/context target (highlight in the tree).
- Memory files (CLAUDE.md, memory/, preferences) visible in the tree.
- Sidebar can be opened/closed via a toolbar button; state persisted (localStorage or similar).

Note: interactions that depend on unbuilt screens are deferred:
- Double-click to open in file manager → deferred (file manager not built).
- Context menu "Open folder in terminal" → deferred (terminal not built).
- Context menu "Open in file manager" → deferred (file manager not built).

### Mobile Layout Adaptations

- On mobile-sized viewports, the right sidebar renders as a sheet/overlay instead of a docked side panel.
- Touch-friendly tab targets in the sidebar.
- The chat layout adapts responsively: full-width chat on mobile, sidebar as on-demand overlay.

## Out of Scope

- Embedded terminal bottom panel (terminal screen not built yet).
- File manager interactions from workspace files (file manager not built yet).
- Paced markdown streaming animation (deferred feature).
- Diff stats, inline diff viewer, and file edit visualization (not needed for business agents).
- Subagent navigation/linking to child session (deferred feature).
- Session forking, sharing, followup queue, revert dock (deferred features).
- Performance optimizations: deferred turn mounting, CSS containment, session cache, SSE coalescing (deferred features).

## Acceptance Criteria

- Consecutive context tools (read/glob/grep/list) are grouped into a single collapsible summary row showing counts.
- Bash tool cards show command and output with copy button.
- Tool errors render as distinct error cards; aborted messages show an "Interrupted" divider.
- The right sidebar provides a workspace files tab showing the agent's file tree.
- Single-selecting a file in the workspace tree marks it as the current selection.
- The sidebar can be opened and closed; its state is restored across visits.
- On mobile layouts, the sidebar renders as a sheet/overlay instead of a docked panel.
- The overall chat layout adapts responsively to different viewport sizes.

## Key Files to Create/Modify

- `packages/frontend/src/components/chat/ToolCallCard.tsx` — refactor into a registry-based system with specialized renderers
- `packages/frontend/src/components/chat/` — new components:
  - `ContextToolGroup.tsx` — collapsible summary for grouped context tools
  - `BashToolCard.tsx` — shell command + output renderer
  - `TaskToolCard.tsx` — subagent task card
  - `QuestionToolCard.tsx` — Q&A display
  - `ErrorCard.tsx` — tool error display
  - `RetryCountdown.tsx` — retry timer
  - `InterruptedDivider.tsx` — aborted message indicator
- `packages/frontend/src/components/chat/WorkspaceFilesTab.tsx` — file tree sidebar content
- `packages/frontend/src/components/chat/FileTree.tsx` — navigable file tree component
- `packages/frontend/src/pages/WorkspaceChatPage.tsx` — wire up sidebar and mobile layout

## Reference

- OpenCode context grouping: `examples/opencode/packages/ui/src/components/message-part.tsx` (lines 461-503, 834-930)
- OpenCode tool registry: `examples/opencode/packages/ui/src/components/message-part.tsx` (`ToolRegistry`, `PART_MAPPING`)
- OpenCode error handling: `examples/opencode/packages/ui/src/components/tool-error-card.tsx`, `session-retry.tsx`
- Design acceptance criteria: `design/screens/direct-chat/acceptance_criteria.md`
