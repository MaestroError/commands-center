import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pino from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createEmbeddedRuntime,
  type EmbeddedRuntime,
} from "../../src/opencode/embedded-runtime.js";

const SECRET = "CC_EMBEDDED_RUNTIME_TEST_SECRET";
const AMBIENT = "CC_EMBEDDED_RUNTIME_TEST_AMBIENT";

describe("embedded runtime lifecycle", () => {
  const originalEnv = { ...process.env };
  let workspace: string;
  let configuration: string;
  let runtime: EmbeddedRuntime;
  let environment: Record<string, string> = {};
  let environmentError = false;
  let port: number;
  let gate: { received: () => void; release: Promise<void> } | undefined;
  const credentials: string[] = [];
  const provider = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      credentials.push(request.headers.authorization ?? "");
      const waiting = gate;
      gate = undefined;
      if (waiting) {
        waiting.received();
        void waiting.release.then(respond);
      } else respond();
    });
    function respond(): void {
      response.writeHead(200, { "content-type": "text/event-stream" });
      for (const choice of [
        {
          index: 0,
          delta: { role: "assistant", content: "Runtime response" },
          finish_reason: null,
        },
        { index: 0, delta: {}, finish_reason: "stop" },
      ]) {
        response.write(
          `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test", choices: [choice] })}\n\n`,
        );
      }
      response.end("data: [DONE]\n\n");
    }
  });

  async function configure(model = "test"): Promise<void> {
    await writeFile(
      configuration,
      JSON.stringify({
        model: `test/${model}`,
        providers: {
          test: {
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: `{env:${SECRET}}` },
            models: { [model]: {} },
          },
        },
      }),
    );
  }

  function open(): Promise<EmbeddedRuntime> {
    return createEmbeddedRuntime({
      workspaceDirectory: workspace,
      publicOrigin: "https://cc.example.test",
      logger: pino({ level: "silent" }),
      sdkOptions: { models: { fetch: false }, fs: { filewatcher: false, fff: false } },
      prepareConfiguration: async () => {
        JSON.parse(await readFile(configuration, "utf8"));
      },
      resolveEnvironment: () => {
        if (environmentError) return Promise.reject(new Error("Cannot read secrets"));
        return Promise.resolve({ ...environment });
      },
    });
  }

  async function prompt() {
    const session = await runtime.chat.createSession(workspace);
    const message = await runtime.chat.promptSession({
      directory: workspace,
      sessionID: session.id,
      agent: "build",
      model: { providerID: "test", modelID: "test" },
      text: "Say hello",
      signal: AbortSignal.timeout(15000),
    });
    return { authorization: credentials.at(-1), message };
  }

  beforeAll(async () => {
    workspace = await realpath(await mkdtemp(join(tmpdir(), "cc-runtime-")));
    process.env["OPENCODE_TEST_HOME"] = workspace;
    delete process.env[SECRET];
    process.env[AMBIENT] = "ambient";
    const directory = join(workspace, ".cc/opencode-v2/config/opencode");
    await mkdir(directory, { recursive: true });
    configuration = join(directory, "opencode.json");
    await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
    const address = provider.address();
    if (!address || typeof address === "string") throw new Error("Missing provider port");
    port = address.port;
  });

  beforeEach(async () => {
    environment = { [SECRET]: "initial-key", [AMBIENT]: "workspace-value" };
    environmentError = false;
    await configure();
    if (!runtime || runtime.getStatus().state === "closed") runtime = await open();
    else await runtime.reload();
    credentials.length = 0;
  }, 30000);

  afterAll(async () => {
    await runtime?.close();
    await new Promise<void>((resolve) => provider.close(() => resolve()));
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    if (workspace) await rm(workspace, { recursive: true, force: true });
  });

  it("sends workspace credentials through the composed chat adapter", async () => {
    expect((await prompt()).authorization).toBe("Bearer initial-key");
  });

  it("uses rotated secrets through the same chat adapter", async () => {
    await prompt();
    environment[SECRET] = "rotated-key";
    await runtime.reload();
    expect((await prompt()).authorization).toBe("Bearer rotated-key");
  });

  it("allows an active chat to finish across a configuration reload", async () => {
    const received = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    gate = { received: received.resolve, release: release.promise };
    const response = prompt();
    try {
      await received.promise;
      await runtime.reload();
    } finally {
      release.resolve();
    }
    expect((await response).message.parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "text", text: "Runtime response" })]),
    );
  });

  it("removes deleted workspace secrets from the process environment", async () => {
    delete environment[SECRET];
    await runtime.reload();
    expect(process.env[SECRET]).toBeUndefined();
  });

  it("clears deleted secrets from the SDK's reloaded configuration", async () => {
    await runtime.providers.listModels();
    delete environment[SECRET];
    await runtime.reload();
    const configs = await runtime.host.config.get({ location: { directory: workspace } });
    expect(
      configs.flatMap((entry) =>
        entry.type === "document" ? [entry.info.providers?.["test"]?.settings?.["apiKey"]] : [],
      ),
    ).not.toContain("initial-key");
  });

  it("restores ambient values when workspace overrides are removed", async () => {
    delete environment[AMBIENT];
    await runtime.reload();
    expect(process.env[AMBIENT]).toBe("ambient");
  });

  it("refreshes the existing provider adapter after configuration changes", async () => {
    await runtime.providers.listModels();
    await configure("replacement");
    await runtime.reload();
    expect(await runtime.providers.listModels()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "replacement", providerId: "test" })]),
    );
  });

  it("keeps session identity across configuration reloads", async () => {
    const session = await runtime.chat.createSession(workspace);
    await runtime.reload();
    expect((await runtime.chat.getSession(workspace, session.id)).id).toBe(session.id);
  });

  it("reports a secret reload failure as unhealthy", async () => {
    environmentError = true;
    await expect(runtime.reload()).rejects.toThrow("Cannot read secrets");
    expect(runtime.getStatus().healthy).toBe(false);
  });

  it("rejects configuration validation failures before reloading the SDK", async () => {
    await runtime.providers.listModels();
    await writeFile(configuration, "{ invalid configuration");
    await expect(runtime.reload()).rejects.toThrow();
    expect(runtime.getStatus().healthy).toBe(false);
  });

  it("recovers after a failed reload", async () => {
    environmentError = true;
    await expect(runtime.reload()).rejects.toThrow();
    environmentError = false;
    await runtime.reload();
    expect(runtime.getStatus()).toEqual({ state: "healthy", healthy: true });
  });

  it("rejects reloads once shutdown begins", async () => {
    const closing = runtime.close();
    await expect(runtime.reload()).rejects.toThrow("closing");
    await closing;
  });

  it("restores the ambient environment on shutdown", async () => {
    await runtime.close();
    expect(process.env[AMBIENT]).toBe("ambient");
  });

  it("removes injected secrets on shutdown", async () => {
    await runtime.close();
    expect(process.env[SECRET]).toBeUndefined();
  });

  it("drains queued reloads before idempotent shutdown", async () => {
    await Promise.all([runtime.reload(), runtime.reload(), runtime.close(), runtime.close()]);
    expect(runtime.getStatus()).toEqual({ state: "closed", healthy: false });
  });

  it("closes OAuth callback registration on shutdown", async () => {
    await runtime.close();
    await expect(runtime.callbacks.configure("test")).rejects.toThrow("closed");
  });
});
