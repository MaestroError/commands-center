import type { WorkspaceMigration } from "../types.js";

import { createMigrationSmokeTestDirectoryMigration } from "./0001-create-migration-smoke-test-directory.js";

export const workspaceMigrations = [
  createMigrationSmokeTestDirectoryMigration,
] satisfies WorkspaceMigration[];
