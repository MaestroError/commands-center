import type { WorkspaceMigration } from "../types.js";

import { createMigrationSmokeTestDirectoryMigration } from "./0001-create-migration-smoke-test-directory.js";
import { renameAgentsToSpecialistsMigration } from "./0002-rename-agents-to-specialists.js";
import { sessionArchiveLayoutMigration } from "./0003-session-archive-layout.js";
import { createSystemPromptsDirectoryMigration } from "./0004-create-system-prompts-directory.js";
import { createDocumentsAgentsGuideMigration } from "./0005-create-documents-agents-guide.js";
import { createDocumentsExamplesGuideMigration } from "./0006-create-documents-examples-guide.js";
import { updateDocumentsAgentsGuideRootRuleMigration } from "./0007-update-documents-agents-guide-root-rule.js";
import { movePreferencesUnderConfigurationMigration } from "./0008-move-preferences-under-configuration.js";
import { updateDocumentsAgentsGuideGlobalToolNamesMigration } from "./0009-update-documents-agents-guide-global-tool-names.js";

export const workspaceMigrations = [
  createMigrationSmokeTestDirectoryMigration,
  renameAgentsToSpecialistsMigration,
  sessionArchiveLayoutMigration,
  createSystemPromptsDirectoryMigration,
  createDocumentsAgentsGuideMigration,
  createDocumentsExamplesGuideMigration,
  updateDocumentsAgentsGuideRootRuleMigration,
  movePreferencesUnderConfigurationMigration,
  updateDocumentsAgentsGuideGlobalToolNamesMigration,
] satisfies WorkspaceMigration[];
