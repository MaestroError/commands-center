import type { WorkspaceMigration } from "../types.js";

import { createMigrationSmokeTestDirectoryMigration } from "./0001-create-migration-smoke-test-directory.js";
import { renameAgentsToSpecialistsMigration } from "./0002-rename-agents-to-specialists.js";
import { sessionArchiveLayoutMigration } from "./0003-session-archive-layout.js";
import { createSystemPromptsDirectoryMigration } from "./0004-create-system-prompts-directory.js";

export const workspaceMigrations = [
  createMigrationSmokeTestDirectoryMigration,
  renameAgentsToSpecialistsMigration,
  sessionArchiveLayoutMigration,
  createSystemPromptsDirectoryMigration,
] satisfies WorkspaceMigration[];
