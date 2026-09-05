/**
 * Server runtime boot e2e — issue #96 §1
 *
 * Exercises the full `startServerRuntime()` path against a real SQLite database
 * and a temp workspace/data dir, with only the OpenCode orchestrator stubbed so
 * no `opencode serve` child process is spawned. This proves that a cold boot:
 *
 *   - runs workspace + DB migrations and boot reconcilers,
 *   - wires every service onto the RuntimeContext,
 *   - syncs cc-managed MCP specialist workspaces (writeOpenCodeWorkspace),
 *   - starts the task scheduler, and
 *   - listens for HTTP connections.
 *
 * It also covers the drain path (shutdownRuntime stops everything and closes the
 * DB) and the listen-failure recovery path (an occupied port triggers a drain
 * and rethrows), plus the double-signal force-exit handler.
 */

import { createServer as createNetServer } from "node:net";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installSignalHandlers,
  startServerRuntime,
  type StartedServerRuntime,
} from "../../src/lib/start-server-runtime";
import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { writeSpecialistFile } from "../../src/services/specialist-file";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A no-op orchestrator so boot never spawns a real `opencode serve` process. */
function createFakeOrchestrator(overrides?: Partial<OpenCodeOrchestrator>): OpenCodeOrchestrator {
  const status = {
    state: "healthy" as const,
    healthy: true,
    url: "http://127.0.0.1:4100",
    workspaceDir: "/tmp/ws",
    restartCount: 0,
    maxRestarts: 3,
  };

  return {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    restart: vi.fn(() => Promise.resolve()),
    refreshHealth: vi.fn(() => Promise.resolve(true)),
    getStatus: vi.fn(() => status),
    ...overrides,
  };
}

async function bootTestRuntime(cwd: string, port = 0): Promise<StartedServerRuntime> {
  return startServerRuntime({
    cwd,
    env: { NODE_ENV: "test", CC_LOG_LEVEL: "silent" },
    overrides: { host: "127.0.0.1", port },
    installSignalHandlers: false,
    createOrchestrator: () => createFakeOrchestrator(),
  });
}

function listeningPort(runtime: StartedServerRuntime): number {
  const address = runtime.server.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected a listening TCP address");
  }
  return address.port;
}

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cc-boot-"));
  tempDirs.push(dir);
  return dir;
}

/**
 * Seeds a specialist.json into the workspace before boot so the specialist
 * reconciler imports it and syncCcManagedMcpSpecialistWorkspaces exercises its
 * write path (not just the empty-loop fast exit).
 */
async function seedSpecialist(cwd: string, slug = "boot-specialist"): Promise<void> {
  const config = loadRuntimeConfig({ cwd, env: { NODE_ENV: "test" } });
  await writeSpecialistFile(config, slug, "active", {
    id: `spec_${slug}`,
    name: "Boot Specialist",
    role: "verify boot",
    instructions: "Confirm the runtime boots.",
    defaultModel: "openai/gpt-4.1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    capabilities: {
      builtInSkills: [],
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    },
  });
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

