import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  startServerRuntime,
  installSignalHandlers,
  type StartedServerRuntime,
} from "../../src/lib/start-server-runtime.js";
import { createEmbeddedRuntime } from "../../src/opencode/embedded-runtime.js";
import { createLocalModelProvider } from "./model-provider.js";

describe("normal embedded runtime startup", () => {
  let workspace: string;
  let provider: Awaited<ReturnType<typeof createLocalModelProvider>>;
  let runtime: StartedServerRuntime;
  const savedHome = process.env["OPENCODE_TEST_HOME"];
  async function boot(port = 0): Promise<StartedServerRuntime> {
    return startServerRuntime({
      cwd: workspace,
      env: { NODE_ENV: "test", CC_WORKSPACE_DIR: workspace, CC_LOG_LEVEL: "silent" },
      overrides: { host: "127.0.0.1", port },
      installSignalHandlers: false,
      createEmbeddedRuntime: (options) =>
        createEmbeddedRuntime({
          ...options,
          sdkOptions: { models: { fetch: false }, fs: { fff: false, filewatcher: false } },
          prepareConfiguration: async (callbacks) => {
            await options.prepareConfiguration(callbacks);
            const directory = join(workspace, ".cc/opencode-v2/config/opencode");
            await mkdir(directory, { recursive: true });
            await writeFile(
              join(directory, "opencode.json"),
              JSON.stringify({
                model: "local-e2e/test",
                providers: {
                  "local-e2e": {
                    package: "@opencode/ai/providers/openai-compatible",
                    settings: { baseURL: `${provider.origin}/v1`, apiKey: "fixture" },
                    models: { test: {} },
                  },
                },
              }),
            );
          },
        }),
    });
  }
  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), "cc-normal-v2-"));
    process.env["OPENCODE_TEST_HOME"] = workspace;
    provider = await createLocalModelProvider();
  });
  beforeEach(async () => {
    runtime = await boot();
  }, 30000);
  afterEach(async () => {
    await runtime?.drain("manual");
  });
  afterAll(async () => {
    await provider?.close();
    if (savedHome === undefined) delete process.env["OPENCODE_TEST_HOME"];
    else process.env["OPENCODE_TEST_HOME"] = savedHome;
    await rm(workspace, { recursive: true, force: true });
  });
  it("boots the full server with a healthy embedded engine", async () => {
    const result = await runtime.server.inject("/api/health");
    expect(result.json()).toMatchObject({
      status: "ok",
      opencode: { healthy: true, url: "embedded://local" },
    });
  });
  it("keeps engine storage inside the workspace", async () => {
    expect(
      (await readFile(join(workspace, ".cc/opencode-v2/engine.db"))).subarray(0, 15).toString(),
    ).toBe("SQLite format 3");
  });
  it("executes a provider request through the normal engine", async () => {
    const session = await runtime.opencodeService.createSession(workspace);
    const result = await runtime.opencodeService.promptSession({
      directory: workspace,
      sessionID: session.id,
      agent: "build",
      model: { providerID: "local-e2e", modelID: "test" },
      text: "Hello",
      signal: AbortSignal.timeout(10000),
    });
    expect(JSON.stringify(result)).toContain("Local v2 response.");
  });
  it("reloads the embedded engine without launching a daemon", async () => {
    await runtime.orchestrator.restart("test reload");
    expect(runtime.orchestrator.getStatus()).toMatchObject({
      healthy: true,
      url: "embedded://local",
    });
  });
  it("reconciles specialist v2 configuration while preserving authored instructions", async () => {
    const specialist = await runtime.workspaceServices!.specialists.create({
      name: "Boot specialist",
      role: "Tester",
      instructions: "Original",
      defaultModel: "local-e2e/test",
      capabilities: {},
    });
    const rules = join(specialist.workspacePath, "AGENTS.md");
    await writeFile(rules, "Locally authored instructions\n");
    await runtime.drain("manual");
    runtime = await boot();
    expect(await readFile(rules, "utf8")).toBe("Locally authored instructions\n");
  });
  it("writes native configuration on specialist creation", async () => {
    const specialist = await runtime.workspaceServices!.specialists.create({
      name: "Native config",
      role: "Tester",
      instructions: "Test",
      defaultModel: "local-e2e/test",
      capabilities: {},
    });
    const configuration: unknown = JSON.parse(
      await readFile(join(specialist.workspacePath, "opencode.jsonc"), "utf8"),
    );
    expect(configuration).toMatchObject({ mcp: { servers: expect.any(Object) } });
    expect(configuration).not.toHaveProperty("permission");
  });

  it("loads updated secrets through normal engine reload", async () => {
    await runtime.secretService.set("CC_NORMAL_STARTUP_TEST_SECRET", "test-value");
    await runtime.orchestrator.restart("secret changed");
    expect(process.env["CC_NORMAL_STARTUP_TEST_SECRET"]).toBe("test-value");
  });

  it("closes the engine on drain", async () => {
    await runtime.drain("manual");
    expect(runtime.embeddedRuntime?.getStatus().state).toBe("closed");
  });
  it("closes SQLite on drain", async () => {
    await runtime.drain("manual");
    expect(() => runtime.database.db.run(sql`SELECT 1`)).toThrow();
  });
  it("releases the SDK host after a listen failure", async () => {
    await runtime.drain("manual");
    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    const address = occupied.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    try {
      await expect(boot(address.port)).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
    runtime = await boot();
    expect(runtime.embeddedRuntime?.getStatus().healthy).toBe(true);
  });
});
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
