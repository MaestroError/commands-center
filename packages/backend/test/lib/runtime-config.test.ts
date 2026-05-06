import os from "node:os";

import { describe, expect, it, vi } from "vitest";

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
        mcpAuthMs: 90000,
        drainMs: 15000,
      },
      updates: {
        enabled: true,
        intervalMs: 21600000,
        autoUpdate: false,
        registryUrl: "https://registry.npmjs.org/commandscenter/latest",
        docker: false,
      },
      logLevel: "info",
      opencodePathConfigured: true,
      secretKeyConfigured: true,
      tasks: {
        maxTasks: undefined,
      },
      firstRun: {
        envFileCreated: false,
        envFilePath: undefined,
      },
    });
  });

  it("records first-run env file creation metadata", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_FIRST_RUN_ENV_FILE_CREATED: "true",
        CC_FIRST_RUN_ENV_FILE_PATH: "/tmp/user/.cc/.env",
      },
    });

    expect(config.firstRun).toEqual({
      envFileCreated: true,
      envFilePath: "/tmp/user/.cc/.env",
    });
  });

  it("parses optional task limits", () => {
    const unlimited = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_MAX_TASKS: "0",
      },
    });
    const limited = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_MAX_TASKS: "3",
      },
    });

    expect(unlimited.tasks.maxTasks).toBeUndefined();
    expect(limited.tasks.maxTasks).toBe(3);
  });

  it("parses update environment configuration", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_UPDATE_CHECK: "false",
        CC_UPDATE_INTERVAL_MS: "60000",
        CC_AUTO_UPDATE: "true",
        CC_DOCKER: "true",
        CC_UPDATE_REGISTRY_URL: "https://registry.example.test/commandscenter/latest",
      },
    });

    expect(config.updates).toEqual({
      enabled: false,
      intervalMs: 60000,
      autoUpdate: true,
      registryUrl: "https://registry.example.test/commandscenter/latest",
      docker: true,
      historyFile: "/tmp/project/.cc/workspace/update-history.json",
    });
  });

  it("prefers INIT_CWD when runtime starts through workspace package scripts", () => {
    const config = loadRuntimeConfig({
      env: {
        NODE_ENV: "test",
        INIT_CWD: "/tmp/workspace-root",
      },
    });

    expect(config.paths.workspaceDir).toBe("/tmp/workspace-root/.cc/workspace");
  });

  it("defaults to a user-level CC home when no cwd or INIT_CWD is provided", () => {
    const home = vi.spyOn(os, "homedir").mockReturnValue("/tmp/user-home");

    try {
      const config = loadRuntimeConfig({
        env: {
          NODE_ENV: "test",
        },
      });

      expect(config.paths.workspaceDir).toBe("/tmp/user-home/.cc/workspace");
    } finally {
      home.mockRestore();
    }
  });

  it("allows overriding the workspace root with an absolute CC_WORKSPACE_DIR path", () => {
    const config = loadRuntimeConfig({
      env: {
        NODE_ENV: "test",
        INIT_CWD: "/tmp/workspace-root",
        CC_WORKSPACE_DIR: "/srv/commandscenter-workspace",
      },
    });

    expect(config.paths.workspaceDir).toBe("/srv/commandscenter-workspace");
    expect(config.paths.subdirectories.agents).toBe("/srv/commandscenter-workspace/agents");
    expect(config.database.sqlitePath).toBe("/srv/commandscenter-workspace/database/local.db");
  });
});
