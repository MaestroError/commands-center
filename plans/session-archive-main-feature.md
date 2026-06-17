# Session Archive Main Feature Plan

## Goal

Implement a non-authoritative session archive mirror for chat and task-run sessions.

The archive should make history traceable, checkable, and researchable by humans and specialists without making filesystem history the source of truth. SQLite remains the source for listing, ownership checks, current/deleted state, and runtime history.

This plan excludes MCP tools.

## Blocked By:

- `plans/session-archive-initialization.md`
- Runtime config has canonical session archive paths.
- Task context attachment and published artifact storage use only the new session archive paths.
- Product decision: choose default archive mode and interval.

## Design Principles

- No reconciler. Do not rebuild SQLite from archive files.
- Archive failures must not fail chat or task execution.
- SQLite remains authoritative for session existence, ownership, status, and listing.
- Archive files are optimized for inspection and search by agents and humans.
- Avoid rewriting whole transcripts on every message.
- Use append/debounce for lightweight live capture and async materialization for readable markdown.
- Keep archive writes bounded and backpressure-aware.

## New Service

Add:

```text
packages/backend/src/services/session-archive-service.ts
```

The service owns:

- path resolution
- folder creation
- metadata writing
- message JSONL appending
- transcript materialization
- stale metadata tracking
- archive cleanup on conversation deletion

## Identity & Naming Decision

Consistent with `plans/session-archive-initialization.md`, all archive folders are keyed by **`agentId`** (the specialist id stored on the conversation/task/run), NOT the mutable `slug`. The folder layout is `sessions/specialists/<agentId>/...`, matching where task context attachments and published artifacts already write. Wherever this plan says `specialistSlug` in a path resolver, read it as `agentId`. `metadata.json` still records the specialist `id`, `slug`, and `name` for human/agent readability, but only `id` (agentId) determines the path.

## Public Service Shape

Suggested methods:

```ts
type SessionArchiveService = {
  resolveChatArchivePath(input: { agentId: string; conversationId: string }): string;

  resolveTaskRunArchivePath(input: { agentId: string; taskId: string; taskRunId: string }): string;

  ensureChatArchive(input: ChatArchiveInput): Promise<SessionArchiveMetadata>;
  ensureTaskRunArchive(input: TaskRunArchiveInput): Promise<SessionArchiveMetadata>;

  appendMessages(input: {
    metadata: SessionArchiveMetadataInput;
    messages: ConversationMessage[];
  }): Promise<void>;

  materialize(input: { archivePath: string; force?: boolean }): Promise<SessionArchiveMetadata>;

  materializeDueSessions(input: {
    limit?: number;
  }): Promise<{ materialized: number; skipped: number; failed: number }>;

  removeArchive(input: { archivePath: string }): Promise<void>;
};
```

Use concrete types once the implementation has the final schema names.

## Archive Metadata

Each chat/task-run session folder gets `metadata.json`.

Required fields:

```json
{
  "version": 1,
  "kind": "chat",
  "specialist": {
    "id": "...",
    "slug": "...",
    "name": "..."
  },
  "conversationId": "...",
  "opencodeSessionId": "...",
  "source": "chat",
  "taskId": null,
  "taskRunId": null,
  "title": "Optional title",
  "status": "active",
  "createdAt": "...",
  "updatedAt": "...",
  "messageCount": 15,
  "lastAppendedAt": "...",
  "lastMaterializedAt": "...",
  "lastMaterializedMessageCount": 12,
  "files": {
    "messages": "messages.jsonl",
    "transcript": "transcript.md"
  }
}
```

For task-run sessions:

- `kind: "task_run"`
- `source: "task_run"`
- include `taskId`
- include `taskRunId`
- include task title if cheaply available
- include task-run status/outcome if cheaply available

The materialization fields are important because a specialist may inspect the folder before the transcript catches up. If `messageCount > lastMaterializedMessageCount`, the agent should read the tail of `messages.jsonl`.

## Messages JSONL

`messages.jsonl` is the lightweight append format.

Write one JSON object per finalized message:

```json
{
  "id": "...",
  "role": "assistant",
  "content": "...",
  "parts": [],
  "attachments": [],
  "error": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

Rules:

- Append only finalized messages, not streaming deltas.
- Avoid duplicate messages by tracking message ids already present in metadata or by reading the last appended ids when needed.
- Preserve enough structured data for later transcript generation.
- Keep raw tool arguments and outputs in JSONL only if they are already in sanitized stored message parts and not excessively large.
- Consider truncating huge tool payloads with a marker and byte count.

## Transcript Materialization

`transcript.md` is a readable derivative generated from `messages.jsonl`.

Rules:

- Write asynchronously.
- Do not regenerate on every message.
- Generate on task-run completion.
- Generate periodically for active chats according to settings.
- Generate on demand when a service caller requests `force: true`.
- Write with atomic file replacement.
- Update `metadata.json` after successful materialization.

Markdown format with XML-like wrappers:

```md
# Session: <title or id>

