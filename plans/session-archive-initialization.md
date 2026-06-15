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

## Target Workspace Shape

New session archive root:

```text
sessions/
  specialists/
    <specialist-slug>/
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
  - task context attachments: under `sessions/specialists/<slug>/tasks/<taskId>/context-attachments`
  - published task artifacts: under `sessions/specialists/<slug>/tasks/<taskId>/runs/<runId>/published-artifacts`

## Service Path Changes

### Task Context Attachments

Update `TaskContextAttachmentService` path behavior:

- New writes use the session archive task folder.
- Reads resolve only the new session task attachment storage keys.
- `removeForTask` removes the new task-level context attachment folder.

Storage key recommendation for new task context attachments:

```text
specialists/<specialist-slug>/tasks/<task-id>/context-attachments/<attachment-id>.<ext>
```

The service should derive the full absolute path from `sessions/`, not duplicate `.cc/workspace` path strings.

### Task Run Prompt Paths

Update `TaskRunContextService` so rendered attachment paths use the new session path.

Do not hardcode `.cc/workspace/task-context-attachments`.

### Published Task Artifacts

Update `TaskArtifactService` path behavior:

- New public-share copies go under the run's `published-artifacts/` folder.
- New artifact manifest path should be run-local or session-local, not global.
- Reads resolve only the new run-local/session-local published artifact paths.

Recommended new storage key:

```text
specialists/<specialist-slug>/tasks/<task-id>/runs/<run-id>/published-artifacts/<artifact-id>/<filename>
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
