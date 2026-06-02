import { describe, expect, it } from "vitest";

import { createDatabaseClient } from "../../src/db/client";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";

describe("createDatabaseClient", () => {
  it("creates a portable SQLite client rooted in the workspace database directory", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });

    const client = createDatabaseClient(config);

    try {
      expect(client.dialect).toBe("sqlite");
      expect(client.sqlitePath).toBe("/tmp/project/.cc/workspace/database/local.db");
    } finally {
      client.close();
    }
  });
});
