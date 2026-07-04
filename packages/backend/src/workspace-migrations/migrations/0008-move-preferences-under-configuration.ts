import { mkdir, readdir, rename, rmdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

export const movePreferencesUnderConfigurationMigration = {
  id: "0008-move-preferences-under-configuration",
  description:
    "Move workspace preferences under configuration/preferences and remove the unused empty mcp directory.",
  async up({ config }) {
    await moveDirectory({
      from: resolve(config.paths.workspaceDir, "preferences"),
      to: resolve(config.paths.workspaceDir, "configuration", "preferences"),
      conflict:
        "Cannot move workspace preferences: both preferences/ and configuration/preferences/ exist. Merge or remove one before running migrations.",
    });
    await removeDirectoryIfEmpty(
      resolve(config.paths.workspaceDir, "mcp"),
      "Cannot remove workspace mcp directory because it is not empty. Move its contents elsewhere before running migrations.",
    );
  },
  async down({ config }) {
    await moveDirectory({
      from: resolve(config.paths.workspaceDir, "configuration", "preferences"),
      to: resolve(config.paths.workspaceDir, "preferences"),
      conflict:
        "Cannot roll back workspace preferences move: both configuration/preferences/ and preferences/ exist. Merge or remove one before rolling back.",
    });
    await ensureDirectory(resolve(config.paths.workspaceDir, "mcp"));
  },
} satisfies WorkspaceMigration;

async function moveDirectory(options: {
  from: string;
  to: string;
  conflict: string;
}): Promise<void> {
  const fromState = await directoryState(options.from);
  const toState = await directoryState(options.to);

  if (fromState === "file" || toState === "file") {
    throw new Error(options.conflict);
  }

  if (fromState === "missing") {
    return;
  }

  if (toState !== "missing") {
    throw new Error(options.conflict);
  }

  await mkdir(dirname(options.to), { recursive: true });
  await rename(options.from, options.to);
}

async function removeDirectoryIfEmpty(path: string, conflict: string): Promise<void> {
  const state = await directoryState(path);

  if (state === "missing") {
    return;
  }

  const entries = await readdir(path);
  if (entries.length > 0) {
    throw new Error(conflict);
  }

  await rmdir(path);
}

async function ensureDirectory(path: string): Promise<void> {
  const state = await directoryState(path);

  if (state === "file") {
    throw new Error(`Cannot create directory ${path}: a file already exists at that path.`);
  }

  await mkdir(path, { recursive: true });
}

async function directoryState(path: string): Promise<"directory" | "file" | "missing"> {
  try {
    const stats = await stat(path);
    return stats.isDirectory() ? "directory" : "file";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "missing";
    }

    throw error;
  }
}
