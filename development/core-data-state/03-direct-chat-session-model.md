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
