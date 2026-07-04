import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { createOpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";

type FakeChild = EventEmitter & {
  pid: number;
  exitCode: number | null;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createOpenCodeOrchestrator", () => {
  it("starts the engine, polls health, and reports status", async () => {
    const child = createChild(321);
    const spawnProcess = vi.fn(() => child as never);
    const fetch = vi.fn((input: URL | string) => {
      const url = new URL(input.toString());

      if (url.pathname === "/global/health") {
        return Promise.resolve(jsonResponse({ healthy: true, version: "1.0.0" }));
      }

      return Promise.reject(new Error(`Unexpected request: ${url.toString()}`));
    });
    const processKill = vi.spyOn(process, "kill").mockImplementation((pid) => {
      expect(pid).toBe(-321);
      child.exitCode = 0;
      queueMicrotask(() => {
        child.emit("exit", 0, "SIGTERM");
      });
      return true;
    });
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_OPENCODE_HEALTH_POLL_MS: "10000",
        CC_OPENCODE_STARTUP_TIMEOUT_MS: "500",
      },
    });
    const orchestrator = createOpenCodeOrchestrator({
      config,
      logger: pino({ enabled: false }),
      spawnProcess,
      fetch: fetch as typeof globalThis.fetch,
      resolveBinary: () =>
        Promise.resolve({
          path: "/tmp/project/node_modules/opencode/bin/opencode.js",
          source: "dependency",
        }),
    });

    await orchestrator.start();

    expect(spawnProcess).toHaveBeenCalledWith(
      "/tmp/project/node_modules/opencode/bin/opencode.js",
      ["serve", "--hostname=127.0.0.1", "--port=4100"],
      expect.objectContaining({
        cwd: "/tmp/project",
        detached: true,
      }),
    );
    expect(orchestrator.getStatus()).toEqual(
      expect.objectContaining({
        state: "healthy",
        healthy: true,
        version: "1.0.0",
        pid: 321,
        binarySource: "dependency",
      }),
    );

    await orchestrator.stop();

    expect(processKill).toHaveBeenCalledWith(-321, "SIGTERM");
  });

  it("keeps the opencode child attached in development", async () => {
    const child = createChild(777);
    const spawnProcess = vi.fn(() => child as never);
    let healthChecks = 0;
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "development",
        CC_OPENCODE_HEALTH_POLL_MS: "10000",
      },
    });
    const orchestrator = createOpenCodeOrchestrator({
      config,
      logger: pino({ enabled: false }),
      spawnProcess,
      fetch: vi.fn(() => {
        healthChecks += 1;

        if (healthChecks === 1) {
          return Promise.reject(new Error("connection refused"));
        }

        return Promise.resolve(jsonResponse({ healthy: true, version: "1.0.0" }));
      }) as typeof globalThis.fetch,
      resolveBinary: () =>
        Promise.resolve({
          path: "/tmp/project/node_modules/opencode/bin/opencode.js",
          source: "dependency",
        }),
    });

    await orchestrator.start();

    expect(spawnProcess).toHaveBeenCalledWith(
      "/tmp/project/node_modules/opencode/bin/opencode.js",
      ["serve", "--hostname=127.0.0.1", "--port=4100"],
      expect.objectContaining({
        cwd: "/tmp/project",
        detached: false,
      }),
    );
  });

  it("reuses an already running engine in development", async () => {
    const spawnProcess = vi.fn();
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "development",
        CC_OPENCODE_HEALTH_POLL_MS: "10000",
      },
    });
    const orchestrator = createOpenCodeOrchestrator({
      config,
      logger: pino({ enabled: false }),
      spawnProcess: spawnProcess,
      fetch: vi.fn(() =>
        Promise.resolve(jsonResponse({ healthy: true, version: "1.0.0" })),
      ) as typeof globalThis.fetch,
      resolveBinary: () =>
        Promise.resolve({
          path: "/tmp/project/node_modules/opencode/bin/opencode.js",
          source: "dependency",
        }),
    });

    await orchestrator.start();

    expect(spawnProcess).not.toHaveBeenCalled();
    expect(orchestrator.getStatus()).toEqual(
      expect.objectContaining({
        state: "healthy",
        healthy: true,
        version: "1.0.0",
        pid: undefined,
      }),
    );
  });

  it("fails startup when the engine never becomes healthy", async () => {
    const child = createChild(654);
    const processKill = vi.spyOn(process, "kill").mockImplementation((pid) => {
      expect(pid).toBe(-654);
      child.exitCode = 1;
      queueMicrotask(() => {
        child.emit("exit", 1, "SIGTERM");
      });
      return true;
    });
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_OPENCODE_STARTUP_TIMEOUT_MS: "100",
        CC_OPENCODE_TIMEOUT_MS: "20",
      },
    });
    const orchestrator = createOpenCodeOrchestrator({
      config,
      logger: pino({ enabled: false }),
      spawnProcess: vi.fn(() => child as never),
      fetch: vi.fn(() =>
        Promise.reject(new Error("connection refused")),
      ) as typeof globalThis.fetch,
      resolveBinary: () =>
        Promise.resolve({
          path: "/tmp/project/node_modules/opencode/bin/opencode.js",
          source: "dependency",
        }),
    });

    await expect(orchestrator.start()).rejects.toThrow(
      "OpenCode did not become healthy within 100ms.",
    );
    expect(orchestrator.getStatus()).toEqual(
      expect.objectContaining({
        state: "unhealthy",
        healthy: false,
        lastError: "OpenCode did not become healthy within 100ms.",
      }),
    );
    expect(processKill).toHaveBeenCalledWith(-654, "SIGTERM");
  });

  it("restarts crashed processes only within the configured restart limit", async () => {
    const first = createChild(111);
    const second = createChild(222);
    const children = [first, second];
    const spawnProcess = vi.fn(() => children.shift() as never);
    const fetch = vi.fn(() => Promise.resolve(jsonResponse({ healthy: true, version: "1.0.0" })));
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_OPENCODE_MAX_RESTARTS: "1",
        CC_OPENCODE_HEALTH_POLL_MS: "10000",
      },
    });
    const orchestrator = createOpenCodeOrchestrator({
      config,
      logger: pino({ enabled: false }),
      spawnProcess,
      fetch: fetch as typeof globalThis.fetch,
      resolveBinary: () =>
        Promise.resolve({
          path: "/tmp/project/node_modules/opencode/bin/opencode.js",
          source: "dependency",
        }),
    });

    await orchestrator.start();

    first.exitCode = 1;
    first.emit("exit", 1, null);
    await waitForQueue();

    expect(spawnProcess).toHaveBeenCalledTimes(2);

    second.exitCode = 1;
    second.emit("exit", 1, null);
    await waitForQueue();

    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(orchestrator.getStatus()).toEqual(
      expect.objectContaining({
        state: "unhealthy",
        restartCount: 1,
        maxRestarts: 1,
      }),
    );
  });
});

