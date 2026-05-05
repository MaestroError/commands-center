import { describe, expect, it } from "vitest";

import { createAgentService } from "../../src/services/agent-service";
import { createConversationService } from "../../src/services/conversation-service";
import type {
  OpenCodeService,
  OpenCodeSession,
  OpenCodeSessionMessage,
} from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("createConversationService", () => {
  it("resolves the current conversation, persists prompt history, and start fresh preserves previous conversations", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const service = createConversationService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
    });

    try {
      const agent = await agentService.create({
        name: "Chat Agent",
        role: "help with implementation",
        instructions: "Be useful.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      const opened = await service.resolveCurrent(agent.id);

      expect(opened.current.isCurrent).toBe(true);
      expect(opened.current.messages).toEqual([]);
      expect(opened.previous).toEqual([]);

      const prompted = await service.sendPrompt(opened.current.id, {
        text: "Summarize the release work.",
        attachments: [
          {
            id: "att-1",
            filename: "plan.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,AAAA",
            type: "image",
            sizeBytes: 4,
          },
        ],
      });

      expect(prompted.messages).toHaveLength(2);
      expect(prompted.messages[0]?.role).toBe("user");
      expect(prompted.messages[0]?.attachments).toEqual([
        {
          id: "att-1",
          type: "image",
          filename: "plan.png",
          mimeType: "image/png",
          sizeBytes: undefined,
          source: undefined,
        },
      ]);
      expect(prompted.messages[1]?.role).toBe("assistant");
      expect(prompted.messageCount).toBe(2);

      const fresh = await service.startFresh(agent.id);

      expect(fresh.current.id).not.toBe(opened.current.id);
      expect(fresh.current.messages).toEqual([]);
      expect(fresh.previous).toHaveLength(1);
      expect(fresh.previous[0]?.id).toBe(opened.current.id);
      expect(fresh.previous[0]?.messageCount).toBe(2);
    } finally {
      await testDb.cleanup();
    }
  });

  it("persists tool call parts for command and shell executions", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const service = createConversationService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
    });

    try {
      const agent = await agentService.create({
        name: "Command Agent",
        role: "execute commands",
        instructions: "Use commands.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      const opened = await service.resolveCurrent(agent.id);
      const afterCommand = await service.sendCommand(opened.current.id, {
        command: "task-planner",
        arguments: "ship direct chat",
        attachments: [],
      });
      const afterShell = await service.sendShell(opened.current.id, {
        command: "pnpm test",
      });

      expect(afterCommand.messages.at(-1)?.parts.some((part) => part.type === "tool")).toBe(true);
      expect(afterShell.messages.at(-1)?.parts.some((part) => part.type === "tool")).toBe(true);
    } finally {
      await testDb.cleanup();
    }
  });

  it("returns media items from file parts and tool attachments newest first", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const service = createConversationService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
    });

    try {
      const agent = await agentService.create({
        name: "Media Agent",
        role: "handles attachments",
        instructions: "Review uploads.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      const opened = await service.resolveCurrent(agent.id);

      await service.sendPrompt(opened.current.id, {
        text: "Inspect this image",
        attachments: [
          {
            id: "att-image",
            filename: "diagram.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,AAAA",
            type: "image",
          },
        ],
      });

      await service.sendCommand(opened.current.id, {
        command: "annotate",
        arguments: "--pdf",
        attachments: [
          {
            id: "att-pdf",
            filename: "spec.pdf",
            mimeType: "application/pdf",
            dataUrl: "data:application/pdf;base64,BBBB",
            type: "document",
          },
        ],
      });

      const media = await service.getMedia(opened.current.id);

      expect(media).toHaveLength(2);
      expect(media[0]).toMatchObject({
        id: "att-pdf",
        messageId: "msg-3",
        filename: "spec.pdf",
        mime: "application/pdf",
        url: "data:application/pdf;base64,BBBB",
      });
      expect(media[1]).toMatchObject({
        id: "att-image",
        messageId: "msg-1",
        filename: "diagram.png",
        mime: "image/png",
        url: "data:image/png;base64,AAAA",
      });
      expect(new Date(media[0]!.createdAt).getTime()).toBeGreaterThan(
        new Date(media[1]!.createdAt).getTime(),
      );
    } finally {
      await testDb.cleanup();
    }
  });

  it("re-syncs remote messages when loading a specific conversation", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createAgentService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const service = createConversationService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
    });

    try {
      const agent = await agentService.create({
        name: "Reload Agent",
        role: "restore chats",
        instructions: "Be persistent.",
        defaultModel: "openai/gpt-4.1",
        capabilities: {
          builtInSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
        },
      });

      const opened = await service.resolveCurrent(agent.id);

      await service.sendPromptAsync(opened.current.id, {
        text: "Persist this after reload",
        attachments: [],
      });

      const reloaded = await service.get(agent.id, opened.current.id);

      expect(reloaded.messages).toHaveLength(2);
      expect(reloaded.messages[0]).toMatchObject({
        role: "user",
        content: "Persist this after reload",
      });
      expect(reloaded.messages[1]).toMatchObject({
        role: "assistant",
        content: "Reply to: Persist this after reload",
      });
    } finally {
      await testDb.cleanup();
    }
  });
});

