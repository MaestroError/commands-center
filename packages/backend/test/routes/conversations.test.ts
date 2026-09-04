import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSpecialistService } from "../../src/services/specialist-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createApiTokenService } from "../../src/services/api-token-service";
import { createLiveRequestService } from "../../src/services/live-request-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService, OpenCodeSessionMessage } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("conversation routes", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let server: Awaited<ReturnType<typeof createServer>>;
  let agentId: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    const agent = await agentService.create({
      name: "Route Specialist",
      role: "help with routes",
      instructions: "Be useful.",
      defaultModel: "openai/gpt-4.1",
      capabilities: {
        builtInSkills: [],
        customTools: [],
        mcpServers: [],
        toolPermissions: [],
      },
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await server.close();
    await testDb.cleanup();
  });

  it("resolves the active conversation for an agent", async () => {
    const response = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations/active`,
    });

    expect(response.statusCode).toBe(200);
    const snapshot = response.json<{ current: { id: string }; previous: unknown[] }>();
    expect(snapshot.current.id).toBeDefined();
    expect(snapshot.previous).toEqual([]);
  });

  it("registers a file artifact for the exact conversation", async () => {
    const first = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations/active`,
    });
    const firstConversationId = first.json<{ current: { id: string } }>().current.id;
    const fresh = await server.inject({
      method: "POST",
      url: `/api/specialists/${agentId}/conversations/start-fresh`,
    });
    const secondConversationId = fresh.json<{ current: { id: string } }>().current.id;

    const response = await server.inject({
      method: "POST",
      url: `/api/conversations/${firstConversationId}/artifacts`,
      payload: { title: "Report", type: "file", link: "reports/result.md" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      conversationId: firstConversationId,
      title: "Report",
      type: "file",
      link: "reports/result.md",
      shareLinks: [],
    });

    const firstList = await server.inject({
      method: "GET",
      url: `/api/conversations/${firstConversationId}/artifacts`,
    });
    const secondList = await server.inject({
      method: "GET",
      url: `/api/conversations/${secondConversationId}/artifacts`,
    });
    expect(firstList.json<{ artifacts: unknown[] }>().artifacts).toHaveLength(1);
    expect(secondList.json<{ artifacts: unknown[] }>().artifacts).toEqual([]);
  });

  it("rejects artifact registration for a missing conversation", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/conversations/missing/artifacts",
      payload: { title: "Report", type: "file", link: "reports/result.md" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("rejects invalid artifact registration input", async () => {
    const opened = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations/active`,
    });
    const conversationId = opened.json<{ current: { id: string } }>().current.id;

    const response = await server.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/artifacts`,
      payload: { title: "", type: "file", link: "" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("persists prompt request and response in the session", async () => {
    const opened = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations/active`,
    });
    const conversationId = opened.json<{ current: { id: string } }>().current.id;

    const response = await server.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/prompt`,
      payload: { text: "Explain the plan", attachments: [] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ messages: unknown[] }>().messages).toHaveLength(2);
  });

  it("restores streamed prompt messages after reloading a specific conversation", async () => {
    const opened = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations/active`,
    });
    const conversationId = opened.json<{ current: { id: string } }>().current.id;

    const promptResponse = await server.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/prompt?stream=true`,
      payload: { text: "Persist streamed prompt", attachments: [] },
    });

    expect(promptResponse.statusCode).toBe(202);

    const reloaded = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations/${conversationId}`,
    });

    expect(reloaded.statusCode).toBe(200);
    expect(
      reloaded
        .json<{ messages: Array<{ role: string; content: string }> }>()
        .messages.map((msg) => ({ role: msg.role, content: msg.content })),
    ).toEqual([
      { role: "user", content: "Persist streamed prompt" },
      { role: "assistant", content: "Reply to: Persist streamed prompt" },
    ]);
  });

  it("returns actionable details when a streamed prompt model is unavailable", async () => {
    const active = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations/active`,
    });
    const conversationId = active.json<{ current: { id: string } }>().current.id;

    const response = await server.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/prompt?stream=true`,
      payload: { text: "Use missing provider model", attachments: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "bad_request",
        message:
          "Model not found: openai/gpt-5.6-terra-fast. Re-save the specialist's model configuration or restart the OpenCode instance, then try again.",
        details: {
          errorName: "ProviderModelNotFoundError",
          attemptedModel: "openai/gpt-5.6-terra-fast",
          modelID: "gpt-5.6-terra-fast",
          originalMessage: "Model not found: openai/gpt-5.6-terra-fast.",
          providerID: "openai",
        },
      },
    });
  });

  it("returns session media from message parts and tool attachments", async () => {
    const opened = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations/active`,
    });
    const conversationId = opened.json<{ current: { id: string } }>().current.id;

    const promptResponse = await server.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/prompt`,
      payload: { text: "Explain the plan", attachments: [] },
    });

    expect(promptResponse.statusCode).toBe(200);

    const response = await server.inject({
      method: "GET",
      url: `/api/conversations/${conversationId}/media`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    expect(response.json()[0]).toMatchObject({
      id: "tool-attachment-1",
      filename: "notes.pdf",
      mime: "application/pdf",
      url: "data:application/pdf;base64,BBBB",
    });
    expect(response.json()[1]).toMatchObject({
      id: "file-1",
      filename: "plan.png",
      mime: "image/png",
      url: "data:image/png;base64,AAAA",
    });
  });

  it("lists all conversations for an agent", async () => {
    const response = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<unknown[]>().length).toBeGreaterThanOrEqual(1);
  });

  it("start-fresh creates a new session and preserves the previous one", async () => {
    const before = await server.inject({
      method: "GET",
      url: `/api/specialists/${agentId}/conversations/active`,
    });
    const previousId = before.json<{ current: { id: string } }>().current.id;

    const response = await server.inject({
      method: "POST",
      url: `/api/specialists/${agentId}/conversations/start-fresh`,
    });

    expect(response.statusCode).toBe(201);
    const snapshot = response.json<{ current: { id: string }; previous: Array<{ id: string }> }>();
    expect(snapshot.current.id).not.toBe(previousId);
    expect(snapshot.previous.some((c) => c.id === previousId)).toBe(true);
  });
});

describe("conversation pending-interactions route", () => {
  it("rehydrates pending permissions, question, and live requests scoped to the conversation", async () => {
    const testDb = await createTestDatabase();
    const liveRequestService = createLiveRequestService();
    const opencodeService = createMockOpenCodeService();
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      liveRequestService,
      scheduler: createSchedulerService(),
    });

    try {
      const agent = await agentService.create({
        name: "Pending Specialist",
        role: "wait on the user",
        instructions: "Be useful.",
        defaultModel: "openai/gpt-4.1",
        capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
      });

      const opened = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}/conversations/active`,
      });
      const { id: conversationId, opencodeSessionId: sessionID } = opened.json<{
        current: { id: string; opencodeSessionId: string };
      }>().current;

      opencodeService.listPendingPermissions = () =>
        Promise.resolve([
          {
            id: "perm-1",
            sessionID,
            permission: "bash",
            patterns: ["rm *"],
            always: [],
            metadata: {},
            tool: { messageID: "msg-1", callID: "call-1" },
          },
          {
            id: "perm-other",
            sessionID: "other-session",
            permission: "bash",
            patterns: [],
            always: [],
            metadata: {},
          },
        ]);
      opencodeService.listPendingQuestions = () =>
        Promise.resolve([
          {
            id: "q-1",
            sessionID,
            questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
          },
        ]);

      const pendingLiveRequest = liveRequestService.create({
        conversationId,
        kind: "add_secret",
        closable: false,
        presentation: { title: "Add secret", cancelLabel: "Cancel" },
        fields: [],
      });
      void pendingLiveRequest.catch(() => {});

      const response = await server.inject({
        method: "GET",
        url: `/api/conversations/${conversationId}/pending-interactions`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        permissions: Array<{ id: string }>;
        question: { id: string } | null;
        liveRequests: Array<{ presentation: { title: string } }>;
      }>();
      expect(body.permissions).toEqual([
        expect.objectContaining({ id: "perm-1", sessionID, permission: "bash" }),
      ]);
      expect(body.question).toMatchObject({ id: "q-1" });
      expect(body.liveRequests).toHaveLength(1);
      expect(body.liveRequests[0]?.presentation.title).toBe("Add secret");
    } finally {
      liveRequestService.dispose();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns an empty live-request list when no live request service is configured", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      apiTokenService: createApiTokenService({ db: testDb.client.db }),
      orchestrator: createOrchestrator(),
      opencodeService,
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const agent = await agentService.create({
        name: "No Live Requests Specialist",
        role: "wait on the user",
        instructions: "Be useful.",
        defaultModel: "openai/gpt-4.1",
        capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
      });

      const opened = await server.inject({
        method: "GET",
        url: `/api/specialists/${agent.id}/conversations/active`,
      });
      const conversationId = opened.json<{ current: { id: string } }>().current.id;

      const response = await server.inject({
        method: "GET",
        url: `/api/conversations/${conversationId}/pending-interactions`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ permissions: [], question: null, liveRequests: [] });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}

