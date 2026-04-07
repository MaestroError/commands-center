import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { DatabaseClient } from "../../src/db/client.js";
import { createDatabaseClient } from "../../src/db/client.js";
import { migrateDatabase } from "../../src/db/migrate.js";
import { loadRuntimeConfig } from "../../src/lib/runtime-config.js";

export async function createTestDatabase(): Promise<{
  client: DatabaseClient;
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

  await mkdir(config.paths.subdirectories.database, { recursive: true });

  const client = createDatabaseClient(config);
  migrateDatabase(client.db);

  return {
    client,
    cwd,
    async cleanup() {
      client.close();
      await rm(cwd, { recursive: true, force: true });
    },
  };
}
