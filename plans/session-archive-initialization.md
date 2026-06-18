# Session Archive Initialization Plan

## Goal

Prepare CommandsCenter's workspace layout and runtime configuration for a non-authoritative session archive mirror.

This phase changes the current filesystem shape so future chat/task-run archive files, task context attachments, and published task artifact copies live under `sessions/`.

This is a testing-instance cleanup migration. Existing top-level session-related runtime files can be deleted.

## Blocked By:

- Product decision: session archive files are a mirror only, not a source of truth and not used for boot reconciliation.
- Product decision: existing top-level `task-context-attachments/` and `task-artifacts/` should be deleted by the filesystem migration.
- Product decision: accept a destructive cleanup migration for this testing instance.

## Current State

Task context attachments:

- Files are currently stored under `workspace/task-context-attachments/<task-title>-<task-id>/<attachment-id>.<ext>`.
- `TaskContextAttachment.storageKey` currently stores `<task-title>-<task-id>/<attachment-id>.<ext>`.
- The task-run prompt renders these as `.cc/workspace/task-context-attachments/<storageKey>`.
- Attachments are task-level. There are no task-run-level attachments.

Task artifacts:

- `add_task_artifact` stores artifact metadata in `task_runs.artifacts_json`.
- Original artifact files remain where the specialist created them, usually inside that specialist's workspace.
- There are no task-level artifact files.
- `workspace/task-artifacts/` is used only after public sharing is requested.
- Public sharing copies a local artifact into `task-artifacts/<taskId>/<runId>/<artifactId>/<filename>` and records it in `task-artifacts/artifacts.json`.

Chat attachments:

- Chat attachments are sent to OpenCode as data URLs.
- Synced messages store attachment metadata in SQLite `messages.attachments_json`.
- CC does not currently copy chat attachments into a managed attachment folder.

## Identity & Naming Decisions

- Session archive paths identify the specialist by **`agentId`** (the specialist id stored on the task/run), NOT the mutable `slug`. This keeps archive paths stable across specialist renames and avoids a new `specialistService` dependency in the attachment/artifact services. Wherever this plan says `<specialist-slug>`, read it as `<agentId>`.
- The published-artifact registry stays a **single session-local manifest** (one `artifacts.json` under `sessions/`), so `TaskArtifactService.getRegisteredArtifact(artifactId)` keeps its lookup-by-id contract and the share-link service needs no signature change. Only the published artifact _files_ move to the per-run `published-artifacts/` folder.

### Follow-up UI scope (agents list page)

Add an "Open session archive" action on the agents list page that resolves a specialist's `sessions/specialists/<agentId>/` path and opens it in the OS file manager. (Tracked as part of this work but is the UI/endpoint layer on top of the path changes below.)

## Target Workspace Shape

New session archive root (`<specialist-slug>` folders are named by `agentId` per the decision above):

```text
sessions/
  specialists/
    <agentId>/
      chats/
        <conversation-id>/
          metadata.json
          messages.jsonl
          transcript.md

      tasks/
        <task-id>/
          metadata.json
          context.md
          context-attachments/
            <attachment-id>.<ext>

          runs/
            <run-id>/
              metadata.json
              messages.jsonl
              transcript.md
              artifacts.json
              published-artifacts/
                <artifact-id>/
                  <filename>
```

## Filesystem Migration

Use the `write-filesystem-migration` skill rules.

### Migration File

Add:

```text
packages/backend/src/workspace-migrations/migrations/0003-session-archive-layout.ts
```

Register it in:

```text
packages/backend/src/workspace-migrations/migrations/index.ts
```

Suggested id:

```text
0003-session-archive-layout
```

### `up()` Behavior

1. Ensure `workspace/sessions/` exists.
2. Ensure `workspace/sessions/specialists/` exists.
3. Delete `workspace/task-context-attachments/` when it exists.
4. Delete `workspace/task-artifacts/` when it exists.
5. Treat missing deleted roots as no-op.

### `down()` Behavior

This migration intentionally deletes old testing-instance runtime files. Rollback cannot restore deleted file contents.

`down()` should:

1. Remove empty `workspace/sessions/specialists/` when safe.
2. Remove empty `workspace/sessions/` when safe.
3. Throw when removing `sessions/` would delete non-empty session archive data created after migration.

## Runtime Config Changes

Update `RuntimeConfig.paths.subdirectories`:

- Keep `sessions: resolve(workspaceDir, "sessions")`.
- Add or derive:
  - `sessionSpecialists: resolve(workspaceDir, "sessions", "specialists")`
- Change canonical future paths:
  - task context attachments: under `sessions/specialists/<agentId>/tasks/<taskId>/context-attachments`
  - published task artifacts: under `sessions/specialists/<agentId>/tasks/<taskId>/runs/<runId>/published-artifacts`
- The old `taskContextAttachments` and `taskArtifacts` subdirectory entries are no longer used for new writes. Remove them (now that the migration deletes the dirs) or leave them only if still referenced; prefer removing once all references are migrated.

## Service Path Changes

### Task Context Attachments

Update `TaskContextAttachmentService` path behavior:

- New writes use the session archive task folder.
- Reads resolve only the new session task attachment storage keys.
- `removeForTask` removes the new task-level context attachment folder.

Storage key for new task context attachments:

```text
specialists/<agentId>/tasks/<task-id>/context-attachments/<attachment-id>.<ext>
```

Notes:

- `resolveStoragePath` currently asserts exactly 2 path segments; rewrite it for the new 5-segment key and resolve relative to `sessions/`.
- `removeForTask` currently keys off `storageKey.split("/")[0]`; update it to remove the new per-task `context-attachments` folder.

The service should derive the full absolute path from `sessions/`, not duplicate `.cc/workspace` path strings.

### Task Run Prompt Paths

Update `TaskRunContextService` so rendered attachment paths use the new session path. The `TASK_CONTEXT_ATTACHMENT_PATH_PREFIX` constant changes from `.cc/workspace/task-context-attachments` to `.cc/workspace/sessions` (the new storageKey already begins with `specialists/<agentId>/...`).

Do not hardcode `.cc/workspace/task-context-attachments`.

### Published Task Artifacts

Update `TaskArtifactService` path behavior:

- New public-share copies go under the run's `published-artifacts/` folder.
- The artifact manifest stays a single **session-local** `artifacts.json` (under `sessions/`), NOT global `task-artifacts/` and NOT run-local. `getRegisteredArtifact(artifactId)` keeps its lookup-by-id signature.
- Reads resolve only the new session-local published artifact storage keys.
- `resolveArtifactStoragePath` currently asserts exactly 4 segments and resolves relative to `subdirectories.taskArtifacts`; rewrite it for the new 6-segment key resolved relative to `sessions/`.

New storage key:

```text
specialists/<agentId>/tasks/<task-id>/runs/<run-id>/published-artifacts/<artifact-id>/<filename>
```

## Tests

Add workspace migration tests:

- Fresh workspace no-ops and records migration.
- Workspace with old `task-context-attachments/` deletes that directory.
- Workspace with old `task-artifacts/` deletes that directory.
- Re-running migration is a no-op.
- `down()` removes empty session roots when safe.
- `down()` refuses to remove non-empty new session archive data.

Add service tests:

- New task context attachments write under the session task folder.
- Task context attachment reads use only the new storage key layout.
- New public-share artifact copies write under the run `published-artifacts/` folder.
- Public-share artifact reads use only the new storage key layout.

## Verification

- Run focused workspace migration tests.
- Run focused task context attachment tests.
- Run focused task artifact/share-link tests.
- Run `pnpm lint`.
- Run `pnpm test`.