function createMockOpenCodeService(): OpenCodeService {
  const sessions = new Map<
    string,
    {
      id: string;
      title?: string;
      permission?: Parameters<OpenCodeService["updateSessionPermissions"]>[2];
      time: { created: number; updated: number };
    }
  >();
  const messages = new Map<string, OpenCodeSessionMessage[]>();
  let sessionCount = 0;
  let messageCount = 0;
  let clock = 1_700_000_000_000;

  return {
    ...createBaseOpenCodeService(),
    createSession: (_directory, sessionOptions) => {
      sessionCount += 1;

      const session = {
        id: `ses-${String(sessionCount)}`,
        title: sessionOptions?.title,
        permission: sessionOptions?.permission,
        time: { created: nextTime(), updated: nextTime() },
      };
      sessions.set(session.id, session);
      messages.set(session.id, []);

      return Promise.resolve(session);
    },
    getSession: (_directory, sessionID) => Promise.resolve(mustSession(sessionID)),
    updateSessionPermissions: (_directory, sessionID, permission) => {
      const session = mustSession(sessionID);
      session.permission = permission;
      return Promise.resolve(session);
    },
    listSessionMessages: (_directory, sessionID) => Promise.resolve(mustMessages(sessionID)),
    listPendingPermissions: () => Promise.resolve([]),
    listPendingQuestions: () => Promise.resolve([]),
    promptSession: ({ sessionID, text }) => {
      const session = mustSession(sessionID);
      const list = mustMessages(sessionID);
      const userId = nextMessageId();
      const assistantId = nextMessageId();

      list.splice(0, list.length);
      list.push({
        info: {
          id: userId,
          sessionID,
          role: "user",
          time: { created: nextTime() },
        },
        parts: [
          {
            id: "part-1",
            sessionID,
            messageID: userId,
            type: "text",
            text,
          },
          {
            id: "file-1",
            sessionID,
            messageID: userId,
            type: "file",
            mime: "image/png",
            filename: "plan.png",
            url: "data:image/png;base64,AAAA",
          },
        ],
      });
      const assistantMessage = {
        info: {
          id: assistantId,
          sessionID,
          role: "assistant" as const,
          time: { created: nextTime(), completed: nextTime() },
        },
        parts: [
          {
            id: "part-2",
            sessionID,
            messageID: assistantId,
            type: "text",
            text: "Here is the plan.",
          },
          {
            id: "part-3",
            sessionID,
            messageID: assistantId,
            type: "tool",
            state: {
              attachments: [
                {
                  id: "tool-attachment-1",
                  mime: "application/pdf",
                  filename: "notes.pdf",
                  url: "data:application/pdf;base64,BBBB",
                },
              ],
            },
          },
        ],
      };
      list.push(assistantMessage);

      session.title = session.title ?? "Route Specialist";
      session.time.updated = nextTime();
      return Promise.resolve(assistantMessage);
    },
    promptSessionAsync: ({ sessionID, text }) => {
      if (text === "Use missing provider model") {
        const error = new Error("Model not found: openai/gpt-5.6-terra-fast.");
        error.name = "ProviderModelNotFoundError";
        return Promise.reject(error);
      }

      const session = mustSession(sessionID);
      const list = mustMessages(sessionID);
      const userId = nextMessageId();
      const assistantId = nextMessageId();

      list.splice(0, list.length);
      list.push({
        info: {
          id: userId,
          sessionID,
          role: "user",
          time: { created: nextTime() },
        },
        parts: [
          {
            id: `part-${userId}`,
            sessionID,
            messageID: userId,
            type: "text",
            text,
          },
        ],
      });
      list.push({
        info: {
          id: assistantId,
          sessionID,
          role: "assistant",
          time: { created: nextTime(), completed: nextTime() },
        },
        parts: [
          {
            id: `part-${assistantId}`,
            sessionID,
            messageID: assistantId,
            type: "text",
            text: `Reply to: ${text}`,
          },
        ],
      });

      session.title = session.title ?? "Route Specialist";
      session.time.updated = nextTime();
      return Promise.resolve();
    },
    listSessionStatuses: () => Promise.resolve({}),
    getSessionStatus: () => Promise.resolve({ type: "idle" }),
    commandSession: () => Promise.resolve(),
    summarizeSession: () => Promise.resolve(),
    shellSession: () => Promise.resolve(),
    findText: () => Promise.resolve([]),
    findFiles: () => Promise.resolve([]),
    listFiles: () => Promise.resolve([]),
    readFile: () => Promise.resolve({ type: "text" as const, content: "" }),
    getFileStatus: () => Promise.resolve([]),
  } as OpenCodeService;

  function mustSession(sessionID: string) {
    const session = sessions.get(sessionID);
    if (!session) {
      throw new Error(`Unknown session ${sessionID}`);
    }
    return session;
  }

  function mustMessages(sessionID: string) {
    const list = messages.get(sessionID);
    if (!list) {
      throw new Error(`Unknown session ${sessionID}`);
    }
    return list;
  }

  function nextMessageId(): string {
    messageCount += 1;
    return `msg-${String(messageCount)}`;
  }

  function nextTime(): number {
    clock += 1_000;
    return clock;
  }
}

