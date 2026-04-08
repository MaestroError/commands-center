import { describe, expect, it } from "vitest";

import { getStartupLogContext, loadRuntimeConfig } from "../../src/lib/runtime-config";

describe("loadRuntimeConfig", () => {
  it("uses portable workspace defaults under the app data directory", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });

    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe("0.0.0.0");
    expect(config.paths.dataDir).toBe("/tmp/project/.cc");
    expect(config.paths.workspaceDir).toBe("/tmp/project/.cc/workspace");
    expect(config.paths.subdirectories.database).toBe("/tmp/project/.cc/workspace/database");
    expect(config.paths.databaseFile).toBe("/tmp/project/.cc/workspace/database/local.db");
  });

  it("fails fast with actionable validation errors", () => {
    expect(() =>
      loadRuntimeConfig({
        cwd: "/tmp/project",
        env: {
          NODE_ENV: "test",
          CC_PORT: "nope",
          CC_MCP_AUTH_TIMEOUT_MS: "0",
        },
      }),
    ).toThrow(
      "Invalid runtime configuration: CC_PORT: CC_PORT must be a positive integer; CC_MCP_AUTH_TIMEOUT_MS: CC_MCP_AUTH_TIMEOUT_MS must be a positive integer",
    );
  });

  it("redacts sensitive startup details from the logged configuration", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_OPENCODE_PATH: "/custom/opencode",
      },
    });

    expect(getStartupLogContext(config)).toEqual({
      nodeEnv: "test",
      server: {
        host: "0.0.0.0",
        port: 3000,
      },
      opencode: {
        host: "127.0.0.1",
        port: 4100,
        maxRestarts: 3,
        baseUrl: "http://127.0.0.1:4100",
      },
      paths: {
        dataDir: "/tmp/project/.cc",
        workspaceDir: "/tmp/project/.cc/workspace",
        databaseFile: "/tmp/project/.cc/workspace/database/local.db",
      },
      database: {
        hasDatabaseUrl: false,
        sqlitePath: "/tmp/project/.cc/workspace/database/local.db",
      },
      timeouts: {
        opencodeRequestMs: 30000,
        opencodeStartupMs: 30000,
        opencodeShutdownMs: 15000,
        opencodeHealthPollMs: 2000,
        opencodeRestartWindowMs: 60000,
        providerAuthMs: 300000,
        mcpAuthMs: 90000,
        drainMs: 15000,
      },
      logLevel: "info",
      opencodePathConfigured: true,
    });
  });
});
