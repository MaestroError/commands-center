import os from "node:os";

import { describe, expect, it, vi } from "vitest";

import { getStartupLogContext, loadRuntimeConfig } from "../../src/lib/runtime-config";

describe("loadRuntimeConfig", () => {
  it("uses portable workspace and disposable data defaults under the app directory", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
      },
    });

    expect(config.server.port).toBe(3000);
    expect(config.server.host).toBe("0.0.0.0");
    expect(config.paths.dataDir).toBe("/tmp/project/.cc/data");
    expect(config.paths.workspaceDir).toBe("/tmp/project/.cc/workspace");
    expect(config.database.sqlitePath).toBe("/tmp/project/.cc/data/cc.db");
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

  it("defaults the stdio MCP timeout to 120 seconds", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test" },
    });

    expect(config.timeouts.mcpStdioMs).toBe(120_000);
  });

  it("accepts a positive stdio MCP timeout override", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_MCP_STDIO_TIMEOUT_MS: "45000" },
    });

    expect(config.timeouts.mcpStdioMs).toBe(45_000);
  });

  it("rejects an invalid stdio MCP timeout override", () => {
    expect(() =>
      loadRuntimeConfig({
        cwd: "/tmp/project",
        env: { NODE_ENV: "test", CC_MCP_STDIO_TIMEOUT_MS: "0" },
      }),
    ).toThrow("CC_MCP_STDIO_TIMEOUT_MS must be a positive integer");
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
        dataDir: "/tmp/project/.cc/data",
        workspaceDir: "/tmp/project/.cc/workspace",
      },
      database: {
        sqlitePath: "/tmp/project/.cc/data/cc.db",
      },
      timeouts: {
        opencodeRequestMs: 30000,
        opencodeStartupMs: 30000,
        opencodeShutdownMs: 15000,
        opencodeHealthPollMs: 2000,
        opencodeRestartWindowMs: 60000,
        mcpAuthMs: 90000,
        mcpStdioMs: 120000,
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

  it("resolves configuration subdirectory inside the workspace", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test" },
    });

    expect(config.paths.subdirectories.configuration).toBe(
      "/tmp/project/.cc/workspace/configuration",
    );
    expect(config.paths.subdirectories.preferences).toBe(
      "/tmp/project/.cc/workspace/configuration/preferences",
    );
  });

  it("resolves Documents subdirectory inside the workspace", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test" },
    });

    expect(config.paths.subdirectories.documents).toBe("/tmp/project/.cc/workspace/Documents");
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
    expect(config.paths.dataDir).toBe("/tmp/workspace-root/.cc/data");
    expect(config.paths.subdirectories.specialists).toBe(
      "/srv/commandscenter-workspace/specialists",
    );
    expect(config.paths.subdirectories.configuration).toBe(
      "/srv/commandscenter-workspace/configuration",
    );
    expect(config.paths.subdirectories.preferences).toBe(
      "/srv/commandscenter-workspace/configuration/preferences",
    );
    expect(config.database.sqlitePath).toBe("/tmp/workspace-root/.cc/data/cc.db");
  });

  it("allows overriding the data root with an absolute CC_DATA_DIR path", () => {
    const config = loadRuntimeConfig({
      env: {
        NODE_ENV: "test",
        INIT_CWD: "/tmp/workspace-root",
        CC_DATA_DIR: "/srv/commandscenter-data",
      },
    });

    expect(config.paths.dataDir).toBe("/srv/commandscenter-data");
    expect(config.database.sqlitePath).toBe("/srv/commandscenter-data/cc.db");
  });

  it("resolves relative CC_DATA_DIR paths against cwd", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_DATA_DIR: "runtime-data",
      },
    });

    expect(config.paths.dataDir).toBe("/tmp/project/runtime-data");
    expect(config.database.sqlitePath).toBe("/tmp/project/runtime-data/cc.db");
  });

  it("treats an empty CC_PUBLIC_ORIGIN as unset and falls back to the derived local origin", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_PUBLIC_ORIGIN: "" },
    });

    expect(config.security.publicOrigin).toBe(`http://localhost:${config.server.port}`);
  });

  it("accepts a valid URL for CC_PUBLIC_ORIGIN", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_PUBLIC_ORIGIN: "https://commands.example.com" },
    });

    expect(config.security.publicOrigin).toBe("https://commands.example.com");
  });

  it("normalizes a trailing slash from CC_PUBLIC_ORIGIN", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_PUBLIC_ORIGIN: "https://commands.example.com/" },
    });

    expect(config.security.publicOrigin).toBe("https://commands.example.com");
  });

  it("allows HTTP for a loopback CC_PUBLIC_ORIGIN", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_PUBLIC_ORIGIN: "http://127.0.0.1:4000" },
    });

    expect(config.security.publicOrigin).toBe("http://127.0.0.1:4000");
  });

  it("allows HTTP for an IPv6 loopback CC_PUBLIC_ORIGIN", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_PUBLIC_ORIGIN: "http://[::1]:4000" },
    });

    expect(config.security.publicOrigin).toBe("http://[::1]:4000");
  });

  it("rejects HTTP for an externally addressed CC_PUBLIC_ORIGIN", () => {
    expect(() =>
      loadRuntimeConfig({
        cwd: "/tmp/project",
        env: { NODE_ENV: "test", CC_PUBLIC_ORIGIN: "http://commands.example.com" },
      }),
    ).toThrow("CC_PUBLIC_ORIGIN must use HTTPS unless it points to a loopback host");
  });

  it("rejects paths in CC_PUBLIC_ORIGIN", () => {
    expect(() =>
      loadRuntimeConfig({
        cwd: "/tmp/project",
        env: { NODE_ENV: "test", CC_PUBLIC_ORIGIN: "https://commands.example.com/cc" },
      }),
    ).toThrow("CC_PUBLIC_ORIGIN must contain only a scheme, host, and optional port");
  });

  it("does not trust proxy headers by default", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test" },
    });

    expect(config.security.trustProxy).toBe(false);
  });

  it("enables trusted proxy handling explicitly", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_TRUST_PROXY: "true" },
    });

    expect(config.security.trustProxy).toBe(true);
  });

  it("leaves opencode.stateDir undefined when CC_OPENCODE_STATE_DIR is unset", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test" },
    });

    expect(config.opencode.stateDir).toBeUndefined();
  });

  it("keeps an absolute CC_OPENCODE_STATE_DIR as-is", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_OPENCODE_STATE_DIR: "/workspace/.cc/opencode" },
    });

    expect(config.opencode.stateDir).toBe("/workspace/.cc/opencode");
  });

  it("resolves a relative CC_OPENCODE_STATE_DIR against cwd", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_OPENCODE_STATE_DIR: ".cc/opencode" },
    });

    expect(config.opencode.stateDir).toBe("/tmp/project/.cc/opencode");
  });

  it("uses a persistent workspace npm cache in Docker", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_DOCKER: "true" },
    });

    expect(config.opencode.npmCacheDir).toBe("/workspace/.cc/npm-cache");
  });

  it("prefers an explicit npm cache path over the Docker default", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_DOCKER: "true",
        CC_NPM_CACHE_DIR: "/var/cache/commandscenter/npm",
      },
    });

    expect(config.opencode.npmCacheDir).toBe("/var/cache/commandscenter/npm");
  });

  it("resolves a relative npm cache path against cwd", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test", CC_NPM_CACHE_DIR: ".cc/npm-cache" },
    });

    expect(config.opencode.npmCacheDir).toBe("/tmp/project/.cc/npm-cache");
  });

  it("preserves npm native cache behavior outside Docker", () => {
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: { NODE_ENV: "test" },
    });

    expect(config.opencode.npmCacheDir).toBeUndefined();
  });
});
