# Plan: Workspace Filesystem Migrations

## Goal

Add a first-class migration system for CommandsCenter workspace files. The
workspace filesystem is the portable source of truth; SQLite is a derived
runtime cache. When a new app version requires a different workspace layout or
file schema, CommandsCenter must be able to upgrade the workspace before DB
reconciliation runs.

This system does not need backwards-compatible old APIs or old workspace
surfaces. It does need safe forward migration and a manual rollback path for
operator intervention.

## Scope

Filesystem migrations cover CC-owned portable workspace files and directories:

- workspace directory layout
- CC metadata JSON files
- CC configuration files under `configuration/`
- CC-managed tool, MCP, auth, preference, task-template, and workspace entries
- future source-of-truth files introduced by the app

Filesystem migrations must not mutate SQLite. After filesystem migrations
finish, existing boot reconcilers rebuild the derived DB cache from workspace
files.

## Non-Goals

- No backwards-compatible aliases for old product routes, MCP tools, or API
  names.
- No generic rewrite of arbitrary user files.
- No migration of disposable runtime state such as chat history, task runs,
  provider auth runtime state, or secret values unless a future migration
  explicitly marks a file as portable source-of-truth.
- No database writes inside filesystem migrations.

## Migration Contract

Each migration lives in a separate numbered module under:

```text
packages/backend/src/workspace-migrations/migrations/
```

Each migration module exposes:

```ts
export const exampleMigration = {
  id: "0001-example",
  description: "Short human-readable description.",
  async up(context) {
    // Upgrade workspace files to the new version.
  },
  async down(context) {
    // Roll back this migration for manual intervention.
  },
} satisfies WorkspaceMigration;
```

`packages/backend/src/workspace-migrations/migrations/index.ts` is the
bundle-safe migration manifest. Add each migration export there in id order.
Do not use runtime filesystem scanning or glob imports for registration; the
CLI is bundled into a single file, so static imports are the reliable path.

Rules:

- `id` is monotonic and unique, e.g. `0001-specialists-rename`.
- `up()` and `down()` are both idempotent.
- `up()` and `down()` are restartable: after a crash, re-running the same
  operation must complete safely or throw a clear conflict error.
- `up()` is used by automatic startup and `ccenter filesystem-migrate`.
- `down()` is used only by `ccenter filesystem-rollback`.
- A migration is marked applied only after `up()` succeeds.
- A migration is removed from the applied list only after `down()` succeeds.
- Migrations fail fast on unsafe conflicts or invalid known JSON.

## State File

Store state in the workspace:

```text
<workspaceDir>/.cc-migrations/state.json
```

Initial shape:

```json
{
  "version": 1,
  "applied": [
    {
      "id": "0001-example",
      "description": "Short human-readable description.",
      "appliedAt": "2026-06-14T00:00:00.000Z"
    }
  ]
}
```

Use applied IDs rather than a single schema version. This gives better logs,
clearer manual intervention, and room for future repair migrations.

## Startup Order

Current boot order creates all configured runtime paths before DB migration and
workspace reconciliation. Filesystem migrations need a narrower pre-bootstrap
phase so a new version does not create new directories before it has migrated
old ones.

Target order:

1. Load runtime config.
2. Create only `workspaceDir` and `.cc-migrations/`.
3. Run pending filesystem migrations.
4. Bootstrap final runtime subdirectories.
5. Run SQLite migrations.
6. Run boot reconcilers.
7. Start services.

Add two runtime path helpers:

- `bootstrapWorkspaceRoot(config)`
- `bootstrapRuntimePaths(config)`

## CLI Commands

Add manual maintenance commands:

```bash
ccenter filesystem-migrate --cc-env-file /opt/commandscenter/.env
ccenter filesystem-rollback --cc-env-file /opt/commandscenter/.env
```

Behavior:

- `filesystem-migrate` loads the same env file/runtime config as `start`, runs
  all pending filesystem migrations, prints applied migration IDs, and exits.
- `filesystem-rollback` loads the same env file/runtime config as `start`, runs
  `down()` for the latest applied migration only, removes that migration from
  the applied list after success, prints the rolled-back ID, and exits.
- Both commands require an existing env file when `--cc-env-file` is supplied.
  They must not create a new env file implicitly.
- Both commands should be safe while the server is stopped. Documentation should
  recommend stopping the service before manual migrate or rollback.
- Rollback is intentionally one migration at a time. Re-run the command to roll
  back another migration.

## Proposed Files

