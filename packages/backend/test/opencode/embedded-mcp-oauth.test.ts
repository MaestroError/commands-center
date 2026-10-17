import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import pino from "pino";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { configureFastifyZod, type AppServer } from "../../src/lib/fastify-zod.js";
import {
  createEmbeddedRuntime,
  type EmbeddedRuntime,
} from "../../src/opencode/embedded-runtime.js";
import type { EmbeddedMcpService } from "../../src/opencode/embedded-mcp-service.js";
import type { EmbeddedMcpOAuthCallbacks } from "../../src/opencode/embedded-mcp-oauth-callbacks.js";
import { registerEmbeddedMcpOAuthCallbackRoute } from "../../src/routes/embedded-mcp-oauth.js";
import { createEmbeddedOAuthProvider } from "../helpers/embedded-oauth-provider.js";

describe("embedded MCP OAuth through CC's public callback", () => {
  const originalEnv = { ...process.env };
  let directory: string;
  let runtime: EmbeddedRuntime;
  let service: EmbeddedMcpService;
  let callbacks: EmbeddedMcpOAuthCallbacks;
  let app: AppServer;
  let provider: Awaited<ReturnType<typeof createEmbeddedOAuthProvider>>;
  beforeAll(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), "cc-mcp-oauth-")));
    process.env["OPENCODE_TEST_HOME"] = directory;
    provider = await createEmbeddedOAuthProvider();
    runtime = await createEmbeddedRuntime({
      workspaceDirectory: directory,
      publicOrigin: "https://cc.example.test",
      logger: pino({ level: "silent" }),
      resolveEnvironment: () => Promise.resolve({}),
      sdkOptions: { models: { fetch: false }, fs: { filewatcher: false, fff: false } },
      prepareConfiguration: async (registry) => {
        const oauth = await registry.configure("server-id");
        await writeFile(
          join(directory, "opencode.jsonc"),
          JSON.stringify({
            mcp: { servers: { test: { type: "remote", url: `${provider.origin}/mcp`, oauth } } },
          }),
        );
      },
    });
    callbacks = runtime.callbacks;
    service = runtime.mcp;
    app = Fastify();
    configureFastifyZod(app);
    registerEmbeddedMcpOAuthCallbackRoute(app, callbacks);
  }, 30000);
  afterEach(async () => {
    await service.removeMcpAuth(directory, "test");
  });
  afterAll(async () => {
    await app?.close();
    await runtime?.close();
    await provider?.close();
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function authorize(): Promise<URL> {
    const { authorizationUrl } = await service.startMcpAuth(directory, "test");
    const response = await fetch(authorizationUrl, { redirect: "manual" });
    expect(response.status).toBe(302);
    return new URL(response.headers.get("location")!);
  }
  const deliver = (url: URL) => app.inject({ method: "GET", url: url.pathname + url.search });

  it("exchanges a code with PKCE using the public redirect URI", async () => {
    const callback = await authorize();
    const response = await deliver(callback);
    expect(response.statusCode).toBe(200);
    expect(provider.exchanges.at(-1)).toBe(
      "https://cc.example.test/api/mcp-servers/server-id/auth/redirect",
    );
  });
  it("connects the MCP server after authorization", async () => {
    await deliver(await authorize());
    await expect
      .poll(() => service.authenticateMcp(directory, "test"))
      .toMatchObject({ status: "connected" });
  });
  it("rejects an incorrect state without consuming the valid attempt", async () => {
    const callback = await authorize();
    const wrong = new URL(callback);
    wrong.searchParams.set("state", "wrong");
    expect((await deliver(wrong)).statusCode).toBe(400);
    expect((await deliver(callback)).statusCode).toBe(200);
  });
  it("rejects replay of a completed callback", async () => {
    const callback = await authorize();
    await deliver(callback);
    expect((await deliver(callback)).statusCode).toBe(400);
  });
  it("preserves issuer validation in the SDK", async () => {
    const callback = await authorize();
    callback.searchParams.set("iss", "https://wrong-issuer.test");
    expect((await deliver(callback)).statusCode).toBe(400);
  });
  it("forwards provider denial to the SDK attempt", async () => {
    const callback = await authorize();
    callback.searchParams.delete("code");
    callback.searchParams.set("error", "access_denied");
    expect((await deliver(callback)).statusCode).toBe(400);
    await expect(service.authenticateMcp(directory, "test")).rejects.toThrow();
  });
  it("rejects callbacks after authorization is cancelled", async () => {
    const callback = await authorize();
    await service.removeMcpAuth(directory, "test");
    expect((await deliver(callback)).statusCode).toBe(400);
  });
  it("invalidates a replaced authorization attempt", async () => {
    const previous = await authorize();
    const current = await authorize();
    expect(current.searchParams.get("state")).not.toBe(previous.searchParams.get("state"));
    expect((await deliver(previous)).statusCode).toBe(400);
    const currentResponse = await deliver(current);
    expect(currentResponse.statusCode).toBe(200);
  });
  it("reports a rejected authorization code as failure", async () => {
    const callback = await authorize();
    callback.searchParams.set("code", "invalid-code");
    expect((await deliver(callback)).statusCode).toBe(400);
  });
  it("rejects a callback addressed to another MCP server", async () => {
    const callback = await authorize();
    callback.pathname = callback.pathname.replace("server-id", "another-server");
    expect((await deliver(callback)).statusCode).toBe(400);
  });
});
