# C3 Direct Chat Session Model

## Outcome

The backend supports persistent per-agent conversations, `Start Fresh`, message history, attachments metadata, and execution against the OpenCode engine.

## Why this is a separate PR

This is the backend half of the MVP centerpiece. Once merged, the chat UI can be implemented as a clean surface over stable session semantics.

## Blockers

- C1 Database and Workspace Foundation
- E2 OpenCode Orchestrator

## Unblocks

- U3 Direct Chat Screen
- I4 Automations

## Scope

- Define agent-to-default-conversation behavior
- Implement session creation, lookup, and previous-conversation access as a backend service exposed via REST API routes
- Persist user messages, assistant messages, tool call parts, and attachments metadata
- Route prompt execution through the OpenCode SDK or HTTP API via the orchestrator
- Add `Start Fresh` behavior that creates a new session while preserving the agent-centric UX model

## Acceptance Criteria

- Opening an agent can resolve its current active conversation
- Sending a prompt persists the request and response in the correct session
- `Start Fresh` creates a new empty session without deleting prior conversations
- Previous conversations remain accessible for the same agent
- Attachment metadata is persisted with the message it belongs to

## Non-Goals

- Final streaming chat UI
- File manager
- Global terminal

## Context

Reference: `examples/opencode` web app — how it consumes the `opencode serve` HTTP API.

- **Session lifecycle**: web app creates sessions lazily on first message via `sdk.session.create()`, sends prompts via `sdk.session.promptAsync()` (fire-and-forget), fetches history via `sdk.session.messages()` (paginated). Ref: `packages/app/src/components/prompt-input/submit.ts`, `packages/app/src/context/sync.tsx`
- **Prompt parts**: the prompt payload accepts an array of parts — text, file (image/document as data URL with mime), agent, subtask. Attachments are passed as `FilePartInput` directly to OpenCode. Ref: `packages/app/src/components/prompt-input/submit.ts`
- **SSE event stream**: web app opens a single SSE connection to receive all realtime updates — message parts, streaming text deltas, session status changes, todos, permission/question requests. Events are batched per ~16ms frame. Ref: `packages/app/src/context/global-sdk.tsx`, `packages/app/src/context/global-sync/event-reducer.ts`
- **Permission & question flows**: OpenCode pauses execution and emits `permission.asked` / `question.asked` events; web app presents UI and replies via `sdk.permission.respond()` / `sdk.question.reply()`. Ref: `packages/app/src/context/permission.tsx`, `packages/app/src/pages/session/composer/session-question-dock.tsx`
- **Todos**: OpenCode emits `todo.updated` events with the agent's task list; web app renders them read-only. Ref: `packages/app/src/pages/session/composer/session-todo-dock.tsx`
- **Session management**: list, archive, abort. Session is scoped to a directory (= agent workspace). Ref: `packages/sdk/js/src/v2/gen/sdk.gen.ts`