- Specialist: <name> (`<slug>`)
- Source: chat
- Conversation ID: `<id>`
- OpenCode Session ID: `<id>`
- Last materialized: <timestamp>
- Materialized messages: 12 / 15

## Messages

<user_message id="<message-id>" timestamp="<timestamp>">

...

</user_message>

<agent_message id="<message-id>" timestamp="<timestamp>">

...

<tool_calls>
<tool_call name="<tool_name>" status="completed" />
</tool_calls>

</agent_message>
```

Keep tool call rendering simple:

- tool name
- status
- one self-closing tag per call
- no raw arguments by default
- no raw outputs by default

## Write Strategy

### Immediate Writes

Write immediately:

- session folder on first archive touch
- `metadata.json` on session creation/update
- task context attachments
- published artifact copies

### Debounced Appends

Append messages using an in-memory queue:

- queue by archive path
- batch messages per session
- flush every few seconds or after N queued messages
- respect write backpressure
- log and drop/retry according to failure policy

Suggested initial defaults:

- flush interval: 2 seconds
- max queued messages per session before flush: 10
- max total queued messages: choose a conservative cap and log pressure

### Periodic Materialization

Add a background scheduler/task inside backend runtime:

- default interval: 24 hours
- configurable via settings/preferences
- processes sessions whose `messageCount > lastMaterializedMessageCount`
- small batch limit per tick
- never blocks request handling

Also materialize:

- task-run session after terminal run completion

## Settings

Add workspace/user settings for archive behavior.

Suggested schema:

```ts
{
  sessionArchiveEnabled: boolean;
  sessionArchiveAppendMode: "off" | "debounced";
  sessionArchiveMaterializeIntervalMinutes: number;
}
```

Suggested defaults:

- `sessionArchiveEnabled: true`
- `sessionArchiveAppendMode: "debounced"`
- `sessionArchiveMaterializeIntervalMinutes: 1440`

Use existing settings patterns and file-first settings helpers where appropriate.

## Integration Points

### ConversationService

After `syncConversation(...)`:

- pass the current conversation summary and messages to `SessionArchiveService`.
- append only messages not already archived.
- update metadata `messageCount` and `updatedAt`.

Note: `syncConversation(...)` fully deletes and re-inserts the SQLite `messages` rows from OpenCode on every sync. Archive append dedupe by message id (against `messages.jsonl`/metadata) is therefore load-bearing, not optional — never assume SQLite holds an incremental delta.

For `sendPromptAsync(...)`:

- no archive append happens immediately because it does not sync messages.
- rely on later sync paths or event-based sync if available.

For `deleteConversation(...)`:

- after ownership validation, resolve archive folder.
- delete the archive folder.
- then delete SQLite rows as today.

### TaskExecutionService

On task-run creation/start:

- ensure task-run archive folder and metadata exist.

On task-run terminal state:

- sync/append latest conversation messages if available.
- materialize `transcript.md`.
- update task-run metadata status/outcome.

### TaskContextAttachmentService

Use session archive path resolver for new task context attachments.

### TaskArtifactService

Use session archive path resolver for new published artifact copies.

Keep artifact references in `task_runs.artifacts_json` as metadata; do not move original artifact files.

## Failure Handling

- Archive write failure logs a warning with archive path and operation.
- Chat/task execution continues.
- Materialization failures do not block future append writes.
- A corrupt archive metadata file should be moved aside or fail only archive operations, not app runtime.
- Filesystem migration failures remain fail-fast because those happen before normal startup.

## Tests

Add unit tests for `SessionArchiveService`:

- resolves chat archive path.
- resolves task-run archive path.
- creates metadata.
- appends messages without duplicating already-archived ids.
- updates `messageCount` and `lastAppendedAt`.
- materializes transcript and updates `lastMaterializedAt`.
- records `lastMaterializedMessageCount`.
- preserves stale state when messages are appended after materialization.
- deletes archive folder.

Add integration tests:

- conversation sync appends archived messages.
- conversation delete removes archive folder.
- task-run completion materializes transcript.
- archive failures are logged and do not fail the conversation/task operation.

## Verification

- Run focused service tests.
- Run focused conversation-service tests.
- Run focused task-execution tests.
- Run `pnpm lint`.
- Run `pnpm test`.
