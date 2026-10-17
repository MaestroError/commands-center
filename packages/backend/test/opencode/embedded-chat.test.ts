import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import pino from "pino";
import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { chatEventSchema, type ConversationDetail } from "@cc/shared/schemas";

import { agents } from "../../src/db/schema/agents.js";
import { bootstrapRuntimePaths } from "../../src/lib/runtime-paths.js";
import {
  createEmbeddedOpenCodeHost,
  type EmbeddedOpenCodeHost,
} from "../../src/opencode/embedded-host.js";
import { createEmbeddedChatService } from "../../src/opencode/embedded-chat-service.js";
import { createEmbeddedChatEvents } from "../../src/opencode/embedded-chat-events.js";
import {
  createConversationService,
  type ConversationService,
} from "../../src/services/conversation-service.js";
import { resolveSpecialistWorkspacePath } from "../../src/services/specialist-workspace.js";
import { createTestDatabase } from "../helpers/db.js";
import { configureFastifyZod } from "../../src/lib/fastify-zod.js";
import { registerConversationRoutes } from "../../src/routes/conversations.js";
import { registerConversationEventRoutes } from "../../src/routes/conversation-events.js";

import { systemPromptDefinitions } from "../../src/system-prompts/definitions/index.js";
import { createSystemPromptService } from "../../src/system-prompts/system-prompt-service.js";

