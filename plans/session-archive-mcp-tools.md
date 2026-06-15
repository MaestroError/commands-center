# Session Archive Conversation MCP Tools Plan

## Goal

Add self-scoped conversation history tools that let a specialist discover its sessions through SQLite and inspect a specific session through the archive folder.

These tools should return paths to archive folders instead of dumping full transcripts into MCP responses.

## Blocked By:

- `plans/session-archive-initialization.md`
- `plans/session-archive-main-feature.md`
- `SessionArchiveService` can resolve chat and task-run archive paths.
- Conversation archive metadata includes `lastMaterializedAt`, `lastMaterializedMessageCount`, and `messageCount`.

## Tools

| Tool                      | Context | Purpose                                                            |
| ------------------------- | ------- | ------------------------------------------------------------------ |
| `list_self_conversations` | `both`  | List conversation/session summaries for the calling specialist.    |
| `get_self_conversation`   | `both`  | Return the archive folder path for one owned conversation/session. |

`search_self_history` remains out of scope until OpenCode session/file-search direction is confirmed.

## Ownership Rules

Both tools resolve the calling specialist from MCP `context.agentSlug`.

Rules:

- A specialist can list only conversations where `conversation.agentId === callingSpecialistId`.
- A specialist can get only a conversation where `conversation.agentId === callingSpecialistId`.
- Knowing another conversation id is not enough to get its archive path.
- Task-run conversations are still self-scoped by conversation owner.

## `list_self_conversations`

### Context

`both`

### Input

```ts
{
  limit?: number;
  source?: "chat" | "task_run" | "all";
}
```

Defaults:

- `limit = 10`
- `source = "all"`

Limits:

- cap `limit` at 50.

### Behavior

- Query SQLite, not archive files.
- Sort by `updatedAt desc`.
- Return summaries only.
- Do not return archive folder paths by default.
- Include enough ids for the agent to ask for a specific conversation with `get_self_conversation`.

### Output

```ts
{
  conversations: Array<{
    id: string;
    title?: string;
    source: "chat" | "task_run";
    taskId?: string;
    taskRunId?: string;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

Optional additions:

- `hasArchive?: boolean`
- `lastMaterializedAt?: string`
- `staleMessageCount?: number`

Do not include `archivePath` here.

## `get_self_conversation`

### Context

`both`

### Input

```ts
{
  conversationId: string;
  materialize?: boolean;
}
```

Defaults:

- `materialize = false`

### Behavior

1. Resolve caller specialist id.
2. Load conversation from SQLite by `conversationId`.
3. Require ownership.
4. Resolve archive folder path through `SessionArchiveService`.
5. Ensure metadata exists if archive is enabled.
6. If `materialize === true`, request materialization before returning.
7. Return folder path and materialization metadata.

### Output

```ts
{
  conversation: {
    id: string;
    title?: string;
    source: "chat" | "task_run";
    taskId?: string;
    taskRunId?: string;
    messageCount: number;
    updatedAt: string;
  };
  archive: {
    path: string;
    metadataPath: string;
    messagesPath: string;
    transcriptPath: string;
    lastMaterializedAt?: string;
    lastMaterializedMessageCount: number;
    messageCount: number;
    isTranscriptStale: boolean;
  };
  instruction: string;
}
```

Example instruction:

```text
Check this folder for the requested session data: /absolute/path/to/session
```

If `isTranscriptStale` is true, include:

```text
The transcript may not include the latest messages. Compare metadata.messageCount with metadata.lastMaterializedMessageCount and read messages.jsonl for the tail.
```

## Implementation Path

Add:

```text
packages/backend/src/mcp/cc-managed/groups/cc-default/tools/self-conversation-tools.ts
```

Register in:

```text
packages/backend/src/mcp/cc-managed/server-registry.ts
```

Add service helpers if useful:

```ts
conversationService.listForAgent(agentId, { limit, source });
conversationService.getForAgent(agentId, conversationId);
```

Or keep query logic local to the tool only if the service change would be heavier than the tool itself.

Prefer using `ConversationService` for consistency and ownership readability.

## Tool Availability

These tools should live in `cc_default` because every specialist can inspect its own history.

Context:

- chat: available
- task-run: available

They are read-only except optional on-demand materialization.

## Archive Disabled Behavior

If session archive is disabled:

- `list_self_conversations` still works from SQLite.
- `get_self_conversation` returns a clear tool error or structured state:

```ts
{
  archive: {
    enabled: false;
  }
}
```

Choose one behavior during implementation. Prefer structured non-error if the conversation exists and ownership is valid.

## Tests

Add MCP route tests:

- chat token lists both tools.
- task-run token lists both tools.
- `list_self_conversations` defaults to 10.
- `list_self_conversations` caps limit at 50.
- `list_self_conversations` filters by caller specialist.
- `list_self_conversations` does not return archive paths.
- `get_self_conversation` returns archive path for owned chat conversation.
- `get_self_conversation` returns archive path for owned task-run conversation.
- `get_self_conversation` refuses another specialist's conversation id.
- `get_self_conversation` returns stale materialization metadata.
- `get_self_conversation` with `materialize: true` triggers materialization.

Add service/tool unit tests for archive-disabled behavior.

## Verification

- Run focused MCP route tests.
- Run focused conversation archive service tests.
- Run `pnpm lint`.
- Run `pnpm test`.
