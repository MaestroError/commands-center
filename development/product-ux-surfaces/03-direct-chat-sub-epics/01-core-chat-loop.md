# U3.1 Core Chat Loop

## Goal

Get the end-to-end chat working: navigate to an agent, see conversation history, send a prompt, watch the response stream in, and handle agent questions and permissions. After this sub-epic, the direct chat is functionally usable — a user can have a full back-and-forth with an agent.

## Pre-Conditions

- Backend is complete (C3 Direct Chat Session Model — conversation service, REST routes, shared schemas).
- Frontend foundation (U0), app shell (U1), and agents page (U2) are in place.
- Route `/chat/:agentId` exists with a placeholder `WorkspaceChatPage`.
- `WorkspaceLayout` component provides the primary/context/bottom pane structure.

## Scope

### Chat Page & Routing

- Replace placeholder `WorkspaceChatPage` with a functional chat page.
- On mount, call `GET /api/agents/:id/conversations/active` to resolve the current conversation (auto-creates one if none exists).
- Display agent identity (name, avatar/icon) in the page header.
- Show the conversation's message history in a scrollable timeline.

### Message Rendering

- Render user messages with plain text (no rich formatting needed for user content).
- Render assistant text parts with Markdown formatting (use `marked` + `DOMPurify` or equivalent).
- Auto-scroll to the latest message on new content.

### Basic Tool Call Display

- Render tool call parts as collapsible cards with: tool name, running/completed/error status indicator, and expandable detail area showing the tool's input/output JSON.
- No specialized per-tool renderers yet — use a generic card for all tool types.
- Show tool errors as visually distinct (error styling on the card).

### Streaming

- On prompt send, establish an SSE connection or polling mechanism to progressively render the assistant's response as it streams in.
- Show a "thinking" or loading indicator while waiting for the first token.
- Display streamed Markdown incrementally (plain append, not paced animation — that's deferred).

### Composer (Minimal)

- Textarea input with Enter to send, Shift+Enter for newlines.
- Send button.
- Wire submit to `POST /api/conversations/:id/prompt` with the text payload.
- Disable input while the agent is responding; show an abort/cancel action.

### Start Fresh

- "Start Fresh" button/action in the chat header or toolbar.
- Calls `POST /api/agents/:id/conversations/start-fresh`, receives the new empty conversation, and switches the view to it.

### Previous Conversations

- Secondary UI element (dropdown, drawer, or sidebar section) listing previous conversations for the current agent.
- Calls `GET /api/agents/:id/conversations` to populate the list.
- Selecting a conversation loads it via `GET /api/agents/:id/conversations/:conversationId`.
- Previous conversations are accessible but not the primary navigation — the active conversation is always front and center.

### Mid-Session Interactive Docks

These are critical for a functional chat — without them, the user cannot respond when the agent asks a question or requests permission.

- **Question dock**: when the agent emits a `question` tool call (multi-step wizard, single/multi-select + custom answer), replace the normal composer with a question UI. The user's answer is sent back to continue the conversation.
- **Permission dock**: when the agent requests permission (Deny / Allow once / Allow always), replace the composer with permission controls. The user's response unblocks the agent.
- Both docks dismiss when answered and restore the normal composer.

### Todo Dock

- Read-only collapsible tray above the composer showing the agent's task progress from `todowrite` tool events.
- Updates as new `todowrite` parts arrive in the stream.
- No interactivity beyond expand/collapse.

## Out of Scope

- Model selector, auto-approve toggle, attachments (Sub-Epic 2).
- `#` file mentions, `/` slash commands, `!` shell mode, prompt history (Sub-Epic 2).
- Context tool grouping, diff stats badges, specialized tool renderers (Sub-Epic 3).
- Right sidebar with workspace files (Sub-Epic 3).
- Embedded terminal panel (not part of direct chat epic — terminal not built yet).
- Mobile layout adaptations (Sub-Epic 3).

## Acceptance Criteria

- Selecting an agent's chat action from the agents page opens the direct chat screen for that agent.
- The screen shows the current agent identity and message history for the active conversation.
- Sending a prompt adds it to the conversation and the agent's response streams in progressively with Markdown formatting.
- Tool calls are shown inline as expandable cards with name, status, and details.
- "Start Fresh" creates a new conversation and opens it.
- Previous conversations are accessible from a secondary UI element and can be loaded.
- When the agent asks a question, the question dock appears and the user can answer.
- When the agent requests permission, the permission dock appears and the user can respond.
- The todo dock shows task progress above the composer.
- The composer is disabled during agent responses with an abort option available.

## Key Files to Create/Modify

- `packages/frontend/src/pages/WorkspaceChatPage.tsx` — replace placeholder with full implementation
- `packages/frontend/src/components/chat/` — new directory for chat components:
  - `MessageTimeline.tsx` — scrollable message list
  - `MessageBubble.tsx` — single user or assistant message
  - `ToolCallCard.tsx` — generic collapsible tool call card
  - `ChatComposer.tsx` — textarea + send + abort
  - `QuestionDock.tsx` — question response UI
  - `PermissionDock.tsx` — permission response UI
  - `TodoDock.tsx` — read-only task progress
  - `ConversationList.tsx` — previous conversations
- `packages/frontend/src/hooks/useConversation.ts` — data fetching and state for current conversation
- `packages/frontend/src/hooks/useStreaming.ts` — SSE/streaming connection management
- `packages/frontend/src/lib/markdown.ts` — markdown rendering utilities

## Reference

- Backend routes: `packages/backend/src/routes/conversations.ts`
- Backend service: `packages/backend/src/services/conversation-service.ts`
- Shared schemas: `packages/shared/src/schemas/conversations.ts`
- OpenCode example session page: `examples/opencode/packages/app/src/pages/session.tsx`
- OpenCode example message parts: `examples/opencode/packages/ui/src/components/message-part.tsx`
- OpenCode example session turn: `examples/opencode/packages/ui/src/components/session-turn.tsx`