describe("embedded conversation integration", () => {
  const savedEnv = { ...process.env };
  let database: Awaited<ReturnType<typeof createTestDatabase>>;
  let host: EmbeddedOpenCodeHost;
  let chat: ReturnType<typeof createEmbeddedChatService>;
  let service: ConversationService;
  let directory: string;
  let conversation: ConversationDetail;
  const requests: string[] = [];
  const controllers: AbortController[] = [];
  const provider = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      requests.push(body);
      if (body.includes("FAIL_PROVIDER")) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            error: { message: "Provider test failure", type: "invalid_request_error" },
          }),
        );
        return;
      }
      const resultText = body.includes("## Objective")
        ? "## Objective\n- Say hello\n\n## Requirements\n- (none)\n\n## Decisions\n- (none)\n\n## Work State\n### Completed\n- Greeting\n### Active\n- (none)\n### Blocked\n- (none)\n\n## Next Move\n1. Wait\n\n## Relevant Files\n- (none)\n\n## Important Context\n- (none)"
        : "Hello from embedded CC";
      const input = JSON.parse(body) as { stream?: boolean; messages?: { role?: string }[] };
      if (
        body.includes("ASK_QUESTION") &&
        !input.messages?.some((message) => message.role === "tool")
      ) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "question-call", type: "function", function: { name: "question", arguments: JSON.stringify({ questions: [{ header: "Choice", question: "Choose one", options: [{ label: "Yes", description: "Proceed" }] }] }) } }] }, finish_reason: "tool_calls" }] })}\n\ndata: [DONE]\n\n`,
        );
        return;
      }
      if (!input.stream) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: "test",
            object: "chat.completion",
            created: 1,
            model: "test",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: resultText },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
        );
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (text: string, finish: string | null): string =>
        `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta: { content: text }, finish_reason: finish }] })}\n\n`;
      response.write(chunk(resultText.slice(0, 6), null));
      if (body.includes("HOLD_PROVIDER")) return;
      response.end(`${chunk(resultText.slice(6), "stop")}data: [DONE]\n\n`);
    });
  });

  beforeAll(async () => {
    database = await createTestDatabase();
    await bootstrapRuntimePaths(database.config);
    directory = resolveSpecialistWorkspacePath({
      config: database.config,
      slug: "chat-test",
      status: "active",
    });
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "AGENTS.md"), "SPECIALIST_INSTRUCTIONS_MARKER");
    process.env["OPENCODE_TEST_HOME"] = database.cwd;
    await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
    const address = provider.address();
    if (!address || typeof address === "string") throw new Error("Missing provider port");
    const configDirectory = join(
      database.config.paths.workspaceDir,
      ".cc",
      "opencode-v2",
      "config",
      "opencode",
    );
    await mkdir(configDirectory, { recursive: true });
    await writeFile(
      join(configDirectory, "opencode.json"),
      JSON.stringify({
        model: "test/test",
        commands: { hello: { template: "Say hello to $ARGUMENTS" } },
        providers: {
          test: {
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: `http://127.0.0.1:${address.port}/v1`, apiKey: "test-only" },
            models: { test: { variants: [{ id: "high", body: { reasoning_effort: "high" } }] } },
          },
        },
      }),
    );
    host = await createEmbeddedOpenCodeHost({
      workspaceDirectory: database.config.paths.workspaceDir,
      sdkOptions: { models: { fetch: false }, fs: { fff: false, filewatcher: false } },
    });
    chat = createEmbeddedChatService(host);
    service = createConversationService({
      db: database.client.db,
      config: database.config,
      opencodeService: chat,
    });
    await database.client.db.insert(agents).values({
      id: "specialist",
      slug: "chat-test",
      name: "Chat Test",
      role: "Testing",
      instructions: "COMPOSED_INSTRUCTIONS_MARKER",
      default_model: "test/test",
      status: "active",
      capabilities_json: "{}",
      created_at: new Date(),
      updated_at: new Date(),
    });
  }, 30000);

  beforeEach(async () => {
    conversation = (await service.startFresh("specialist")).current;
    requests.length = 0;
  });

  afterAll(async () => {
    controllers.forEach((controller) => controller.abort());
    service?.dispose();
    await host?.close();
    provider.closeAllConnections();
    await new Promise<void>((resolve) => provider.close(() => resolve()));
    await database?.cleanup();
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  });

  it("persists a completed chat response in CC", async () => {
    const result = await service.sendPrompt(conversation.id, {
      text: "Say hello",
      attachments: [],
    });
    expect(result.messages.find((message) => message.role === "assistant")?.content).toBe(
      "Hello from embedded CC",
    );
  });

  it("sends the composed CC instructions to the provider", async () => {
    await service.sendPrompt(conversation.id, { text: "Say hello", attachments: [] });
    expect(requests.join()).toContain("COMPOSED_INSTRUCTIONS_MARKER");
  });

  it.each(systemPromptDefinitions.filter((definition) => definition.scope !== "task"))(
    "delivers customized $id instructions to the provider",
    async (definition) => {
      const prompts = createSystemPromptService({ config: database.config });
      const marker = `AUDIT_${definition.id}`;
      await prompts.saveBody(definition.id, marker);
      await database.client.db
        .update(agents)
        .set({
          capabilities_json: JSON.stringify({
            appMcpServers: [
              "cc_app",
              "cc_specialist_management",
              "cc_tasks_management",
              "cc_notifications",
            ].map((name) => ({ name, enabled: true, action: "allow" })),
          }),
        })
        .where(eq(agents.id, "specialist"));
      try {
        await service.sendPrompt(conversation.id, { text: "Audit instructions", attachments: [] });
        const payload = JSON.parse(requests.at(-1)!) as {
          messages: { role: string; content: unknown }[];
        };
        expect(
          JSON.stringify(payload.messages.filter((message) => message.role === "system")),
        ).toContain(marker);
      } finally {
        await prompts.resetBody(definition.id);
        await database.client.db
          .update(agents)
          .set({ capabilities_json: "{}" })
          .where(eq(agents.id, "specialist"));
      }
    },
  );

  it("delivers specialist AGENTS.md rules to the provider", async () => {
    await service.sendPrompt(conversation.id, { text: "Audit rules", attachments: [] });
    expect(requests.join()).toContain("SPECIALIST_INSTRUCTIONS_MARKER");
  });

  it("records prompt instruction snapshots", async () => {
    const result = await service.sendPrompt(conversation.id, {
      text: "Say hello",
      attachments: [],
    });
    expect(
      result.messages.find((message) => message.role === "user")?.systemPromptSnapshot?.length,
    ).toBeGreaterThan(0);
  });

  it("maps uploaded text files to sanitized CC attachments", async () => {
    const result = await service.sendPrompt(conversation.id, {
      text: "Read this file",
      attachments: [
        {
          id: "upload",
          filename: "note.txt",
          mimeType: "text/plain",
          type: "file",
          sizeBytes: 4,
          dataUrl: "data:text/plain;base64,bm90ZQ==",
        },
      ],
    });
    const attachment = result.messages.find((message) => message.role === "user")?.attachments[0];
    expect(attachment).toMatchObject({ filename: "note.txt", mimeType: "text/plain" });
    expect(JSON.stringify(result)).not.toContain("bm90ZQ==");
  });

  it("emits valid incremental chat events", async () => {
    const controller = new AbortController();
    controllers.push(controller);
    const ready = Promise.withResolvers<void>();
    const events: unknown[] = [];
    createEmbeddedChatEvents({ host, chat, logger: pino({ level: "silent" }) }).subscribe({
      directory,
      sessionID: conversation.opencodeSessionId,
      signal: controller.signal,
      onReady: ready.resolve,
      onEvent: (event) => events.push(event),
    });
    await ready.promise;
    await service.sendPromptAsync(conversation.id, { text: "Stream hello", attachments: [] });
    await host.sessions.wait({ sessionID: conversation.opencodeSessionId });
    await vi.waitFor(() =>
      expect(
        events.some((event) => chatEventSchema.parse(event).type === "message.part.delta"),
      ).toBe(true),
    );
    expect(events.every((event) => chatEventSchema.safeParse(event).success)).toBe(true);
    controller.abort();
  });

  it("lists a running session as busy for the chat watchdog", async () => {
    try {
      await service.sendPromptAsync(conversation.id, { text: "HOLD_PROVIDER", attachments: [] });
      await expect
        .poll(
          async () => (await chat.listSessionStatuses(directory))[conversation.opencodeSessionId],
        )
        .toEqual({ type: "busy" });
    } finally {
      await chat.abortSession(directory, conversation.opencodeSessionId);
      await host.sessions.wait({ sessionID: conversation.opencodeSessionId });
    }
  });

  it("omits inactive sessions from the watchdog status list", async () => {
    await service.sendPrompt(conversation.id, { text: "Hello", attachments: [] });
    await host.sessions.wait({ sessionID: conversation.opencodeSessionId });
    expect(
      (await chat.listSessionStatuses(directory))[conversation.opencodeSessionId],
    ).toBeUndefined();
  });

  it("excludes another specialist's running session from watchdog statuses", async () => {
    try {
      await service.sendPromptAsync(conversation.id, { text: "HOLD_PROVIDER", attachments: [] });
      await expect
        .poll(
          async () => (await chat.listSessionStatuses(directory))[conversation.opencodeSessionId],
        )
        .toEqual({ type: "busy" });
      expect(await chat.listSessionStatuses(database.cwd)).toEqual({});
    } finally {
      await chat.abortSession(directory, conversation.opencodeSessionId);
      await host.sessions.wait({ sessionID: conversation.opencodeSessionId });
    }
  });

  it("interrupts a held provider stream", async () => {
    await service.sendPromptAsync(conversation.id, { text: "HOLD_PROVIDER", attachments: [] });
    await vi.waitFor(() =>
      expect(requests.some((request) => request.includes("HOLD_PROVIDER"))).toBe(true),
    );
    await vi.waitFor(async () =>
      expect(
        (await chat.listSessionMessages(directory, conversation.opencodeSessionId)).some(
          (message) => message.info.role === "assistant",
        ),
      ).toBe(true),
    );
    await chat.abortSession(directory, conversation.opencodeSessionId);
    await host.sessions.wait({ sessionID: conversation.opencodeSessionId });
    expect(await chat.getSessionStatus(directory, conversation.opencodeSessionId)).toEqual({
      type: "unknown",
    });
    expect(
      (await chat.listSessionMessages(directory, conversation.opencodeSessionId)).at(-1)?.parts,
    ).toContainEqual(expect.objectContaining({ type: "step-finish", reason: "interrupted" }));
  });

  it("rejects cross-specialist session access", async () => {
    await expect(chat.getSession(database.cwd, conversation.opencodeSessionId)).rejects.toThrow(
      "specialist workspace",
    );
  });

  it("marks a missing session as a rejected prompt", async () => {
    await chat.deleteSession(directory, conversation.opencodeSessionId);
    await expect(
      chat.promptSessionAsync({
        directory,
        sessionID: conversation.opencodeSessionId,
        agent: "build",
        model: { providerID: "test", modelID: "test" },
        text: "Hello",
      }),
    ).rejects.toMatchObject({ name: "OpenCodeRequestError", status: 404 });
  });

  it("replaces the composed instructions on the next prompt", async () => {
    const input = {
      directory,
      sessionID: conversation.opencodeSessionId,
      agent: "build",
      model: { providerID: "test", modelID: "test" },
      text: "Hello",
    };
    await chat.promptSession({ ...input, system: "FIRST_INSTRUCTIONS" });
    await chat.promptSession({ ...input, system: "SECOND_INSTRUCTIONS" });
    expect(
      await host.sessions.instructions.entry.list({ sessionID: conversation.opencodeSessionId }),
    ).toEqual([{ key: "cc-system", value: "SECOND_INSTRUCTIONS" }]);
  });

  it("removes a disabled composed instruction entry", async () => {
    const input = {
      directory,
      sessionID: conversation.opencodeSessionId,
      agent: "build",
      model: { providerID: "test", modelID: "test" },
      text: "Hello",
    };
    await chat.promptSession({ ...input, system: "TEMPORARY_INSTRUCTIONS" });
    await chat.promptSession(input);
    expect(
      await host.sessions.instructions.entry.list({ sessionID: conversation.opencodeSessionId }),
    ).toEqual([]);
  });

  it("lists pending permissions from descendant sessions", async () => {
    const child = await host.sessions.create({
      location: { directory },
      parentID: conversation.opencodeSessionId,
      permissions: [{ action: "shell", resource: "*", effect: "ask" }],
    });
    await host.permission.create({
      sessionID: child.id,
      action: "shell",
      resources: ["echo test"],
    });
    const pending = await service.listPendingInteractions(conversation.id);
    expect(pending.permissions.map((permission) => permission.sessionID)).toContain(child.id);
  });

  it("replies to a question form through CC", async () => {
    const form = await host.sessions.form.create({
      sessionID: conversation.opencodeSessionId,
      title: "Question",
      metadata: { kind: "question" },
      fields: [
        {
          key: "q0",
          type: "string",
          title: "Choose",
          description: "Choose a value",
          options: [{ value: "internal", label: "Visible" }],
          custom: true,
        },
      ],
    });
    await service.replyQuestion(conversation.id, form.id, [["Visible"]]);
    expect(await host.sessions.form.list({ sessionID: conversation.opencodeSessionId })).toEqual(
      [],
    );
  });

  it("returns not found for a stale question", async () => {
    await expect(chat.replyQuestion(directory, "missing", [["answer"]])).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("accepts an operator permission reply", async () => {
    await host.sessions.update({
      sessionID: conversation.opencodeSessionId,
      permissions: [{ action: "shell", resource: "*", effect: "ask" }],
    });
    const request = await host.permission.create({
      sessionID: conversation.opencodeSessionId,
      action: "shell",
      resources: ["echo test"],
    });
    await service.replyPermission(conversation.id, request.id, "once");
    expect(await host.permission.list({ sessionID: conversation.opencodeSessionId })).toEqual([]);
  });

  it("rejects replying to another conversation's permission", async () => {
    const other = await host.sessions.create({
      location: { directory },
      permissions: [{ action: "shell", resource: "*", effect: "ask" }],
    });
    const request = await host.permission.create({
      sessionID: other.id,
      action: "shell",
      resources: ["echo test"],
    });
    await expect(
      service.replyPermission(conversation.id, request.id, "once"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects a pending question through CC", async () => {
    const form = await host.sessions.form.create({
      sessionID: conversation.opencodeSessionId,
      title: "Question",
      metadata: { kind: "question" },
      fields: [{ key: "q0", type: "string", title: "Question" }],
    });
    await service.rejectQuestion(conversation.id, form.id);
    expect(await host.sessions.form.list({ sessionID: conversation.opencodeSessionId })).toEqual(
      [],
    );
  });

  it("preserves previous conversations when starting fresh", async () => {
    const fresh = await service.startFresh("specialist");
    expect(fresh.previous.map((item) => item.id)).toContain(conversation.id);
  });

  it("sends the selected tier through the embedded SDK to the provider", async () => {
    await service.sendPrompt(conversation.id, {
      text: "Tier probe",
      model: "test/test#high",
      attachments: [],
    });
    expect(JSON.parse(requests.at(-1) ?? "{}")).toMatchObject({ reasoning_effort: "high" });
  });

  it("clears the previous tier when returning to the default", async () => {
    await service.sendPrompt(conversation.id, {
      text: "Tier probe",
      model: "test/test#high",
      attachments: [],
    });
    await service.sendPrompt(conversation.id, {
      text: "Default probe",
      model: "test/test",
      attachments: [],
    });
    expect(JSON.parse(requests.at(-1) ?? "{}")).not.toHaveProperty("reasoning_effort");
  });

  it("finds the selected provider model", async () => {
    const providers = await chat.listProviders(directory);
    expect(providers.all.find((provider) => provider.id === "test")?.models).toHaveProperty("test");
  });

  it("executes a configured chat command", async () => {
    const result = await service.sendCommand(conversation.id, {
      command: "hello",
      arguments: "CC",
      attachments: [],
    });
    expect(result.messages.find((message) => message.role === "assistant")?.content).toBe(
      "Hello from embedded CC",
    );
  });

  it("returns shell output through the conversation service", async () => {
    const result = await service.sendShell(conversation.id, { command: "printf cc-shell-result" });
    expect(result.messages.flatMap((message) => message.parts)).toContainEqual(
      expect.objectContaining({
        type: "tool",
        state: expect.objectContaining({ status: "completed", output: "cc-shell-result" }),
      }),
    );
  });

  it("compacts a completed conversation", async () => {
    await service.sendPrompt(conversation.id, { text: "Say hello", attachments: [] });
    const result = await service.summarize(conversation.id);
    expect(result.messages.some((message) => message.content.includes("## Objective"))).toBe(true);
  });

  it("surfaces a provider failure in the saved chat", async () => {
    const result = await service.sendPrompt(conversation.id, {
      text: "FAIL_PROVIDER",
      attachments: [],
    });
    expect(result.messages.find((message) => message.error)?.error?.message).toContain(
      "Provider test failure",
    );
  });

  it("serves completed chat through the existing HTTP route", async () => {
    const server = Fastify({ loggerInstance: pino({ level: "silent" }) });
    configureFastifyZod(server);
    registerConversationRoutes(server, {
      config: database.config,
      database: database.client,
      logger: pino({ level: "silent" }),
      opencodeService: chat,
    });
    try {
      const response = await server.inject({
        method: "POST",
        url: `/api/conversations/${conversation.id}/prompt`,
        payload: { text: "Hello from HTTP" },
      });
      expect(response.statusCode).toBe(200);
      expect(
        response.json<ConversationDetail>().messages.find((message) => message.role === "assistant")
          ?.content,
      ).toBe("Hello from embedded CC");
    } finally {
      await server.close();
    }
  });

  it("announces readiness again after a stream failure", async () => {
    const controller = new AbortController();
    controllers.push(controller);
    let attempts = 0;
    let readyCount = 0;
    const interruptedHost: EmbeddedOpenCodeHost = {
      ...host,
      events: {
        subscribe(requestOptions) {
          const stream = host.events.subscribe(requestOptions);
          attempts += 1;
          if (attempts !== 1) return stream;
          return (async function* () {
            for await (const event of stream) {
              yield event;
              throw new Error("Test transport interruption");
            }
          })();
        },
      },
    };
    createEmbeddedChatEvents({
      host: interruptedHost,
      chat,
      logger: pino({ level: "silent" }),
    }).subscribe({
      directory,
      sessionID: conversation.opencodeSessionId,
      signal: controller.signal,
      onReady: () => {
        readyCount += 1;
      },
      onEvent: () => {},
    });
    await vi.waitFor(() => expect(readyCount).toBe(2), { timeout: 3000 });
    controller.abort();
  });

  it("streams chat through the existing HTTP event route", async () => {
    const logger = pino({ level: "silent" });
    const server = Fastify({ loggerInstance: logger });
    configureFastifyZod(server);
    const context = {
      config: database.config,
      database: database.client,
      logger,
      opencodeService: chat,
      openCodeEventService: createEmbeddedChatEvents({ host, chat, logger }),
    };
    registerConversationRoutes(server, context);
    registerConversationEventRoutes(server, context);
    const controller = new AbortController();
    controllers.push(controller);
    try {
      const baseURL = await server.listen({ host: "127.0.0.1", port: 0 });
      const response = await fetch(`${baseURL}/api/conversations/${conversation.id}/events`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      });
      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
      if (!reader) throw new Error("Missing SSE body");
      const accepted = await server.inject({
        method: "POST",
        url: `/api/conversations/${conversation.id}/prompt?stream=true`,
        payload: { text: "Hello over SSE" },
      });
      expect(accepted.statusCode).toBe(202);
      let received = "";
      while (!received.includes('"message.part.delta"')) {
        const chunk = await reader.read();
        if (chunk.done) break;
        received += chunk.value;
      }
      expect(received).toContain('"message.part.delta"');
      await reader.cancel();
      await host.sessions.wait({ sessionID: conversation.opencodeSessionId });
    } finally {
      controller.abort();
      await server.close();
    }
  });

  it("removes a session from the embedded host", async () => {
    await chat.deleteSession(directory, conversation.opencodeSessionId);
    await expect(
      host.sessions.get({ sessionID: conversation.opencodeSessionId }),
    ).rejects.toMatchObject({ name: "SessionNotFoundError" });
  });

  it("continues generation after an operator answers a model-generated question", async () => {
    await host.sessions.update({
      sessionID: conversation.opencodeSessionId,
      permissions: [{ action: "question", resource: "*", effect: "allow" }],
    });
    await service.sendPromptAsync(conversation.id, { text: "ASK_QUESTION", attachments: [] });
    let questionID = "";
    await vi.waitFor(
      async () => {
        const pending = await service.listPendingInteractions(conversation.id);
        questionID = pending.question?.id ?? "";
        expect(questionID).not.toBe("");
      },
      { timeout: 3000 },
    );
    await service.replyQuestion(conversation.id, questionID, [["Yes"]]);
    await host.sessions.wait({ sessionID: conversation.opencodeSessionId });
    const result = await service.get("specialist", conversation.id);
    expect(result.messages.some((message) => message.content === "Hello from embedded CC")).toBe(
      true,
    );
  });

  it("resumes CC chat history after reopening the embedded host", async () => {
    await service.sendPrompt(conversation.id, { text: "Remember this greeting", attachments: [] });
    service.dispose();
    await host.close();
    host = await createEmbeddedOpenCodeHost({
      workspaceDirectory: database.config.paths.workspaceDir,
      sdkOptions: { models: { fetch: false }, fs: { fff: false, filewatcher: false } },
    });
    chat = createEmbeddedChatService(host);
    service = createConversationService({
      db: database.client.db,
      config: database.config,
      opencodeService: chat,
    });
    const restored = await service.get("specialist", conversation.id);
    expect(restored.messages.find((message) => message.role === "assistant")?.content).toBe(
      "Hello from embedded CC",
    );
  });
});
