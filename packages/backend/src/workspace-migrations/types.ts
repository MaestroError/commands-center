import type { Logger } from "pino";

import type { RuntimeConfig } from "../lib/runtime-config.js";

export type WorkspaceMigrationContext = {
  config: RuntimeConfig;
  logger: Logger;
};

export type WorkspaceMigration = {
  id: string;
  description: string;
  up: (context: WorkspaceMigrationContext) => Promise<void>;
  down: (context: WorkspaceMigrationContext) => Promise<void>;
};

export type AppliedWorkspaceMigration = {
  id: string;
  description: string;
  appliedAt: string;
};

export type WorkspaceMigrationState = {
  version: 1;
  applied: AppliedWorkspaceMigration[];
};