describe("createOpenCodeOrchestrator health and lifecycle branches", () => {
  function baseConfig(env: Record<string, string> = {}) {
    return loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_OPENCODE_HEALTH_POLL_MS: "10000",
        CC_OPENCODE_STARTUP_TIMEOUT_MS: "500",
        CC_OPENCODE_SHUTDOWN_TIMEOUT_MS: "30",
        ...env,
      },
    });
  }

  const binary = () =>
    Promise.resolve({
      path: "/tmp/project/node_modules/opencode/bin/opencode.js",
      source: "dependency" as const,
    });

  it("returns false from refreshHealth when no engine has started", async () => {
    const orchestrator = createOpenCodeOrchestrator({
      config: baseConfig(),
      logger: pino({ enabled: false }),
      spawnProcess: vi.fn(),
      fetch: vi.fn() as never,
      resolveBinary: binary,
    });

    await expect(orchestrator.refreshHealth()).resolves.toBe(false);
    expect(orchestrator.getStatus().state).toBe("stopped");
  });

  it("marks the engine unhealthy when a later health check fails", async () => {
    const child = createChild(501);
    let healthy = true;
    const fetch = vi.fn(() =>
      healthy
        ? Promise.resolve(jsonResponse({ healthy: true, version: "1.0.0" }))
        : Promise.reject(new Error("connection refused")),
    );
    vi.spyOn(process, "kill").mockImplementation(() => true);
    const orchestrator = createOpenCodeOrchestrator({
      config: baseConfig(),
      logger: pino({ enabled: false }),
      spawnProcess: vi.fn(() => child as never),
      fetch: fetch as typeof globalThis.fetch,
      resolveBinary: binary,
    });

    await orchestrator.start();
    expect(orchestrator.getStatus().healthy).toBe(true);

    healthy = false;
    await expect(orchestrator.refreshHealth()).resolves.toBe(false);
    expect(orchestrator.getStatus()).toEqual(
      expect.objectContaining({ state: "unhealthy", healthy: false }),
    );
  });

  it("restarts the engine on demand", async () => {
    const first = createChild(601);
    const second = createChild(602);
    const children = [first, second];
    const spawnProcess = vi.fn(() => children.shift() as never);
    const fetch = vi.fn(() => Promise.resolve(jsonResponse({ healthy: true, version: "1.0.0" })));
    const live = new Map<number, FakeChild>([
      [601, first],
      [602, second],
    ]);
    vi.spyOn(process, "kill").mockImplementation((pid) => {
      // pid is negative (detached process group); resolve the child and exit it.
      const child = live.get(Math.abs(pid));
      if (child) {
        child.exitCode = 0;
        queueMicrotask(() => child.emit("exit", 0, "SIGTERM"));
      }
      return true;
    });

    const orchestrator = createOpenCodeOrchestrator({
      config: baseConfig(),
      logger: pino({ enabled: false }),
      spawnProcess,
      fetch: fetch as typeof globalThis.fetch,
      resolveBinary: binary,
    });

    await orchestrator.start();
    await orchestrator.restart("manual restart requested");

    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(orchestrator.getStatus().healthy).toBe(true);
  });

  it("restarts automatically after an unexpected crash within the restart budget", async () => {
    const first = createChild(801);
    const second = createChild(802);
    const children = [first, second];
    const spawnProcess = vi.fn(() => children.shift() as never);
    const fetch = vi.fn(() => Promise.resolve(jsonResponse({ healthy: true, version: "1.0.0" })));
    vi.spyOn(process, "kill").mockImplementation(() => true);

    const orchestrator = createOpenCodeOrchestrator({
      config: baseConfig({ CC_OPENCODE_MAX_RESTARTS: "3" }),
      logger: pino({ enabled: false }),
      spawnProcess,
      fetch: fetch as typeof globalThis.fetch,
      resolveBinary: binary,
    });

    await orchestrator.start();
    expect(spawnProcess).toHaveBeenCalledTimes(1);

    // Simulate an unexpected crash of the running engine.
    first.exitCode = 1;
    first.emit("exit", 1, null);

    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalledTimes(2));
    expect(orchestrator.getStatus().restartCount).toBe(1);
  });

  it("fails startup when the child exits before becoming healthy", async () => {
    const child = createChild(803);
    const fetch = vi.fn(() => Promise.resolve(jsonResponse({ healthy: false })));
    vi.spyOn(process, "kill").mockImplementation(() => true);

    const orchestrator = createOpenCodeOrchestrator({
      config: baseConfig({ CC_OPENCODE_STARTUP_TIMEOUT_MS: "1000" }),
      logger: pino({ enabled: false }),
      spawnProcess: vi.fn(() => child as never),
      fetch: fetch as typeof globalThis.fetch,
      resolveBinary: binary,
    });

    const startPromise = orchestrator.start();
    // The process dies during startup before health is ever reported.
    queueMicrotask(() => {
      child.exitCode = 1;
      child.emit("exit", 1, null);
    });

    await expect(startPromise).rejects.toThrow();
    expect(orchestrator.getStatus().state).toBe("unhealthy");
  });

  it("returns to a stopped state when stopping with no running child", async () => {
    const orchestrator = createOpenCodeOrchestrator({
      config: baseConfig(),
      logger: pino({ enabled: false }),
      spawnProcess: vi.fn(),
      fetch: vi.fn() as never,
      resolveBinary: binary,
    });

    await orchestrator.stop();
    expect(orchestrator.getStatus().state).toBe("stopped");
  });

  it("escalates to SIGKILL when the child ignores SIGTERM on stop", async () => {
    const child = createChild(701);
    const signals: Array<string | number> = [];
    vi.spyOn(process, "kill").mockImplementation((_pid, signal) => {
      signals.push(signal as string);
      if (signal === "SIGKILL") {
        child.exitCode = 0;
        queueMicrotask(() => child.emit("exit", 0, "SIGKILL"));
      }
      // SIGTERM is intentionally ignored so the shutdown timeout escalates.
      return true;
    });
    const fetch = vi.fn(() => Promise.resolve(jsonResponse({ healthy: true, version: "1.0.0" })));
    const orchestrator = createOpenCodeOrchestrator({
      config: baseConfig(),
      logger: pino({ enabled: false }),
      spawnProcess: vi.fn(() => child as never),
      fetch: fetch as typeof globalThis.fetch,
      resolveBinary: binary,
    });

    await orchestrator.start();
    await orchestrator.stop();

    expect(signals).toContain("SIGTERM");
    expect(signals).toContain("SIGKILL");
    expect(orchestrator.getStatus().state).toBe("stopped");
  });
});

function createChild(pid: number): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.pid = pid;
  child.exitCode = null;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  return child;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

async function waitForQueue(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