describe("startServerRuntime boot", () => {
  it("boots the full runtime: migrations, services, workspace sync, listening server", async () => {
    const cwd = await makeTempDir();
    await seedSpecialist(cwd);
    const runtime = await bootTestRuntime(cwd);

    try {
      // Every service is wired onto the RuntimeContext.
      expect(runtime.database).toBeDefined();
      expect(runtime.orchestrator).toBeDefined();
      expect(runtime.opencodeService).toBeDefined();
      expect(runtime.taskService).toBeDefined();
      expect(runtime.conversationService).toBeDefined();
      expect(runtime.taskExecutionService).toBeDefined();
      expect(runtime.taskSchedulerService).toBeDefined();
      expect(runtime.systemVersionService).toBeDefined();
      expect(runtime.sessionArchiveService).toBeDefined();
      expect(runtime.activityService).toBeDefined();
      expect(runtime.shutdownRuntime).toBeInstanceOf(Function);

      // DB migrations ran — the agents table exists and reconcilers seeded it.
      const agents = await runtime.database.db.query.agents.findMany();
      expect(agents.length).toBeGreaterThan(0);

      // Boot reconcilers imported workspace files: each seeded specialist has a
      // synced opencode.jsonc written by syncCcManagedMcpSpecialistWorkspaces.
      const workspaceConfig = JSON.parse(
        await readFile(
          join(runtime.config.paths.workspaceDir, "specialists", agents[0]!.slug, "opencode.jsonc"),
          "utf8",
        ),
      ) as Record<string, unknown>;
      expect(workspaceConfig).toHaveProperty("permission");

      // Task scheduler is ticking.
      expect(runtime.scheduler.getStatus().state).toBe("running");

      // Server is listening and answers the health endpoint.
      const response = await fetch(`http://127.0.0.1:${listeningPort(runtime)}/api/health`);
      expect(response.status).toBe(200);
      const health = (await response.json()) as { status: string; scheduler: { state: string } };
      expect(health.status).toBe("ok");
      expect(health.scheduler.state).toBe("running");
    } finally {
      await runtime.shutdownRuntime?.();
    }
  });

  it("shutdownRuntime drains: server stops accepting connections and the DB is closed", async () => {
    const cwd = await makeTempDir();
    const runtime = await bootTestRuntime(cwd);
    const port = listeningPort(runtime);

    await runtime.shutdownRuntime?.();

    // Server no longer listens.
    await expect(fetch(`http://127.0.0.1:${port}/api/health`)).rejects.toThrow();

    // Database is closed — further queries reject.
    await expect(runtime.database.db.query.agents.findMany()).rejects.toThrow();

    // Orchestrator was stopped as part of the drain.
    expect(runtime.orchestrator.stop).toHaveBeenCalled();

    // A second drain is a no-op (idempotent).
    await expect(runtime.shutdownRuntime?.()).resolves.toBeUndefined();
  });

  it("drains and rethrows when the server cannot listen (port already in use)", async () => {
    const cwd = await makeTempDir();

    // Occupy a port so startServerRuntime's server.listen() fails.
    const blocker = createNetServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const address = blocker.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a listening TCP address for the blocker");
    }
    const occupiedPort = address.port;

    try {
      await expect(bootTestRuntime(cwd, occupiedPort)).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});

// ---------------------------------------------------------------------------
// OpenCode state dir (CC_OPENCODE_STATE_DIR)
// ---------------------------------------------------------------------------

describe("startServerRuntime opencode state dir", () => {
  it("injects state-dir XDG overrides into the opencode child env and creates the roots", async () => {
    const cwd = await makeTempDir();
    const stateDir = join(cwd, ".cc", "opencode");
    let capturedResolveEnv: (() => Promise<NodeJS.ProcessEnv>) | undefined;

    const runtime = await startServerRuntime({
      cwd,
      env: {
        NODE_ENV: "test",
        CC_LOG_LEVEL: "silent",
        CC_OPENCODE_STATE_DIR: stateDir,
        // An ambient XDG value the state dir must win over.
        XDG_DATA_HOME: "/home/node/.local/share",
      },
      overrides: { host: "127.0.0.1", port: 0 },
      installSignalHandlers: false,
      createOrchestrator: (options) => {
        capturedResolveEnv = options.resolveEnv;
        return createFakeOrchestrator();
      },
    });

    try {
      expect(capturedResolveEnv).toBeInstanceOf(Function);
      const childEnv = await capturedResolveEnv!();

      expect(childEnv["XDG_DATA_HOME"]).toBe(join(stateDir, "data"));
      expect(childEnv["XDG_CONFIG_HOME"]).toBe(join(stateDir, "config"));
      expect(childEnv["XDG_CACHE_HOME"]).toBe(join(stateDir, "cache"));
      expect(childEnv["XDG_STATE_HOME"]).toBe(join(stateDir, "state"));

      for (const sub of ["data", "config", "cache", "state"]) {
        await expect(stat(join(stateDir, sub))).resolves.toBeDefined();
      }
    } finally {
      await runtime.shutdownRuntime?.();
    }
  });

  it("leaves the opencode child env untouched when CC_OPENCODE_STATE_DIR is unset", async () => {
    const cwd = await makeTempDir();
    let capturedResolveEnv: (() => Promise<NodeJS.ProcessEnv>) | undefined;

    const runtime = await startServerRuntime({
      cwd,
      env: {
        NODE_ENV: "test",
        CC_LOG_LEVEL: "silent",
        NPM_CONFIG_CACHE: "/home/node/.npm",
      },
      overrides: { host: "127.0.0.1", port: 0 },
      installSignalHandlers: false,
      createOrchestrator: (options) => {
        capturedResolveEnv = options.resolveEnv;
        return createFakeOrchestrator();
      },
    });

    try {
      const childEnv = await capturedResolveEnv!();
      // No override injected: the child env carries no XDG_* keys beyond the base
      // env (options.env here, which sets none).
      expect(childEnv["XDG_DATA_HOME"]).toBeUndefined();
      expect(childEnv["XDG_STATE_HOME"]).toBeUndefined();
      expect(childEnv["NPM_CONFIG_CACHE"]).toBe("/home/node/.npm");
    } finally {
      await runtime.shutdownRuntime?.();
    }
  });
});

describe("startServerRuntime npm cache", () => {
  it("injects the configured npm cache over an ambient value", async () => {
    const cwd = await makeTempDir();
    const cacheDir = join(cwd, ".cc", "npm-cache");
    let capturedResolveEnv: (() => Promise<NodeJS.ProcessEnv>) | undefined;

    const runtime = await startServerRuntime({
      cwd,
      env: {
        NODE_ENV: "test",
        CC_LOG_LEVEL: "silent",
        CC_NPM_CACHE_DIR: cacheDir,
        NPM_CONFIG_CACHE: "/home/node/.npm",
      },
      overrides: { host: "127.0.0.1", port: 0 },
      installSignalHandlers: false,
      createOrchestrator: (options) => {
        capturedResolveEnv = options.resolveEnv;
        return createFakeOrchestrator();
      },
    });

    try {
      const childEnv = await capturedResolveEnv!();
      expect(childEnv["NPM_CONFIG_CACHE"]).toBe(cacheDir);
    } finally {
      await runtime.shutdownRuntime?.();
    }
  });

  it("creates the configured npm cache directory", async () => {
    const cwd = await makeTempDir();
    const cacheDir = join(cwd, ".cc", "nested", "npm-cache");

    const runtime = await startServerRuntime({
      cwd,
      env: {
        NODE_ENV: "test",
        CC_LOG_LEVEL: "silent",
        CC_NPM_CACHE_DIR: cacheDir,
      },
      overrides: { host: "127.0.0.1", port: 0 },
      installSignalHandlers: false,
      createOrchestrator: () => createFakeOrchestrator(),
    });

    try {
      await expect(stat(cacheDir)).resolves.toBeDefined();
    } finally {
      await runtime.shutdownRuntime?.();
    }
  });
});

// ---------------------------------------------------------------------------
// Signal handlers
// ---------------------------------------------------------------------------

describe("installSignalHandlers", () => {
  it("drains on the first signal and force-exits on a second", async () => {
    const savedSigint = process.listeners("SIGINT");
    const savedSigterm = process.listeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
    let resolveDrain: (() => void) | undefined;
    const drain = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDrain = resolve;
        }),
    );

    try {
      installSignalHandlers(drain as never, logger as never);

      // First signal starts draining.
      process.emit("SIGINT");
      expect(drain).toHaveBeenCalledWith("SIGINT");
      expect(exitSpy).not.toHaveBeenCalled();

      // Second (different) signal while draining forces an exit.
      process.emit("SIGTERM");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ signal: "SIGTERM" }),
        "received additional shutdown signal; forcing exit",
      );
      expect(exitSpy).toHaveBeenCalled();

      resolveDrain?.();
      await Promise.resolve();
    } finally {
      exitSpy.mockRestore();
      process.removeAllListeners("SIGINT");
      process.removeAllListeners("SIGTERM");
      for (const listener of savedSigint) {
        process.on("SIGINT", listener as never);
      }
      for (const listener of savedSigterm) {
        process.on("SIGTERM", listener as never);
      }
    }
  });
});
