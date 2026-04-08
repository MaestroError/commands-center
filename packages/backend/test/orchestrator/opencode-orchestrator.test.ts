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
