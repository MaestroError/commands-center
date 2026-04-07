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

  it("rejects postgres primary mode until dual-write is implemented", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        DATABASE_URL: "postgres://user:pass@localhost:5432/cc",
      },
    });

    expect(() => createDatabaseClient(config)).toThrow(
      "PostgreSQL primary mode is not implemented yet. Remove DATABASE_URL to use the portable SQLite database.",
    );
  });
});
