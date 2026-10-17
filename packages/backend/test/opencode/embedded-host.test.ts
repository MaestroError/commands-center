import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createEmbeddedOpenCodeHost,
  type EmbeddedOpenCodeHost,
} from "../../src/opencode/embedded-host.js";

describe("embedded OpenCode host", () => {
  const originalEnv = { ...process.env };
  let workspace: string;
  let host: EmbeddedOpenCodeHost;
  let sessionID: string;
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push(Buffer.concat(chunks).toString());
      response.writeHead(200, { "content-type": "text/event-stream" });
      for (const choice of [
        {
          index: 0,
          delta: { role: "assistant", content: "Hello from CC's embedded host" },
          finish_reason: null,
        },
        { index: 0, delta: {}, finish_reason: "stop" },
      ]) {
        response.write(
          `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test", choices: [choice] })}\n\n`,
        );
      }
      response.end("data: [DONE]\n\n");
    });
  });
  const openHost = (): Promise<EmbeddedOpenCodeHost> =>
    createEmbeddedOpenCodeHost({
      workspaceDirectory: workspace,
      sdkOptions: { models: { fetch: false }, fs: { filewatcher: false, fff: false } },
    });

  beforeAll(async () => {
    workspace = await realpath(await mkdtemp(join(tmpdir(), "cc-embedded-host-")));
    const configuration = join(workspace, ".cc", "opencode-v2", "config", "opencode");
    await mkdir(configuration, { recursive: true });
    await mkdir(join(workspace, "alpha"));
    await mkdir(join(workspace, "beta"));
    await writeFile(join(workspace, "alpha", "AGENTS.md"), "Specialist marker: CC_ALPHA");
    await writeFile(join(workspace, "beta", "AGENTS.md"), "Specialist marker: CC_BETA");
    process.env["OPENCODE_TEST_HOME"] = workspace;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing provider port");
    await writeFile(
      join(configuration, "opencode.json"),
      JSON.stringify({
        model: "test/test",
        providers: {
          test: {
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: `http://127.0.0.1:${address.port}/v1`, apiKey: "test-only" },
            models: { test: {} },
          },
        },
      }),
    );
    host = await openHost();
    const session = await host.sessions.create({
      location: { directory: join(workspace, "alpha") },
      model: { providerID: "test", id: "test" },
    });
    sessionID = session.id;
    await host.sessions.prompt({ sessionID, text: "Say hello" });
    await host.sessions.wait({ sessionID }, { signal: AbortSignal.timeout(15000) });
  }, 30000);

  afterAll(async () => {
    await host?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    if (workspace) await rm(workspace, { recursive: true, force: true });
  });

  it("stores its SQLite database inside the workspace", async () => {
    const header = await readFile(join(workspace, ".cc", "opencode-v2", "engine.db"));
    expect(header.subarray(0, 15).toString()).toBe("SQLite format 3");
  });

  it("persists a streamed provider response", async () => {
    const messages = await host.message.list({ sessionID });
    expect(JSON.stringify(messages.data)).toContain("Hello from CC's embedded host");
  });

  it("uses the session specialist's instructions", () => {
    expect(requests.some((request) => request.includes("CC_ALPHA"))).toBe(true);
  });

  it("excludes another specialist's instructions", () => {
    expect(requests.some((request) => request.includes("CC_BETA"))).toBe(false);
  });

  it("excludes sessions belonging to another location", async () => {
    const sessions = await host.sessions.list({ directory: join(workspace, "beta") });
    expect(sessions.data).toHaveLength(0);
  });

  it("rejects a second active host", async () => {
    await expect(openHost()).rejects.toThrow("already active");
  });

  it("reopens persisted sessions after shutdown", async () => {
    await Promise.all([host.close(), host[Symbol.asyncDispose]()]);
    host = await openHost();
    expect((await host.sessions.get({ sessionID })).id).toBe(sessionID);
  });

  it("rejects switching workspace within a process", async () => {
    await expect(
      createEmbeddedOpenCodeHost({ workspaceDirectory: join(workspace, "beta") }),
    ).rejects.toThrow("cannot change within a process");
  });
});
