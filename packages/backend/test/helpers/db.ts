import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { DatabaseClient } from "../../src/db/client.js";
import { createDatabaseClient } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../../src/lib/runtime-config.js";

export async function createTestDatabase(): Promise<{
  client: DatabaseClient;
  config: RuntimeConfig;
  cwd: string;
  cleanup(): Promise<void>;
}> {
  const cwd = await mkdtemp(join(tmpdir(), "cc-db-"));
  const config = loadRuntimeConfig({
    cwd,
    env: {
      NODE_ENV: "test",
    },
  });

  const client = createDatabaseClient(config);
  migrateDatabase(client.db);
  await mkdir(config.paths.workspaceDir, { recursive: true });

  return {
    client,
    config,
    cwd,
    async cleanup() {
      client.close();
      await rm(cwd, { recursive: true, force: true });
    },
  };
}
