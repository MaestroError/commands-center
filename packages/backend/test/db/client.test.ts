import { describe, expect, it } from "vitest";

import { createDatabaseClient } from "../../src/db/client";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";

describe("createDatabaseClient", () => {
  it("creates a local SQLite client rooted in the app data directory", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });

    const client = createDatabaseClient(config);

    try {
      expect(client.dialect).toBe("sqlite");
      expect(client.sqlitePath).toBe("/tmp/project/.cc/data/cc.db");
    } finally {
      client.close();
    }
  });
});
