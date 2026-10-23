import {
  createEmbeddedMcpToolPolicy,
  type EmbeddedMcpToolPolicy,
} from "../../src/opencode/embedded-mcp-tool-policy.js";
import { mcpSnapshotRules } from "../../src/opencode/embedded-mcp-permissions.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { agents, conversations, tasks, task_runs } from "../../src/db/schema/index.js";
import {
  createEmbeddedCcToolService,
  type EmbeddedCcTools,
} from "../../src/opencode/embedded-cc-tools.js";

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
  const catalogs = new Map<string, string[]>();
  const mcpTools: { current?: EmbeddedMcpToolPolicy } = {};
  const ccTools: { current?: EmbeddedCcTools } = {};
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
        tools?: { function: { name: string } }[];
      };
      const prompt = input.messages?.findLast((message) => message.role === "user")?.content;
      const marker = JSON.stringify(prompt ?? "").match(/CATALOG:([A-Za-z0-9_-]+)/)?.[1];
      if (marker && input.tools !== undefined)
        catalogs.set(
          marker,
          input.tools.map((tool) => tool.function.name),
        );
      const target = JSON.stringify(prompt ?? "").match(/CALL:([A-Za-z0-9_-]+)/)?.[1];
      const call = target && !input.messages?.some((message) => message.role === "tool");
      const message = call
        ? {
            role: "assistant",
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: target,
                  arguments:
                    target === "execute"
                      ? JSON.stringify({ code: "return await tools.local.greet({})" })
                      : "{}",
                },
              },
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
          managed: {
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
    await writeFile(
      join(privatePlugins, "context-probe.ts"),
      `export default {
  id: "cc.context-probe",
  async setup(context) {
    await context.tool.transform((editor) => {
      for (const name of ["chat", "task_run", "both"]) {
        editor.add({
          name,
          description: "Session isolation probe",
          input: { type: "object", properties: {}, additionalProperties: false },
          options: { namespace: "cc_probe", codemode: false },
          execute: async (_input, caller) => ({
            content: JSON.stringify({
              marker: "CC_CONTEXT_PROBE_EXECUTED",
              sessionID: caller.sessionID,
              messageID: caller.messageID,
              callID: caller.id,
              cancellable: caller.signal instanceof AbortSignal,
            }),
          }),
        });
      }
    });
  },
};`,
    );
    const configuration = join(db.config.paths.workspaceDir, ".cc/opencode-v2/config/opencode");
    await mkdir(configuration, { recursive: true });
    await writeFile(
      join(configuration, "opencode.json"),
      JSON.stringify({
        model: "test/test",
        mcp: { servers: { cc_custom: { type: "local", command: [process.execPath, fixture] } } },
        providers: {
          test: {
            package: "@opencode/ai/providers/openai-compatible",
            settings: { apiKey: "test", baseURL: `http://127.0.0.1:${address.port}` },
            models: { test: {} },
          },
        },
      }),
    );
    const now = new Date();
    await db.client.db.insert(agents).values({
      id: "probe-agent",
      slug: "specialist",
      name: "Probe",
      role: "Test",
      instructions: "Test",
      default_model: "test/test",
      capabilities_json: JSON.stringify({
        appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
        appToolPermissions: [
          { pattern: "cc_app_task_run", action: "allow" },
          { pattern: "cc_app_both", action: "allow" },
        ],
      }),
      status: "active",
      created_at: now,
      updated_at: now,
    });
    host = await createEmbeddedOpenCodeHost({
      ccTools,
      mcpTools,
      workspaceDirectory: db.config.paths.workspaceDir,
      sdkOptions: { models: { fetch: false }, fs: { fff: false, filewatcher: false } },
    });
    mcpTools.current = createEmbeddedMcpToolPolicy({
      db: db.client.db,
      specialistsDirectory: dirname(directory),
      host,
    });
    ccTools.current = createEmbeddedCcToolService({
      db: db.client.db,
      specialistsDirectory: dirname(directory),
      host,
      groups: [
        {
          name: "cc_app",
          routeSegment: "cc-app",
          description: "Probe",
          enabledByDefault: true,
          companionPromptId: null,
          catalogTools: [],
          tools: (["chat", "task_run", "both"] as const).map((context) => ({
            name: context,
            description: "Owned native tool",
            context,
            outputSchema: z.object({ owner: z.string() }),
            execute: (_input, caller) => ({
              content: [{ type: "text", text: `OWNED:${caller.caller?.ownerSessionID}` }],
              structuredContent: { owner: caller.caller!.ownerSessionID },
            }),
          })),
        },
      ],
    });
  }, 30000);
  afterAll(async () => {
    await host?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db?.cleanup();
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  });

  async function ownChat(sessionID: string) {
    const now = new Date();
    await db.client.db.insert(conversations).values({
      id: sessionID,
      agent_id: "probe-agent",
      opencode_session_id: sessionID,
      status: "active",
      source: "chat",
      created_at: now,
      updated_at: now,
    });
  }
  async function prompt(tool: string, effect: "allow" | "ask" | "deny" = "allow") {
    const session = await host.sessions.create({
      location: { directory },
      permissions: [{ action: tool, resource: "*", effect }],
    });
    await ownChat(session.id);
    await host.sessions.prompt({ sessionID: session.id, text: `CALL:${tool}` });
    return session.id;
  }
  async function messages(sessionID: string) {
    await host.sessions.wait({ sessionID }, { signal: AbortSignal.timeout(10000) });
    return JSON.stringify((await host.message.list({ sessionID, order: "asc" })).data);
  }

  it("lists actual MCP tools through the embedded plugin bridge", async () => {
    await host.listTools(directory);
    expect(await createEmbeddedMcpService(host).listMcpToolIds(directory)).toContain("local_greet");
  });
  it("isolates native tool catalogs for concurrent sessions in the same location", async () => {
    const contexts = ["chat", "task_run"] as const;
    await Promise.all(
      contexts.map(async (context) => {
        const session = await host.sessions.create({
          location: { directory },
          permissions: [
            { action: "cc_probe_*", resource: "*", effect: "deny" },
            { action: `cc_probe_${context}`, resource: "*", effect: "allow" },
            { action: "cc_probe_both", resource: "*", effect: "allow" },
          ],
        });
        await ownChat(session.id);
        await host.sessions.prompt({ sessionID: session.id, text: `CATALOG:${context}` });
        await messages(session.id);
      }),
    );
    expect(
      Object.fromEntries(
        contexts.map((context) => [
          context,
          catalogs
            .get(context)
            ?.filter((name) => name.startsWith("cc_probe_"))
            .sort(),
        ]),
      ),
    ).toEqual({
      chat: ["cc_probe_both", "cc_probe_chat"],
      task_run: ["cc_probe_both", "cc_probe_task_run"],
    });
  });
  it("filters CC tool catalogs using persisted chat and task ownership", async () => {
    const chat = await host.sessions.create({ location: { directory } });
    await ownChat(chat.id);
    const task = await host.sessions.create({ location: { directory } });
    const now = new Date();
    await db.client.db.insert(tasks).values({
      id: "owned-task",
      agent_id: "probe-agent",
      title: "Test",
      description: "Test",
      context: "",
      todos_json: "[]",
      status: "running",
      enabled: true,
      archived: false,
      created_at: now,
      updated_at: now,
    });
    await db.client.db.insert(task_runs).values({
      id: "owned-run",
      task_id: "owned-task",
      agent_id: "probe-agent",
      opencode_session_id: task.id,
      status: "running",
      trigger_source: "manual",
      rendered_prompt: "Test",
      effective_permissions_json: JSON.stringify({
        appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
        appToolPermissions: [
          { pattern: "cc_app_task_run", action: "allow" },
          { pattern: "cc_app_both", action: "allow" },
        ],
      }),
      created_at: now,
      updated_at: now,
    });
    await Promise.all(
      [chat, task].map(async (session, index) => {
        await host.sessions.prompt({ sessionID: session.id, text: `CATALOG:owned-${index}` });
        await messages(session.id);
      }),
    );
    expect(
      [0, 1].map((index) =>
        catalogs
          .get(`owned-${index}`)
          ?.filter((id) => id.startsWith("cc_app_"))
          .sort(),
      ),
    ).toEqual([
      ["cc_app_both", "cc_app_chat"],
      ["cc_app_both", "cc_app_task_run"],
    ]);
    await db.client.db
      .update(task_runs)
      .set({ status: "completed" })
      .where(eq(task_runs.id, "owned-run"));
  });
  it("isolates successive task overrides from a concurrent chat", async () => {
    const chat = await host.sessions.create({ location: { directory } });
    await ownChat(chat.id);
    const visible: string[][] = [];
    for (const allowed of [true, false]) {
      const session = await host.sessions.create({ location: { directory } });
      const id = `override-${String(allowed)}`;
      const now = new Date();
      await db.client.db.insert(tasks).values({
        id,
        agent_id: "probe-agent",
        title: id,
        description: "Test",
        context: "",
        todos_json: "[]",
        status: "running",
        enabled: true,
        archived: false,
        created_at: now,
        updated_at: now,
      });
      await db.client.db.insert(task_runs).values({
        id,
        task_id: id,
        agent_id: "probe-agent",
        opencode_session_id: session.id,
        status: "running",
        trigger_source: "manual",
        rendered_prompt: "Test",
        effective_permissions_json: JSON.stringify({
          snapshotVersion: 1,
          appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
          appToolPermissions: [{ pattern: "cc_app_task_run", action: allowed ? "allow" : "deny" }],
        }),
        created_at: now,
        updated_at: now,
      });
      await Promise.all(
        [chat, session].map(async (current, index) => {
          await host.sessions.prompt({ sessionID: current.id, text: `CATALOG:${id}-${index}` });
          await messages(current.id);
        }),
      );
      visible.push(
        ...[0, 1].map(
          (index) =>
            catalogs
              .get(`${id}-${index}`)
              ?.filter((name) => name.startsWith("cc_app_"))
              .sort() ?? [],
        ),
      );
      await db.client.db.update(task_runs).set({ status: "completed" }).where(eq(task_runs.id, id));
    }
    expect(visible).toEqual([
      ["cc_app_both", "cc_app_chat"],
      ["cc_app_task_run"],
      ["cc_app_both", "cc_app_chat"],
      [],
    ]);
  });
  it("executes a CC handler through the SDK with its persisted caller", async () => {
    const sessionID = await prompt("cc_app_both");
    expect(await messages(sessionID)).toContain(`OWNED:${sessionID}`);
  });
  it("rejects a forged CC task-tool call from chat", async () => {
    expect(await messages(await prompt("cc_app_task_run"))).not.toContain("OWNED:");
  });
  it("resolves native CC calls from a child session to its owning chat", async () => {
    const parent = await host.sessions.create({
      location: { directory },
      permissions: [{ action: "cc_app_*", resource: "*", effect: "allow" }],
    });
    await ownChat(parent.id);
    const child = await host.sessions.create({ location: { directory }, parentID: parent.id });
    await host.sessions.prompt({ sessionID: child.id, text: "CALL:cc_app_both" });
    expect(await messages(child.id)).toContain(`OWNED:${parent.id}`);
  });
  it("waits for operator approval for a native CC tool marked ask", async () => {
    await db.client.db
      .update(agents)
      .set({
        capabilities_json: JSON.stringify({
          appMcpServers: [{ name: "cc_app", enabled: true, action: "ask" }],
        }),
      })
      .where(eq(agents.id, "probe-agent"));
    try {
      const sessionID = await prompt("cc_app_both", "ask");
      await expect
        .poll(async () => (await host.permission.list({ sessionID })).length, { timeout: 10000 })
        .toBe(1);
      const [permission] = await host.permission.list({ sessionID });
      await host.permission.reply({ sessionID, requestID: permission!.id, decision: "once" });
      expect(await messages(sessionID)).toContain(`OWNED:${sessionID}`);
    } finally {
      await db.client.db
        .update(agents)
        .set({
          capabilities_json: JSON.stringify({
            appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
          }),
        })
        .where(eq(agents.id, "probe-agent"));
    }
  });
  it.each([
    [{ pattern: "cc_app_*", action: "ask" }],
    [
      { pattern: "cc_app_both", action: "allow" },
      { pattern: "cc_app_*", action: "ask" },
    ],
  ])("waits before executing a CC tool under wildcard Ask: %j", async (...rules) => {
    const original = await db.client.db.query.agents.findFirst({
      where: eq(agents.id, "probe-agent"),
    });
    await db.client.db
      .update(agents)
      .set({
        capabilities_json: JSON.stringify({
          appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
          appToolPermissions: rules,
        }),
      })
      .where(eq(agents.id, "probe-agent"));
    try {
      const sessionID = await prompt("cc_app_both", "ask");
      await expect
        .poll(async () => (await host.permission.list({ sessionID })).length, { timeout: 10000 })
        .toBe(1);
      expect(
        JSON.stringify((await host.message.list({ sessionID, order: "asc" })).data),
      ).not.toContain(`OWNED:${sessionID}`);
      const [permission] = await host.permission.list({ sessionID });
      await host.permission.reply({ sessionID, requestID: permission!.id, decision: "once" });
      expect(await messages(sessionID)).toContain(`OWNED:${sessionID}`);
    } finally {
      await db.client.db
        .update(agents)
        .set({ capabilities_json: original!.capabilities_json })
        .where(eq(agents.id, "probe-agent"));
    }
  });
  it("supplies the calling session ID to a native tool", async () => {
    const sessionID = await prompt("cc_probe_both");
    expect(await messages(sessionID)).toContain(`\\"sessionID\\":\\"${sessionID}\\"`);
  });
  it("does not execute a native tool forged outside the permitted catalog", async () => {
    expect(await messages(await prompt("cc_probe_task_run", "deny"))).not.toContain(
      "CC_CONTEXT_PROBE_EXECUTED",
    );
  });
  it("reports an existing conflicting MCP integration as unavailable", async () => {
    expect(
      (await createEmbeddedMcpService(host).listMcpStatus(directory))["cc_custom"],
    ).toMatchObject({ status: "failed", error: expect.stringContaining("Rename") });
  });
  it("excludes scripts from MCP tool discovery despite a conflicting integration", async () => {
    expect(
      (await createEmbeddedMcpService(host).listMcpToolIds(directory)).some((id) =>
        id.startsWith("cc_custom_"),
      ),
    ).toBe(false);
  });
  it("rejects connecting a reserved integration", async () => {
    await expect(createEmbeddedMcpService(host).connect(directory, "cc_custom")).rejects.toThrow(
      "reserved",
    );
  });
  it("executes an allowed script with an empty task MCP matrix despite a conflicting integration", async () => {
    const session = await host.sessions.create({
      location: { directory },
      permissions: [{ action: "cc_custom_greeting", resource: "*", effect: "allow" }],
    });
    const now = new Date();
    await db.client.db.insert(tasks).values({
      id: "script-task",
      agent_id: "probe-agent",
      title: "Script",
      description: "Test",
      context: "",
      todos_json: "[]",
      status: "running",
      enabled: true,
      archived: false,
      created_at: now,
      updated_at: now,
    });
    await db.client.db.insert(task_runs).values({
      id: "script-run",
      task_id: "script-task",
      agent_id: "probe-agent",
      opencode_session_id: session.id,
      status: "running",
      trigger_source: "manual",
      rendered_prompt: "Test",
      effective_permissions_json: JSON.stringify({
        customTools: ["greeting"],
        mcpToolPermissions: [],
      }),
      created_at: now,
      updated_at: now,
    });
    try {
      await host.sessions.prompt({ sessionID: session.id, text: "CALL:cc_custom_greeting" });
      expect(await messages(session.id)).toContain("Implement this tool.");
    } finally {
      await db.client.db
        .update(task_runs)
        .set({ status: "completed" })
        .where(eq(task_runs.id, "script-run"));
    }
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
    expect(await messages(await prompt("managed_greet"))).toContain("Managed MCP response");
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
  it("filters MCP discovery with an empty snapshot despite broad auto approval", async () => {
    const session = await host.sessions.create({
      location: { directory },
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        ...mcpSnapshotRules({ mcpToolPermissions: [] }).map((rule) => ({
          action: rule.permission,
          resource: rule.pattern,
          effect: rule.action,
        })),
      ],
    });
    await ownChat(session.id);
    await host.sessions.prompt({ sessionID: session.id, text: "CATALOG:mcp-snapshot-empty" });
    await messages(session.id);
    expect(catalogs.get("mcp-snapshot-empty")).not.toContain("local_greet");
  });
  it("executes an explicitly allowed MCP snapshot tool", async () => {
    const session = await host.sessions.create({
      location: { directory },
      permissions: [
        { action: "*", resource: "*", effect: "allow" },
        ...mcpSnapshotRules({
          mcpToolPermissions: [{ server: "local", tool: "greet", action: "allow" }],
        }).map((rule) => ({
          action: rule.permission,
          resource: rule.pattern,
          effect: rule.action,
        })),
      ],
    });
    await ownChat(session.id);
    await host.sessions.prompt({ sessionID: session.id, text: "CALL:local_greet" });
    expect(await messages(session.id)).toContain("MCP:secret-from-env");
  });
  it("rejects forged task MCP calls even with broad session permission", async () => {
    await host.mcp.connect({ location: { directory }, server: "local" });
    const session = await host.sessions.create({
      location: { directory },
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
    });
    const timestamp = new Date();
    await db.client.db.insert(tasks).values({
      id: "mcp-denied-task",
      agent_id: "probe-agent",
      title: "MCP test",
      description: "",
      context: "",
      todos_json: "[]",
      status: "backlog",
      enabled: true,
      archived: false,
      created_at: timestamp,
      updated_at: timestamp,
    });
    await db.client.db.insert(task_runs).values({
      id: "mcp-denied-run",
      task_id: "mcp-denied-task",
      agent_id: "probe-agent",
      opencode_session_id: session.id,
      status: "running",
      trigger_source: "manual",
      rendered_prompt: "Test",
      effective_permissions_json: JSON.stringify({ mcpToolPermissions: [] }),
      created_at: timestamp,
      updated_at: timestamp,
    });
    try {
      await host.sessions.prompt({ sessionID: session.id, text: "CALL:local_greet" });
      expect(await messages(session.id)).not.toContain("MCP:secret-from-env");
    } finally {
      await db.client.db
        .update(task_runs)
        .set({ status: "completed" })
        .where(eq(task_runs.id, "mcp-denied-run"));
    }
  });
  it.each([
    {
      label: "legacy MCP group grant",
      tool: "local_greet",
      profile: { mcpServers: [{ name: "local", enabled: true, action: "allow" }] },
      allowed: true,
      marker: "MCP:secret-from-env",
    },
    {
      label: "legacy MCP wildcard denial",
      tool: "local_greet",
      profile: {
        mcpServers: [{ name: "local", enabled: true, action: "allow" }],
        toolPermissions: [{ pattern: "local_*", action: "deny" }],
      },
      allowed: false,
      marker: "MCP:secret-from-env",
    },
    {
      label: "legacy CC group grant",
      tool: "cc_app_task_run",
      profile: { appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }] },
      allowed: true,
      marker: "OWNED:",
    },
    {
      label: "legacy CC wildcard denial",
      tool: "cc_app_task_run",
      profile: {
        appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
        appToolPermissions: [{ pattern: "cc_app_*", action: "deny" }],
      },
      allowed: false,
      marker: "OWNED:",
    },
    {
      label: "new CC incomplete matrix",
      tool: "cc_app_task_run",
      profile: {
        snapshotVersion: 1,
        appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
      },
      allowed: false,
      marker: "OWNED:",
    },
    {
      label: "new MCP incomplete matrix",
      tool: "local_greet",
      profile: {
        snapshotVersion: 1,
        mcpServers: [{ name: "local", enabled: true, action: "allow" }],
      },
      allowed: false,
      marker: "MCP:secret-from-env",
    },
  ])("enforces stored $label", async ({ label, tool, profile, allowed, marker }) => {
    const session = await host.sessions.create({
      location: { directory },
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
    });
    const timestamp = new Date();
    await db.client.db.insert(tasks).values({
      id: label,
      agent_id: "probe-agent",
      title: label,
      description: "",
      context: "",
      todos_json: "[]",
      status: "backlog",
      enabled: true,
      archived: false,
      created_at: timestamp,
      updated_at: timestamp,
    });
    await db.client.db.insert(task_runs).values({
      id: label,
      task_id: label,
      agent_id: "probe-agent",
      opencode_session_id: session.id,
      status: "running",
      trigger_source: "manual",
      rendered_prompt: "Test",
      effective_permissions_json: JSON.stringify(profile),
      created_at: timestamp,
      updated_at: timestamp,
    });
    try {
      await host.sessions.prompt({ sessionID: session.id, text: `CALL:${tool}` });
      expect((await messages(session.id)).includes(marker)).toBe(allowed);
    } finally {
      await db.client.db
        .update(task_runs)
        .set({ status: "completed" })
        .where(eq(task_runs.id, label));
    }
  });
  it("uses the task snapshot for a child session", async () => {
    await host.mcp.connect({ location: { directory }, server: "local" });
    const rules = [{ server: "local", tool: "greet", action: "allow" as const }];
    const parent = await host.sessions.create({
      location: { directory },
      permissions: mcpSnapshotRules({ mcpToolPermissions: rules }).map((rule) => ({
        action: rule.permission,
        resource: rule.pattern,
        effect: rule.action,
      })),
    });
    const timestamp = new Date();
    await db.client.db.insert(tasks).values({
      id: "mcp-child-task",
      agent_id: "probe-agent",
      title: "MCP child",
      description: "",
      context: "",
      todos_json: "[]",
      status: "backlog",
      enabled: true,
      archived: false,
      created_at: timestamp,
      updated_at: timestamp,
    });
    await db.client.db.insert(task_runs).values({
      id: "mcp-child-run",
      task_id: "mcp-child-task",
      agent_id: "probe-agent",
      opencode_session_id: parent.id,
      status: "running",
      trigger_source: "manual",
      rendered_prompt: "Test",
      effective_permissions_json: JSON.stringify({ mcpToolPermissions: rules }),
      created_at: timestamp,
      updated_at: timestamp,
    });
    try {
      const child = await host.sessions.create({ location: { directory }, parentID: parent.id });
      await host.sessions.prompt({ sessionID: child.id, text: "CALL:local_greet" });
      expect(await messages(child.id)).toContain("MCP:secret-from-env");
    } finally {
      await db.client.db
        .update(task_runs)
        .set({ status: "completed" })
        .where(eq(task_runs.id, "mcp-child-run"));
    }
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
  for (const allowed of [false, true]) {
    it(`${allowed ? "allows" : "denies"} MCP tools inside Code Mode using the snapshot`, async () => {
      const path = join(directory, "opencode.jsonc");
      const original = await readFile(path, "utf8");
      await writeFile(path, original.replaceAll('"codemode": false', '"codemode": true'));
      await host.reload();
      try {
        await host.model.list({ location: { directory } });
        await host.mcp.connect({ location: { directory }, server: "local" });
        await host.readTools(directory);
        const session = await host.sessions.create({
          location: { directory },
          permissions: [
            { action: "*", resource: "*", effect: "allow" },
            ...mcpSnapshotRules({
              mcpToolPermissions: allowed
                ? [{ server: "local", tool: "greet", action: "allow" }]
                : [],
            }).map((rule) => ({
              action: rule.permission,
              resource: rule.pattern,
              effect: rule.action,
            })),
          ],
        });
        await ownChat(session.id);
        await host.sessions.prompt({ sessionID: session.id, text: "CALL:execute" });
        const result = await messages(session.id);
        if (allowed) expect(result).toContain("MCP:secret-from-env");
        else expect(result).not.toContain("MCP:secret-from-env");
      } finally {
        await writeFile(path, original);
        await host.reload();
      }
    });
  }
});
