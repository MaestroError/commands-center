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

    await removeEmptyDirectory(specialistsRoot);
    await removeEmptyDirectory(sessionsRoot);
  },
} satisfies WorkspaceMigration;

async function removeEmptyDirectory(path: string): Promise<void> {
  let entries: string[];

  try {
    entries = await readdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  if (entries.length > 0) {
    throw new Error(
      `Cannot remove ${path}: directory is not empty. Session archive data created after the migration must be removed manually.`,
    );
  }

  await rmdir(path);
}
