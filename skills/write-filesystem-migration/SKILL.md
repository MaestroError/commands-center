---
name: write-filesystem-migration
description: Use when adding or reviewing CommandsCenter workspace filesystem migrations that transform portable workspace files or directories across app versions. Covers migration boundaries, idempotency, failure behavior, and tests.
---

# Write Filesystem Migration

Use this skill when adding a one-time migration for CommandsCenter workspace
files. SQLite is a derived runtime cache; workspace files are the portable
source of truth.

## Migration Contract

Each migration must be:

- **Ordered**: use a monotonic id such as `0001-specialists-rename`.
- **Idempotent**: running it twice must produce the same final workspace.
- **Restartable**: if the process stops halfway, the next boot must either finish
  the migration or fail with a clear error before marking it applied.
- **Reversible**: provide both `up()` and `down()`. Automatic startup uses
  `up()`; manual rollback uses `down()` for the latest applied migration only.
- **Workspace-only**: do not read or write SQLite from a filesystem migration.
  Reconciliation rebuilds the derived DB after migrations finish.
- **Explicit**: migrate only known CC-owned paths and schemas. Do not recursively
  rewrite arbitrary user files.
- **Atomic where practical**: write JSON with the repo atomic config writer; use
  `rename` for file and directory moves on the same filesystem.
- **Fail-fast**: structural migration errors should abort startup. A half-updated
  source-of-truth workspace is worse than a partial app boot.

## Idempotency Rules

Before changing anything, detect the current state:

- If the old source exists and the new target does not, move or rewrite.
- If the new target exists and the old source does not, treat as already moved.
- If both old and new exist, do not guess. Either merge only with a migration-
  specific deterministic rule, or throw a clear conflict error.
- If neither exists, no-op unless that path is required for the migration.

For JSON rewrites:

- Parse and validate known JSON files before writing.
- Preserve unknown fields unless the migration intentionally removes them.
- Write only when the transformed value differs.
- If a file is invalid JSON or has an unexpected shape, throw; do not silently
  replace it with defaults.

For rollback:

- Reverse only the changes introduced by the migration.
- Use the same conflict rules in the opposite direction.
- If rollback could overwrite newer workspace data, throw a clear conflict error
  and leave migration state unchanged.

## Recommended Shape

```ts
export const migration = {
  id: "0001-example",
  description: "Short human-readable description.",
  async up({ config, logger }) {
    // Detect state first.
    // Apply deterministic forward changes.
    // Throw clear errors for conflicts.
  },
  async down({ config, logger }) {
    // Detect state first.
    // Apply deterministic rollback changes.
    // Throw clear errors for conflicts.
  },
};
```

Helpers should stay small and migration-local unless reused by a second
migration with the same shape.

## Testing Checklist

For each migration, add tests for:

- Fresh/current workspace: migration no-ops and records as applied.
- Old workspace: migration transforms all expected files and directories.
- Re-run after success: migration stays a no-op.
- Partial state: migration resumes safely or throws the intended conflict.
- Conflict state: old and new paths both exist where automatic merge is unsafe.
- Invalid known JSON: migration fails without writing a replacement.
- Rollback: `down()` reverses expected changes, is idempotent, and leaves state
  unchanged on failure.
- Rebuild path: after migration, boot reconciliation restores the expected DB
  state from migrated workspace files.

Run backend tests for the migration service and any affected reconcilers.
