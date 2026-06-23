import { mkdir, readdir, rmdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

function systemPromptsDir(workspaceDir: string): string {
  return resolve(workspaceDir, "configuration", "system-prompts");
}

export const createSystemPromptsDirectoryMigration = {
  id: "0004-create-system-prompts-directory",
  description: "Create the configuration/system-prompts directory for saved system prompt bodies.",
  async up({ config }) {
    // Only ensure the save location exists. Default bodies are NOT seeded as
    // files — they stay code-owned so improvements reach users, and "reset to
    // default" is a simple file delete. Idempotent.
    await mkdir(systemPromptsDir(config.paths.workspaceDir), { recursive: true });
  },
  async down({ config }) {
    const directory = systemPromptsDir(config.paths.workspaceDir);

    const entries = await listDir(directory);
    if (entries === null) {
      return; // Directory does not exist; nothing to roll back.
    }
    if (entries.length > 0) {
      throw new Error(
        `Cannot remove ${directory}: directory contains user-saved system prompts (${entries.join(", ")}). Remove them manually before rolling back.`,
      );
    }

    await rmdir(directory);
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
