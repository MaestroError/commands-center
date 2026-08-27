import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppDb } from "../../src/db/client";
import { conversations } from "../../src/db/schema/index";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createLiveRequestService } from "../../src/services/live-request-service";
import { createLogger } from "../../src/lib/logger";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createServer } from "../../src/server";
import { createSpecialistService } from "../../src/services/specialist-service";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import type { RuntimeContext } from "../../src/lib/start-server-runtime";
import { createTestDatabase } from "../helpers/db";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

function orchestrator(): OpenCodeOrchestrator {
  return {
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://localhost:4100",
      workspaceDir: "/test",
      restartCount: 0,
      maxRestarts: 3,
    }),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    refreshHealth: vi.fn().mockResolvedValue(true),
  };
}

function opencodeService(): OpenCodeService {
  return {
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
    listProviders: vi.fn(() => Promise.resolve({ all: [], default: {}, connected: [] })),
    listMcpStatus: vi.fn(() => Promise.resolve({})),
    listMcpToolIds: vi.fn(() => Promise.resolve([])),
  } as unknown as OpenCodeService;
}

async function bootServer(
  testDb: Awaited<ReturnType<typeof createTestDatabase>>,
  extra: Partial<RuntimeContext>,
) {
  const server = await createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    orchestrator: orchestrator(),
    opencodeService: opencodeService(),
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    scheduler: createSchedulerService(),
    ...extra,
  });
  await server.listen({ host: "127.0.0.1", port: 0 });
  const port = (server.server.address() as AddressInfo).port;
  disposers.push(async () => {
    await server.close();
  });
  return port;
}

async function readFirstEvent(url: string): Promise<string> {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: { Accept: "text/event-stream" },
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const { value } = (await reader.read()) as { value: Uint8Array | undefined };
  controller.abort();
  reader.cancel().catch(() => {});
  return decoder.decode(value ?? new Uint8Array());
}

