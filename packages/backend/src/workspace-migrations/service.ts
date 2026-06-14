import type { Logger } from "pino";

import type { RuntimeConfig } from "../lib/runtime-config.js";

import {
  findLatestAppliedWorkspaceMigration,
  listPendingWorkspaceMigrations,
  workspaceMigrations,
} from "./registry.js";
import {
  appendAppliedMigration,
  readWorkspaceMigrationState,
  removeLatestAppliedMigration,
  writeWorkspaceMigrationState,
} from "./state.js";
import type { AppliedWorkspaceMigration, WorkspaceMigration } from "./types.js";

export type RunWorkspaceMigrationsResult = {
  applied: AppliedWorkspaceMigration[];
};

export type RollbackWorkspaceMigrationResult = {
  rolledBack?: AppliedWorkspaceMigration;
};

export async function runWorkspaceMigrations(options: {
  config: RuntimeConfig;
  logger: Logger;
  migrations?: readonly WorkspaceMigration[];
  now?: () => Date;
}): Promise<RunWorkspaceMigrationsResult> {
  const migrations = options.migrations ?? workspaceMigrations;
  let state = await readWorkspaceMigrationState(options.config, options.logger);
  const pending = listPendingWorkspaceMigrations({
    applied: state.applied,
    migrations,
  });
  const applied: AppliedWorkspaceMigration[] = [];

  for (const migration of pending) {
    options.logger.info({ migration: migration.id }, "workspace migration started");

    await migration.up({
      config: options.config,
      logger: options.logger,
    });

    state = appendAppliedMigration(
      state,
      {
        id: migration.id,
        description: migration.description,
      },
      options.now?.() ?? new Date(),
    );
    await writeWorkspaceMigrationState(options.config, state);

    const appliedMigration = state.applied.at(-1);
    if (appliedMigration) {
      applied.push(appliedMigration);
    }

    options.logger.info({ migration: migration.id }, "workspace migration completed");
  }

  return { applied };
}

export async function rollbackLatestWorkspaceMigration(options: {
  config: RuntimeConfig;
  logger: Logger;
  migrations?: readonly WorkspaceMigration[];
}): Promise<RollbackWorkspaceMigrationResult> {
  const migrations = options.migrations ?? workspaceMigrations;
  const state = await readWorkspaceMigrationState(options.config, options.logger);
  const latestApplied = state.applied.at(-1);
  const migration = findLatestAppliedWorkspaceMigration({
    applied: state.applied,
    migrations,
  });

  if (!latestApplied || !migration) {
    return {};
  }

  options.logger.warn({ migration: migration.id }, "workspace migration rollback started");

  await migration.down({
    config: options.config,
    logger: options.logger,
  });

  await writeWorkspaceMigrationState(options.config, removeLatestAppliedMigration(state));

  options.logger.warn({ migration: migration.id }, "workspace migration rollback completed");

  return { rolledBack: latestApplied };
}
