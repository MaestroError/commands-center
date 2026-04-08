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
- Add `Start Fresh` and previous conversations affordances
- Add right sidebar with workspace files tab including interaction patterns: single-select for preview or context target, double-click to open in file manager, context menu with options to open folder in terminal or open file/folder in file manager
- Add embedded agent terminal bottom panel with tabbed sessions
- Ensure mobile layout: context pane rendered as sheet/overlay, bottom terminal as full-height mobile panel, touch-friendly tabs

## Acceptance Criteria

- Behavior matches `design/screens/direct-chat/acceptance_criteria.md`
- Chat streaming renders progressively instead of waiting for completion
- Tool calls can be expanded inline
- Sidebar and terminal panel can be opened, closed, and restored
- Workspace files tab supports single-select preview, double-click to open in file manager, and context menu actions for terminal and file manager
- Previous conversations remain secondary, not the primary navigation model
- Chat layout adapts to mobile: context pane as overlay/sheet, bottom terminal as full-height panel, touch-friendly tabs

## Non-Goals

- Full standalone file manager feature depth
- Global terminal screen
