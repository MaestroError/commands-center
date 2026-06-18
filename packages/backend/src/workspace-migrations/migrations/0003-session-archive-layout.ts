import { mkdir, readdir, rm, rmdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

const OLD_RUNTIME_DIRECTORIES = ["task-context-attachments", "task-artifacts"] as const;

export const sessionArchiveLayoutMigration = {
  id: "0003-session-archive-layout",
  description:
    "Create the session archive workspace layout and delete legacy task attachment and artifact directories.",
  async up({ config }) {
    const sessionsRoot = resolve(config.paths.workspaceDir, "sessions");
    const specialistsRoot = resolve(sessionsRoot, "specialists");

    await mkdir(specialistsRoot, { recursive: true });

    for (const directory of OLD_RUNTIME_DIRECTORIES) {
      await rm(resolve(config.paths.workspaceDir, directory), {
        recursive: true,
        force: true,
      });
    }
  },
  async down({ config }) {
    const sessionsRoot = resolve(config.paths.workspaceDir, "sessions");
    const specialistsRoot = resolve(sessionsRoot, "specialists");

    // Read state upfront so rollback is all-or-nothing — no partial deletions on failure.
    const sessionsEntries = await listDir(sessionsRoot);

    if (sessionsEntries === null) {
      return; // sessions/ does not exist; nothing to roll back.
    }

    const specialistsEntries = await listDir(specialistsRoot);

    if (specialistsEntries !== null && specialistsEntries.length > 0) {
      throw new Error(
        `Cannot remove ${specialistsRoot}: directory is not empty. Session archive data created after the migration must be removed manually.`,
      );
    }

    const otherEntries = sessionsEntries.filter((entry) => entry !== "specialists");
    if (otherEntries.length > 0) {
      throw new Error(
        `Cannot remove ${sessionsRoot}: directory contains entries not created by this migration (${otherEntries.join(", ")}). These must be removed manually before rolling back.`,
      );
    }

    // Both are safe to remove — no partial state possible from this point.
    if (specialistsEntries !== null) {
      await rmdir(specialistsRoot);
    }
    await rmdir(sessionsRoot);
  },
} satisfies WorkspaceMigration;

async function listDir(path: string): Promise<string[] | null> {
  try {
    return await readdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
