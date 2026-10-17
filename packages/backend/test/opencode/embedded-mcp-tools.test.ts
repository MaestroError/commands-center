import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mcp_servers } from "../../src/db/schema/mcp-servers.js";
import { bootstrapRuntimePaths } from "../../src/lib/runtime-paths.js";
import {
  createEmbeddedOpenCodeHost,
  type EmbeddedOpenCodeHost,
} from "../../src/opencode/embedded-host.js";
import { createEmbeddedMcpService } from "../../src/opencode/embedded-mcp-service.js";
import {
  renderEmbeddedToolEntry,
  renderEmbeddedToolTemplate,
} from "../../src/opencode/embedded-custom-tools.js";
import { prepareEmbeddedSpecialistWorkspace } from "../../src/opencode/embedded-specialist-workspace.js";
import { createCustomToolService } from "../../src/services/custom-tool-service.js";
import { createTestDatabase } from "../helpers/db.js";

describe("embedded MCP and custom tools", () => {
  const savedEnv = { ...process.env };
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let host: EmbeddedOpenCodeHost;
  let directory: string;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      if (request.url === "/mcp") {
        if (request.headers.authorization !== "Bearer managed-test") {
          response.writeHead(401).end();
          return;
        }
        if (request.method !== "POST") {
          response.writeHead(405).end();
          return;
        }
        const rpc = JSON.parse(body) as { id?: number; method: string };
        if (rpc.id === undefined) {
          response.writeHead(202).end();
          return;
        }
        const result =
          rpc.method === "initialize"
            ? {
                protocolVersion: "2025-03-26",
                capabilities: { tools: {} },
                serverInfo: { name: "managed", version: "1" },
              }
            : rpc.method === "tools/list"
              ? {
                  tools: [
                    {
                      name: "greet",
                      description: "Managed greeting",
                      inputSchema: { type: "object", properties: {} },
                    },
                  ],
                }
              : rpc.method === "tools/call"
                ? { content: [{ type: "text", text: "Managed MCP response" }] }
                : {};
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
        return;
      }
      const input = JSON.parse(body) as {
        stream?: boolean;
        messages?: { role: string; content?: unknown }[];
      };
      const prompt = input.messages?.findLast((message) => message.role === "user")?.content;
      const target = JSON.stringify(prompt).match(/CALL:([A-Za-z0-9_-]+)/)?.[1];
      const call = target && !input.messages?.some((message) => message.role === "tool");
      const message = call
        ? {
            role: "assistant",
            tool_calls: [
              { id: "call-1", type: "function", function: { name: target, arguments: "{}" } },
            ],
          }
        : { role: "assistant", content: "Done" };
      if (!input.stream) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: "test",
            object: "chat.completion",
            created: 1,
            model: "test",
            choices: [{ index: 0, message, finish_reason: call ? "tool_calls" : "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        );
        return;
      }
      const delta = call
        ? { tool_calls: [{ index: 0, ...message.tool_calls![0] }] }
        : { content: "Done" };
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta, finish_reason: call ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
      );
    });
  });

  beforeAll(async () => {
    db = await createTestDatabase();
    await bootstrapRuntimePaths(db.config);
    process.env["OPENCODE_TEST_HOME"] = db.cwd;
    process.env["CC_MCP_TEST_VALUE"] = "secret-from-env";
    directory = join(db.cwd, "specialist");
    const fixture = join(db.cwd, "mcp.mjs");
    await writeFile(
      fixture,
      `import { createInterface } from "node:readline";
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  const result = request.method === "initialize" ? { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "cc-test", version: "1" } }
    : request.method === "tools/list" ? { tools: [{ name: "greet", description: "Test greeting", inputSchema: { type: "object", properties: {} } }] }
    : request.method === "tools/call" ? { content: [{ type: "text", text: "MCP:" + process.env.TEST_VALUE }] } : {};
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
});`,
    );
    await db.client.db.insert(mcp_servers).values({
      id: "local",
      name: "local",
      transport: "stdio",
      enabled: true,
      config_json: JSON.stringify({
        transport: "stdio",
        command: [process.execPath, fixture],
        environment: { TEST_VALUE: "{env:CC_MCP_TEST_VALUE}" },
      }),
      created_at: new Date(),
      updated_at: new Date(),
    });
    const customTools = createCustomToolService({
      config: db.config,
      db: db.client.db,
      opencodeService: { dispose: () => Promise.resolve() },
      renderTemplate: renderEmbeddedToolTemplate,
      renderEntryWrapper: renderEmbeddedToolEntry,
    });
    await customTools.create({ name: "Greeting", description: "A custom greeting" });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    await prepareEmbeddedSpecialistWorkspace({
      db: db.client.db,
      config: db.config,
      workspacePath: directory,
      customToolService: customTools,
      input: {
        name: "Test",
        role: "Tester",
        instructions: "Test tools",
        defaultModel: "test/test",
        capabilities: {
          customTools: ["greeting"],
          mcpServers: [{ name: "local", action: "allow", enabled: true }],
        },
        appMcpEntries: {
          cc_default: {
            type: "remote",
            url: `http://127.0.0.1:${address.port}/mcp`,
            enabled: true,
            oauth: false,
            headers: { Authorization: "Bearer managed-test" },
          },
        },
      },
    });
    const privatePlugins = join(directory, ".opencode", "plugins");
    await mkdir(privatePlugins, { recursive: true });
    await writeFile(
      join(privatePlugins, "private-greeting.ts"),
      renderEmbeddedToolTemplate("private-greeting", "A specialist-local greeting").replace(
        "Implement this tool.",
        "Private specialist greeting",
      ),
    );
    const configuration = join(db.config.paths.workspaceDir, ".cc/opencode-v2/config/opencode");
    await mkdir(configuration, { recursive: true });
    await writeFile(
      join(configuration, "opencode.json"),
      JSON.stringify({
        model: "test/test",
        providers: {
          test: {
            package: "@opencode/ai/providers/openai-compatible",
            settings: { apiKey: "test", baseURL: `http://127.0.0.1:${address.port}` },
            models: { test: {} },
          },
        },
      }),
    );
    host = await createEmbeddedOpenCodeHost({
      workspaceDirectory: db.config.paths.workspaceDir,
      sdkOptions: { models: { fetch: false }, fs: { fff: false, filewatcher: false } },
    });
  }, 30000);
  afterAll(async () => {
    await host?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db?.cleanup();
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  });

  async function prompt(tool: string, effect: "allow" | "ask" | "deny" = "allow") {
    const session = await host.sessions.create({
      location: { directory },
      permissions: [{ action: tool, resource: "*", effect }],
    });
    await host.sessions.prompt({ sessionID: session.id, text: `CALL:${tool}` });
    return session.id;
  }
  async function messages(sessionID: string) {
    await host.sessions.wait({ sessionID }, { signal: AbortSignal.timeout(10000) });
    return JSON.stringify((await host.message.list({ sessionID, order: "asc" })).data);
  }

  it("lists actual MCP tools through the embedded plugin bridge", async () => {
    expect(await createEmbeddedMcpService(host).listMcpToolIds(directory)).toContain("local_greet");
  });
  it("loads the copied custom tool as a native plugin", async () => {
    expect((await host.listTools(directory)).map((tool) => tool.id)).toContain(
      "cc_custom_greeting",
    );
  });
  it("keeps secret references in generated specialist configuration", async () => {
    expect(await readFile(join(directory, "opencode.jsonc"), "utf8")).toContain(
      "{env:CC_MCP_TEST_VALUE}",
    );
  });
  it("executes an MCP tool with resolved environment credentials", async () => {
    expect(await messages(await prompt("local_greet"))).toContain("MCP:secret-from-env");
  });
  it("executes a specialist-local plugin discovered from the workspace", async () => {
    expect(await messages(await prompt("cc_custom_private-greeting"))).toContain(
      "Private specialist greeting",
    );
  });

  it("executes a copied native custom tool", async () => {
    expect(await messages(await prompt("cc_custom_greeting"))).toContain("Implement this tool.");
  });
  it("blocks a denied custom tool", async () => {
    expect(await messages(await prompt("cc_custom_greeting", "deny"))).not.toContain(
      "Implement this tool.",
    );
  });
  it("blocks a denied MCP tool", async () => {
    expect(await messages(await prompt("local_greet", "deny"))).not.toContain(
      "MCP:secret-from-env",
    );
  });
  it("waits for approval before running a custom tool", async () => {
    const sessionID = await prompt("cc_custom_greeting", "ask");
    await expect
      .poll(async () => (await host.permission.list({ sessionID })).length, { timeout: 10000 })
      .toBe(1);
    const [permission] = await host.permission.list({ sessionID });
    await host.permission.reply({ sessionID, requestID: permission!.id, decision: "once" });
    expect(await messages(sessionID)).toContain("Implement this tool.");
  });
  it("waits for approval before running an MCP tool", async () => {
    const sessionID = await prompt("local_greet", "ask");
    await expect
      .poll(async () => (await host.permission.list({ sessionID })).length, { timeout: 10000 })
      .toBe(1);
    const [permission] = await host.permission.list({ sessionID });
    await host.permission.reply({ sessionID, requestID: permission!.id, decision: "once" });
    expect(await messages(sessionID)).toContain("MCP:secret-from-env");
  });
  it("executes a default-enabled managed MCP tool over authenticated HTTP", async () => {
    expect(await messages(await prompt("cc_default_greet"))).toContain("Managed MCP response");
  });
  it("does not execute a rejected custom tool", async () => {
    const sessionID = await prompt("cc_custom_greeting", "ask");
    await expect
      .poll(async () => (await host.permission.list({ sessionID })).length, { timeout: 10000 })
      .toBe(1);
    const [permission] = await host.permission.list({ sessionID });
    await host.permission.reply({ sessionID, requestID: permission!.id, decision: "reject" });
    expect(await messages(sessionID)).not.toContain("Implement this tool.");
  });
  it("interrupts a custom tool awaiting approval", async () => {
    const sessionID = await prompt("cc_custom_greeting", "ask");
    await expect
      .poll(async () => (await host.permission.list({ sessionID })).length, { timeout: 10000 })
      .toBe(1);
    await host.sessions.interrupt({ sessionID });
    expect(await messages(sessionID)).not.toContain("Implement this tool.");
  });
  it("clears custom-tool approval requests when a session is interrupted", async () => {
    const sessionID = await prompt("cc_custom_greeting", "ask");
    await expect
      .poll(async () => (await host.permission.list({ sessionID })).length, { timeout: 10000 })
      .toBe(1);
    await host.sessions.interrupt({ sessionID });
    await expect
      .poll(async () => (await host.permission.list({ sessionID })).length, { timeout: 10000 })
      .toBe(0);
  });
  it("removes disconnected MCP tools from the live inventory", async () => {
    const mcp = createEmbeddedMcpService(host);
    await mcp.disconnect(directory, "local");
    try {
      expect(await mcp.listMcpToolIds(directory)).not.toContain("local_greet");
    } finally {
      await mcp.connect(directory, "local");
    }
  });
});
