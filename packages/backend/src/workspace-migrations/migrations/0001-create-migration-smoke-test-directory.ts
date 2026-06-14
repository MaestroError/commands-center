import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import type { WorkspaceMigration } from "../types.js";

export const createMigrationSmokeTestDirectoryMigration = {
  id: "0001-create-migration-smoke-test-directory",
  description: "Create a harmless workspace migration smoke-test directory.",
  async up({ config }) {
    await mkdir(resolve(config.paths.workspaceDir, ".cc", "migration-smoke-test"), {
      recursive: true,
    });
  },
  async down({ config }) {
    const directory = resolve(config.paths.workspaceDir, ".cc");

    await rm(resolve(directory, "migration-smoke-test"), {
      recursive: true,
      force: true,
    });
    await rm(directory).catch((error: unknown) => {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === "ENOENT" || code === "ENOTEMPTY") {
        return;
      }

      throw error;
    });
  },
} satisfies WorkspaceMigration;