async function readUntilText(url: string, expected: string): Promise<string> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    const response = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (!response.body) {
      throw new Error("SSE response has no body.");
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let content = "";

    while (!content.includes(expected)) {
      const { done, value } = await reader.read();
      if (done) {
        throw new Error(`SSE stream ended before emitting ${expected}.`);
      }
      content += decoder.decode(value, { stream: true });
    }

    return content;
  } catch (error) {
    if (timedOut) {
      throw new Error(`Timed out waiting for SSE text: ${expected}.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await reader?.cancel().catch(() => {});
  }
}

describe("server-sent event routes", () => {
  it("streams workspace watch events for a specialist", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: opencodeService(),
    });
    const agent = await agentService.create({
      name: "Watched",
      role: "be watched",
      instructions: "Exist.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });

    const workspaceWatchService = {
      subscribe: vi.fn((opts: { onChange: (event: unknown) => void }) => {
        queueMicrotask(() =>
          opts.onChange({ type: "workspace.changed", properties: { path: "notes.md" } }),
        );
      }),
      dispose: vi.fn(),
    };

    const port = await bootServer(testDb, {
      workspaceWatchService: workspaceWatchService as never,
    });

    const chunk = await readFirstEvent(
      `http://127.0.0.1:${port}/api/specialists/${agent.id}/workspace/events`,
    );
    expect(chunk).toContain("data:");
    expect(chunk).toContain("workspace.changed");
    expect(workspaceWatchService.subscribe).toHaveBeenCalled();
  });

  it("emits connected before synchronous conversation source events", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: opencodeService(),
    });
    const agent = await agentService.create({
      name: "Connected",
      role: "chat",
      instructions: "Exist.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });
    const conversationId = await insertConversation(testDb.client.db, agent.id);
    const openCodeEventService = {
      subscribe: vi.fn((opts: { onEvent: (event: unknown) => void }) => {
        opts.onEvent({ type: "message.updated", properties: { sessionID: "s" } });
      }),
    };
    const port = await bootServer(testDb, {
      openCodeEventService: openCodeEventService as never,
    });

    const chunk = await readUntilText(
      `http://127.0.0.1:${port}/api/conversations/${conversationId}/events`,
      "message.updated",
    );

    expect(chunk.indexOf('"type":"connected"')).toBeLessThan(
      chunk.indexOf('"type":"message.updated"'),
    );
  });

  it("streams opencode and live-request events for a conversation", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: opencodeService(),
    });
    const agent = await agentService.create({
      name: "Chatter",
      role: "chat",
      instructions: "Exist.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });
    const conversationId = await insertConversation(testDb.client.db, agent.id);

    const openCodeEventService = {
      subscribe: vi.fn((opts: { onEvent: (event: unknown) => void }) => {
        queueMicrotask(() =>
          opts.onEvent({ type: "message.updated", properties: { sessionID: "s" } }),
        );
      }),
    };
    const liveRequestService = {
      subscribe: vi.fn(),
      listByConversation: vi.fn(() => []),
      dispose: vi.fn(),
    };

    const port = await bootServer(testDb, {
      openCodeEventService: openCodeEventService as never,
      liveRequestService: liveRequestService as never,
    });

    const chunk = await readUntilText(
      `http://127.0.0.1:${port}/api/conversations/${conversationId}/events`,
      "message.updated",
    );
    expect(chunk).toContain("message.updated");
    expect(liveRequestService.subscribe).toHaveBeenCalled();
  });

  it("replays a chat watchdog error after reconnect", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: opencodeService(),
    });
    const agent = await agentService.create({
      name: "Stalled",
      role: "chat",
      instructions: "Exist.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });
    const conversationId = await insertConversation(testDb.client.db, agent.id);
    const interactiveChatWatchdogService = {
      subscribe: vi.fn(),
      getError: vi.fn(() => ({
        type: "session.error",
        properties: {
          sessionID: "session-root",
          error: {
            name: "ChatNoProgressError",
            message: "Response stopped automatically.",
            data: { noProgressMs: 1_800_000 },
          },
        },
      })),
    };
    const port = await bootServer(testDb, {
      interactiveChatWatchdogService: interactiveChatWatchdogService as never,
    });

    const chunk = await readUntilText(
      `http://127.0.0.1:${port}/api/conversations/${conversationId}/events`,
      "ChatNoProgressError",
    );

    expect(chunk.indexOf('"type":"connected"')).toBeLessThan(
      chunk.indexOf('"name":"ChatNoProgressError"'),
    );
    expect(interactiveChatWatchdogService.subscribe).toHaveBeenCalled();
  });

  // A live request is published once, to whoever is subscribed at that instant.
  // A stream that connects afterwards — first load, or any reconnect — would
  // otherwise never learn about an open form, leaving the operator on a chat with
  // no review tab while the specialist blocks on it.
  it("replays already-open live requests to a stream that connects later", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService: opencodeService(),
    });
    const agent = await agentService.create({
      name: "Reviewer",
      role: "chat",
      instructions: "Exist.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {},
    });
    const conversationId = await insertConversation(testDb.client.db, agent.id);
    const liveRequestService = createLiveRequestService();
    disposers.push(() => {
      liveRequestService.dispose();
      return Promise.resolve();
    });
    const port = await bootServer(testDb, { liveRequestService });

    // Opened with nobody listening. The promise stays pending, as it does while
    // the specialist waits for the operator.
    void liveRequestService
      .create({
        conversationId,
        kind: "self_task_template_create_review",
        closable: false,
        presentation: { title: "Review task template", cancelLabel: "Cancel" },
        fields: [],
      })
      .catch(() => {});

    const chunk = await readUntilText(
      `http://127.0.0.1:${port}/api/conversations/${conversationId}/events`,
      "cc.live_request.opened",
    );

    expect(chunk).toContain("Review task template");
  });
});

async function insertConversation(db: AppDb, agentId: string): Promise<string> {
  const id = `conv-${randomUUID()}`;
  const timestamp = new Date();
  await db.insert(conversations).values({
    id,
    agent_id: agentId,
    opencode_session_id: `session-${id}`,
    title: null,
    status: "active",
    source: "chat",
    is_current: true,
    task_run_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  return id;
}
