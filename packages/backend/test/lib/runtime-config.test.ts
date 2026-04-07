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
    expect(config.paths.subdirectories.db).toBe("/tmp/project/.cc/workspace/db");
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
      engine: {
        host: "127.0.0.1",
        port: 4096,
        maxRestarts: 3,
        baseUrl: "http://127.0.0.1:4096",
      },
      paths: {
        dataDir: "/tmp/project/.cc",
        workspaceDir: "/tmp/project/.cc/workspace",
      },
      timeouts: {
        engineRequestMs: 30000,
        engineStartupMs: 30000,
        engineShutdownMs: 15000,
        engineHealthPollMs: 2000,
        engineRestartWindowMs: 60000,
        providerAuthMs: 300000,
        mcpAuthMs: 90000,
        drainMs: 15000,
      },
      logLevel: "info",
      opencodePathConfigured: true,
    });
  });
});