function createMockOpenCodeService(): OpenCodeService {
  const sessions = new Map<string, OpenCodeSession>();
  const messages = new Map<string, OpenCodeSessionMessage[]>();
  let sessionCount = 0;
  let messageCount = 0;
  let clock = 1_700_000_000_000;

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
    createSession: (_directory, sessionOptions) => {
      sessionCount += 1;
      const id = `ses-${String(sessionCount)}`;
      const session: OpenCodeSession = {
        id,
        title: sessionOptions?.title,
        time: {
          created: nextTime(),
          updated: nextTime(),
        },
      };
      sessions.set(id, session);
      messages.set(id, []);
      return Promise.resolve(session);
    },
    getSession: (_directory, sessionID) => {
      const session = sessions.get(sessionID);

      if (!session) {
        throw new Error(`Unknown session ${sessionID}`);
      }

      return Promise.resolve(session);
    },
    listSessionMessages: (_directory, sessionID) => Promise.resolve(messages.get(sessionID) ?? []),
    promptSession: ({ sessionID, text, attachments }) => {
      const session = mustSession(sessionID);
      const list = mustMessages(sessionID);
      const userId = nextMessageId();
      const assistantId = nextMessageId();

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
          ...(attachments ?? []).map((attachment, index) => ({
            id: attachment.id ?? `file-${userId}-${String(index)}`,
            sessionID,
            messageID: userId,
            type: "file" as const,
            mime: attachment.mimeType,
            filename: attachment.filename,
            url: attachment.dataUrl,
          })),
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

      session.title = session.title ?? text.slice(0, 40);
      session.time.updated = nextTime();
      return Promise.resolve();
    },
    commandSession: ({ sessionID, command, arguments: args, attachments }) => {
      const session = mustSession(sessionID);
      const list = mustMessages(sessionID);
      const assistantId = nextMessageId();

      list.push({
        info: {
          id: assistantId,
          sessionID,
          role: "assistant",
          time: { created: nextTime(), completed: nextTime() },
        },
        parts: [
          {
            id: `tool-${assistantId}`,
            sessionID,
            messageID: assistantId,
            type: "tool",
            callID: `call-${assistantId}`,
            tool: command,
            state: {
              status: "completed",
              input: { arguments: args },
              output: "ok",
              title: command,
              metadata: {},
              attachments: (attachments ?? []).map((attachment) => ({
                id: attachment.id,
                mime: attachment.mimeType,
                filename: attachment.filename,
                url: attachment.dataUrl,
              })),
              time: { start: nextTime(), end: nextTime() },
            },
          },
        ],
      });

      session.time.updated = nextTime();
      return Promise.resolve();
    },
    summarizeSession: () => Promise.resolve(),
    shellSession: ({ sessionID, command }) => {
      const session = mustSession(sessionID);
      const list = mustMessages(sessionID);
      const assistantId = nextMessageId();

      list.push({
        info: {
          id: assistantId,
          sessionID,
          role: "assistant",
          time: { created: nextTime(), completed: nextTime() },
        },
        parts: [
          {
            id: `tool-${assistantId}`,
            sessionID,
            messageID: assistantId,
            type: "tool",
            callID: `call-${assistantId}`,
            tool: "bash",
            state: {
              status: "completed",
              input: { command },
              output: "done",
              title: command,
              metadata: {},
              time: { start: nextTime(), end: nextTime() },
            },
          },
        ],
      });

      session.time.updated = nextTime();
      return Promise.resolve();
    },
    promptSessionAsync: ({ sessionID, text, attachments }) => {
      const session = mustSession(sessionID);
      const list = mustMessages(sessionID);
      const userId = nextMessageId();
      const assistantId = nextMessageId();

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
          ...(attachments ?? []).map((attachment, index) => ({
            id: attachment.id ?? `file-${userId}-${String(index)}`,
            sessionID,
            messageID: userId,
            type: "file" as const,
            mime: attachment.mimeType,
            filename: attachment.filename,
            url: attachment.dataUrl,
          })),
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

      session.title = session.title ?? text.slice(0, 40);
      session.time.updated = nextTime();
    },
    replyPermission: async () => {},
    replyQuestion: async () => {},
    rejectQuestion: async () => {},
    abortSession: async () => {},
    deleteSession: async () => {},
    findText: () => Promise.resolve([]),
    findFiles: () => Promise.resolve([]),
    listFiles: () => Promise.resolve([]),
    readFile: () => Promise.resolve({ type: "text" as const, content: "" }),
    getFileStatus: () => Promise.resolve([]),
    listMcpStatus: () => Promise.resolve({}),
    listMcpToolIds: () => Promise.resolve([]),
    startMcpAuth: () => Promise.resolve({ authorizationUrl: "https://auth.example/oauth" }),
    completeMcpAuth: () => Promise.resolve({ status: "connected" as const }),
    removeMcpAuth: () => Promise.resolve({ success: true as const }),
    authenticateMcp: () => Promise.resolve({ status: "connected" as const }),
  } as OpenCodeService;

  function mustSession(sessionID: string): OpenCodeSession {
    const session = sessions.get(sessionID);

    if (!session) {
      throw new Error(`Unknown session ${sessionID}`);
    }

    return session;
  }

  function mustMessages(sessionID: string): OpenCodeSessionMessage[] {
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
