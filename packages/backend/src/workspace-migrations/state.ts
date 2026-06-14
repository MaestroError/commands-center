import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Logger } from "pino";
import { z } from "zod";

import { writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

import type { AppliedWorkspaceMigration, WorkspaceMigrationState } from "./types.js";

const appliedWorkspaceMigrationSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  appliedAt: z.string().datetime(),
});

const workspaceMigrationStateSchema = z.object({
  version: z.literal(1),
  applied: z.array(appliedWorkspaceMigrationSchema),
});

export function workspaceMigrationDirectory(config: RuntimeConfig): string {
  return resolve(config.paths.workspaceDir, ".cc-migrations");
}

export function workspaceMigrationStatePath(config: RuntimeConfig): string {
  return resolve(workspaceMigrationDirectory(config), "state.json");
}

export async function readWorkspaceMigrationState(
  config: RuntimeConfig,
  logger?: Logger,
): Promise<WorkspaceMigrationState> {
  const path = workspaceMigrationStatePath(config);
  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyWorkspaceMigrationState();
    }

    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logger?.error({ path, err: error }, "workspace migration state contains invalid JSON");
    throw new Error(`Workspace migration state contains invalid JSON: ${path}`);
  }

  const state = workspaceMigrationStateSchema.safeParse(parsed);
  if (!state.success) {
    logger?.error(
      { path, issues: state.error.issues },
      "workspace migration state failed schema validation",
    );
    throw new Error(`Workspace migration state failed schema validation: ${path}`);
  }

  return state.data;
}

export async function writeWorkspaceMigrationState(
  config: RuntimeConfig,
  state: WorkspaceMigrationState,
): Promise<void> {
  await writeConfigFileAtomic(
    workspaceMigrationStatePath(config),
    workspaceMigrationStateSchema.parse(state),
  );
}

export function emptyWorkspaceMigrationState(): WorkspaceMigrationState {
  return { version: 1, applied: [] };
}

export function appendAppliedMigration(
  state: WorkspaceMigrationState,
  migration: Omit<AppliedWorkspaceMigration, "appliedAt">,
  appliedAt: Date,
): WorkspaceMigrationState {
  return {
    version: 1,
    applied: [
      ...state.applied,
      {
        ...migration,
        appliedAt: appliedAt.toISOString(),
      },
    ],
  };
}

export function removeLatestAppliedMigration(
  state: WorkspaceMigrationState,
): WorkspaceMigrationState {
  return {
    version: 1,
    applied: state.applied.slice(0, -1),
  };
}
