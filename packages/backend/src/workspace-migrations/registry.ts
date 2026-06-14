import type { AppliedWorkspaceMigration, WorkspaceMigration } from "./types.js";

export { workspaceMigrations } from "./migrations/index.js";

export function validateWorkspaceMigrationRegistry(
  migrations: readonly WorkspaceMigration[],
): void {
  const seen = new Set<string>();
  let previousId = "";

  for (const migration of migrations) {
    if (seen.has(migration.id)) {
      throw new Error(`Duplicate workspace migration id: ${migration.id}`);
    }

    if (previousId && migration.id <= previousId) {
      throw new Error(
        `Workspace migrations must be sorted by id: ${migration.id} appears after ${previousId}`,
      );
    }

    seen.add(migration.id);
    previousId = migration.id;
  }
}

export function listPendingWorkspaceMigrations(options: {
  applied: readonly AppliedWorkspaceMigration[];
  migrations: readonly WorkspaceMigration[];
}): WorkspaceMigration[] {
  validateWorkspaceMigrationRegistry(options.migrations);
  assertAppliedMigrationsKnown(options.applied, options.migrations);

  const appliedIds = new Set(options.applied.map((migration) => migration.id));
  return options.migrations.filter((migration) => !appliedIds.has(migration.id));
}

export function findLatestAppliedWorkspaceMigration(options: {
  applied: readonly AppliedWorkspaceMigration[];
  migrations: readonly WorkspaceMigration[];
}): WorkspaceMigration | undefined {
  validateWorkspaceMigrationRegistry(options.migrations);
  assertAppliedMigrationsKnown(options.applied, options.migrations);

  const latest = options.applied.at(-1);
  if (!latest) {
    return undefined;
  }

  return options.migrations.find((migration) => migration.id === latest.id);
}

function assertAppliedMigrationsKnown(
  applied: readonly AppliedWorkspaceMigration[],
  migrations: readonly WorkspaceMigration[],
): void {
  for (const [index, appliedMigration] of applied.entries()) {
    const registeredMigration = migrations[index];

    if (!registeredMigration) {
      throw new Error(
        `Workspace migration '${appliedMigration.id}' is recorded as applied but is not known to this build.`,
      );
    }

    if (registeredMigration.id !== appliedMigration.id) {
      const knownIds = new Set(migrations.map((migration) => migration.id));

      if (!knownIds.has(appliedMigration.id)) {
        throw new Error(
          `Workspace migration '${appliedMigration.id}' is recorded as applied but is not known to this build.`,
        );
      }

      throw new Error(
        `Workspace migration state is out of order: expected '${registeredMigration.id}' at position ${String(index + 1)} but found '${appliedMigration.id}'.`,
      );
    }
  }
}
