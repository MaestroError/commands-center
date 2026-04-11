# U3 Direct Chat Screen

## Outcome

The user can open an agent, resume its current conversation, stream messages, inspect tool calls, attach files, open prior conversations, browse workspace files from chat, and open the embedded agent terminal panel.

## Why this is a separate PR

This is the MVP centerpiece and should land as one coherent feature rather than fragmented partial chat PRs.

## Blockers

- U0 Frontend Foundation
- C2 Agent Workspace Lifecycle
- C3 Direct Chat Session Model

## Unblocks

- No hard blockers. This is a user-facing milestone.

## Scope

- Implement chat page routing by agent
- Show current agent identity and existing conversation by default
- Add streaming message rendering and inline tool call inspection
- Add composer with model selector, auto-approve control, and attachments
- Surface connected provider models from I1 in the chat model selector
- Add `Start Fresh` and previous conversations affordances
- Add right sidebar with workspace files tab including interaction patterns: single-select for preview or context target, double-click to open in file manager, context menu with options to open folder in terminal or open file/folder in file manager
- Add embedded agent terminal bottom panel with tabbed sessions
- Ensure mobile layout: context pane rendered as sheet/overlay, bottom terminal as full-height mobile panel, touch-friendly tabs

## Acceptance Criteria

- Behavior matches `design/screens/direct-chat/acceptance_criteria.md`
- Chat streaming renders progressively instead of waiting for completion
- Tool calls can be expanded inline
- The chat model selector shows connected provider models from I1
- Sidebar and terminal panel can be opened, closed, and restored
- Workspace files tab supports single-select preview, double-click to open in file manager, and context menu actions for terminal and file manager
- Previous conversations remain secondary, not the primary navigation model
- Chat layout adapts to mobile: context pane as overlay/sheet, bottom terminal as full-height panel, touch-friendly tabs

## Non-Goals

- Full standalone file manager feature depth
- Global terminal screen

## Context of examples from opencode web app

Reference: `examples/opencode` web app — how it renders chat from the `opencode serve` API.

- **Message timeline**: windowed/paginated list of turns. Each turn anchored on a user message, renders all associated assistant parts below it. Ref: `packages/app/src/pages/session.tsx`, `packages/ui/src/components/session-turn.tsx`
- **Markdown rendering**: assistant text streamed with animated token reveal, rendered via `marked` + `DOMPurify`, with auto-injected copy buttons on code blocks. Ref: `packages/ui/src/components/markdown.tsx`
- **Tool call inspection**: collapsible cards with icon, animated title while running, expandable details. Consecutive context tools (read/glob/grep/list) grouped into a summary row. Per-tool renderers for bash (output + copy), edit/write/apply_patch (diff viewer), task (subagent link), question (Q&A pairs). Generic fallback for unknown tools. Ref: `packages/ui/src/components/message-part.tsx`, `packages/ui/src/components/basic-tool.tsx`
- **Error handling**: tool errors as collapsible cards; message-level errors at turn bottom; retry countdown timer; aborted messages shown as "Interrupted" divider. Ref: `packages/ui/src/components/tool-error-card.tsx`, `packages/ui/src/components/session-retry.tsx`
- **Composer**: rich input with model/agent selectors, auto-accept toggle, `@` mention pills, file attachments (paste, drag-drop, file picker). Enter submits, Shift+Enter newlines. Ref: `packages/app/src/components/prompt-input.tsx`
- **Attachments**: images/PDFs/source files sent as data URLs via `FilePartInput` to OpenCode. Thumbnails with preview dialog. Ref: `packages/app/src/components/prompt-input/attachments.ts`
- **Todo dock**: read-only collapsible tray above composer showing agent's task progress from `todo.updated` events. Ref: `packages/app/src/pages/session/composer/session-todo-dock.tsx`
- **Mid-session prompts**: question dock (multi-step wizard, single/multi-select + custom answer), permission dock (Deny/Allow always/Allow once). When active, replaces the normal composer. Ref: `packages/app/src/pages/session/composer/session-question-dock.tsx`, `session-permission-dock.tsx`
- **Part visibility**: todowrite hidden from stream (shown in dock); question hidden while pending; text hidden if whitespace-only. Ref: `partState()` in `session-turn.tsx`
- **Streaming**: SSE text deltas for progressive rendering, optimistic user messages on send, event coalescing per frame. Ref: `packages/app/src/context/global-sync/event-reducer.ts`