- `packages/backend/src/workspace-migrations/types.ts`
- `packages/backend/src/workspace-migrations/state.ts`
- `packages/backend/src/workspace-migrations/registry.ts`
- `packages/backend/src/workspace-migrations/migrations/index.ts`
- `packages/backend/src/workspace-migrations/migrations/0001-example.ts`
- `packages/backend/src/workspace-migrations/service.ts`
- `packages/backend/test/workspace-migrations/state.test.ts`
- `packages/backend/test/workspace-migrations/service.test.ts`
- `packages/backend/test/workspace-migrations/startup.test.ts`
- `skills/write-filesystem-migration/SKILL.md`

## Service Design

`state.ts`:

- Read `state.json`.
- Return empty applied list when missing.
- Validate with Zod.
- Throw on invalid JSON or invalid shape.
- Write state atomically using `writeConfigFileAtomic`.

`registry.ts`:

- Import ordered migrations from the static migration manifest.
- Validate no duplicate IDs.
- Validate IDs are sorted.
- Expose helpers for pending migrations and latest applied migration.

`service.ts`:

- `runWorkspaceMigrations({ config, logger })`
- `rollbackLatestWorkspaceMigration({ config, logger })`
- For migrate:
  - read state
  - run each pending `up()`
  - write state after each successful migration
  - stop immediately on first failure
- For rollback:
  - read state
  - find latest applied migration
  - run its `down()`
  - remove it from state after success
  - no-op with a clear message if nothing is applied

## Idempotency Guidance

For path moves:

- old exists, new missing: move old to new.
- new exists, old missing: already migrated.
- both exist: throw unless the migration defines a deterministic merge.
- neither exists: no-op if optional, throw if required.

For JSON rewrites:

- validate before writing.
- preserve unknown fields unless intentionally removed.
- write only when the transformed value differs.
- fail on invalid JSON instead of overwriting it.

For rollback:

- reverse only the changes introduced by the migration.
- use the same conflict rules in the opposite direction.
- if rollback cannot safely restore a previous shape because newer user data
  would be overwritten, throw a clear conflict error and leave state unchanged.

## Testing Strategy

### State Tests

- Missing state returns `{ version: 1, applied: [] }`.
- Valid state round-trips.
- Invalid JSON throws.
- Invalid schema throws.
- Atomic write creates parent directories.
- Successful write leaves no `.tmp` file.

### Registry Tests

- Ordered unique IDs pass validation.
- Duplicate IDs throw.
- Out-of-order IDs throw.
- Pending migration calculation skips applied IDs.
- Unknown applied IDs throw, because the running app cannot safely reason about
  workspace state from a newer/different build.

### Service Tests

- Runs pending `up()` migrations in order.
- Skips already applied migrations.
- Writes state after each successful migration.
- Does not mark failed migration as applied.
- Does not run later migrations after a failure.
- Re-running after success is a no-op.
- `filesystem-rollback` runs only latest applied migration's `down()`.
- Rollback removes state only after `down()` succeeds.
- Failed rollback leaves state unchanged.
- Rollback no-ops cleanly when no migrations are applied.

### Migration Author Tests

Each concrete migration must test:

- current workspace no-ops.
- old workspace transforms to expected new layout.
- re-run after successful `up()` no-ops.
- partial `up()` state resumes or throws intended conflict.
- `down()` reverses expected changes.
- re-run after successful `down()` no-ops.
- partial `down()` state resumes or throws intended conflict.
- conflict state throws without marking state.
- invalid known JSON fails without replacement.

### Startup Integration Tests

- Startup runs filesystem migrations before `bootstrapRuntimePaths`.
- Startup runs filesystem migrations before SQLite migration and boot reconcile.
- Migration failure aborts startup before DB reconciliation.
- Rebuild guarantee covers old workspace layout:
  - create or fixture an old source-of-truth workspace
  - run filesystem migrations
  - run SQLite migrations
  - run boot reconcilers
  - assert restored configured state matches the migrated workspace

### CLI Tests

- `parseCliArgs` accepts `filesystem-migrate`.
- `parseCliArgs` accepts `filesystem-rollback`.
- Unknown command guard includes both commands.
- Both commands load env like maintenance commands.
- Both commands require an existing env file and do not create one.
- `filesystem-migrate` calls the migration service and prints applied IDs.
- `filesystem-rollback` calls rollback service and prints the rolled-back ID.

## Specialist Rename Follow-Up

The specialist rename branch should add a concrete migration after this system is
merged:

- `workspace/agents` to `workspace/specialists`
- `agent.json` to `specialist.json`
- portable JSON fields such as `defaultAgentId` to `defaultSpecialistId`
- matching `down()` for manual rollback while the server is stopped

`AGENTS.md` must remain unchanged because it is an OpenCode convention.