function createBaseOpenCodeService() {
  return {
    dispose: () => Promise.resolve(),
    disposeGlobal: () => Promise.resolve(),
    listProviders: () =>
      Promise.resolve({
        all: [
          {
            id: "openai",
            name: "OpenAI",
            source: "api",
            env: ["OPENAI_API_KEY"],
            models: {
              "openai/gpt-4.1": { name: "GPT-4.1" },
            },
          },
        ],
        default: { openai: "openai/gpt-4.1" },
        connected: ["openai"],
      }),
    listAuthMethods: () =>
      Promise.resolve({
        openai: [{ type: "api", label: "API key" }],
      }),
    setApiKey: () => Promise.resolve(true),
    startOauth: () =>
      Promise.resolve({
        url: "https://provider.example/oauth",
        method: "auto",
        instructions: "Finish login.",
      }),
    completeOauth: () => Promise.resolve(true),
    disconnectProvider: () => Promise.resolve(true),
    listSessionStatuses: () => Promise.resolve({}),
    getSessionStatus: () => Promise.resolve({ type: "idle" as const }),
    replyPermission: async () => {},
    replyQuestion: async () => {},
    rejectQuestion: async () => {},
    abortSession: async () => {},
    deleteSession: async () => {},
    listMcpStatus: () => Promise.resolve({}),
    listMcpToolIds: () => Promise.resolve([]),
    startMcpAuth: () => Promise.resolve({ authorizationUrl: "https://auth.example/oauth" }),
    completeMcpAuth: () => Promise.resolve({ status: "connected" as const }),
    removeMcpAuth: () => Promise.resolve({ success: true as const }),
    authenticateMcp: () => Promise.resolve({ status: "connected" as const }),
  };
}
