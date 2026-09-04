import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createSpecialistService } from "../../src/services/specialist-service";
import { createConversationService } from "../../src/services/conversation-service";
import { createSessionArchiveService } from "../../src/services/session-archive-service";
import type { SessionArchiveSettingsService } from "../../src/services/session-archive-settings-service";
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
    const agentService = createSpecialistService({
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
        name: "Chat Specialist",
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

  it("uses the per-prompt model override and falls back to the agent default", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createSpecialistService({
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

    const promptModels: unknown[] = [];
    const originalPromptSession = opencodeService.promptSession;
    opencodeService.promptSession = (input) => {
      promptModels.push(input.model);
      return originalPromptSession(input);
    };
    // The chat UI sends with ?stream=true, which routes to promptSessionAsync.
    const asyncModels: unknown[] = [];
    const originalPromptSessionAsync = opencodeService.promptSessionAsync;
    opencodeService.promptSessionAsync = (input) => {
      asyncModels.push(input.model);
      return originalPromptSessionAsync(input);
    };

    try {
      const agent = await agentService.create({
        name: "Chat Specialist",
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

      await service.sendPrompt(opened.current.id, {
        text: "Use a different model.",
        attachments: [],
        model: "anthropic/claude-opus",
      });
      await service.sendPrompt(opened.current.id, {
        text: "Use the default model.",
        attachments: [],
      });
      // An unavailable / stale model falls back to the agent default instead of throwing.
      await service.sendPrompt(opened.current.id, {
        text: "Use a model that is no longer available.",
        attachments: [],
        model: "ghost/removed-model",
      });

      // Streaming path (what the chat composer actually uses).
      await service.sendPromptAsync(opened.current.id, {
        text: "Stream with an override.",
        attachments: [],
        model: "anthropic/claude-opus",
      });
      await service.sendPromptAsync(opened.current.id, {
        text: "Stream with the default.",
        attachments: [],
      });

      expect(promptModels[0]).toEqual({ providerID: "anthropic", modelID: "claude-opus" });
      expect(promptModels[1]).toEqual({ providerID: "openai", modelID: "gpt-4.1" });
      expect(promptModels[2]).toEqual({ providerID: "openai", modelID: "gpt-4.1" });
      expect(asyncModels[0]).toEqual({ providerID: "anthropic", modelID: "claude-opus" });
      expect(asyncModels[1]).toEqual({ providerID: "openai", modelID: "gpt-4.1" });
    } finally {
      await testDb.cleanup();
    }
  });

  it("persists tool call parts for command and shell executions", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createSpecialistService({
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
        name: "Command Specialist",
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
    const agentService = createSpecialistService({
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
        name: "Media Specialist",
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
    const agentService = createSpecialistService({
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
        name: "Reload Specialist",
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

  it("persists assistant errors when re-syncing remote messages", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService({
      promptAsyncAssistantError: {
        name: "APIError",
        data: {
          message: "The image data you provided does not represent a valid image.",
          statusCode: 400,
        },
      },
    });
    const agentService = createSpecialistService({
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
        name: "Errored Specialist",
        role: "surface failures",
        instructions: "Report provider errors.",
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
        text: "Inspect this image",
        attachments: [],
      });

      const reloaded = await service.get(agent.id, opened.current.id);

      expect(reloaded.messages[1]).toMatchObject({
        role: "assistant",
        content: "",
        parts: [],
        error: {
          name: "APIError",
          message: "The image data you provided does not represent a valid image.",
          data: {
            message: "The image data you provided does not represent a valid image.",
            statusCode: 400,
          },
        },
      });
    } finally {
      await testDb.cleanup();
    }
  });

  it("archives synced conversation messages and removes the archive folder on delete", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const archiveService = createSessionArchiveService({ config: testDb.config });
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const service = createConversationService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      archiveService,
    });

    try {
      const agent = await agentService.create({
        name: "Archive Specialist",
        role: "archive chats",
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
      await service.sendPrompt(opened.current.id, {
        text: "Archive this please.",
        attachments: [],
      });
      await archiveService.flush();

      const archivePath = archiveService.resolveChatArchivePath({
        agentId: agent.id,
        conversationId: opened.current.id,
      });
      const jsonl = await readFile(join(archivePath, "messages.jsonl"), "utf8");
      expect(jsonl.trim().split("\n")).toHaveLength(2);
      const metadata = JSON.parse(await readFile(join(archivePath, "metadata.json"), "utf8")) as {
        messageCount: number;
        kind: string;
      };
      expect(metadata.kind).toBe("chat");
      expect(metadata.messageCount).toBe(2);

      await service.deleteConversation(agent.id, opened.current.id);
      await expect(stat(archivePath)).rejects.toThrow();
    } finally {
      await testDb.cleanup();
    }
  });

  it("skips message writes when archive append mode is off", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const archiveService = createSessionArchiveService({ config: testDb.config });
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const offSettingsService: SessionArchiveSettingsService = {
      get: () =>
        Promise.resolve({
          sessionArchiveEnabled: true,
          sessionArchiveAppendMode: "off" as const,
          sessionArchiveMaterializeIntervalMinutes: 1440,
        }),
      update: () => Promise.reject(new Error("unexpected update call")),
    };
    const service = createConversationService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      archiveService,
      archiveSettingsService: offSettingsService,
    });

    try {
      const agent = await agentService.create({
        name: "Off Mode Specialist",
        role: "test append-mode off",
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
      await service.sendPrompt(opened.current.id, { text: "Test off mode.", attachments: [] });
      await archiveService.flush();

      const archivePath = archiveService.resolveChatArchivePath({
        agentId: agent.id,
        conversationId: opened.current.id,
      });
      // Archive folder and metadata exist, but no messages.jsonl because appending is off.
      await expect(stat(join(archivePath, "metadata.json"))).resolves.toBeTruthy();
      await expect(stat(join(archivePath, "messages.jsonl"))).rejects.toThrow();
    } finally {
      await testDb.cleanup();
    }
  });

  it("does not fail the prompt when archiving throws", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const brokenArchiveService = {
      resolveChatArchivePath: () => "/dev/null/archive",
      resolveTaskRunArchivePath: () => "/dev/null/archive",
      ensureChatArchive: () => Promise.reject(new Error("archive offline")),
      ensureTaskRunArchive: () => Promise.reject(new Error("archive offline")),
      enqueueMessages: () => undefined,
      removeArchive: () => Promise.resolve(),
    } as unknown as ReturnType<typeof createSessionArchiveService>;
    const agentService = createSpecialistService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      skillRoot: `${testDb.cwd}/builtin-skills`,
    });
    const service = createConversationService({
      db: testDb.client.db,
      config: testDb.config,
      opencodeService,
      archiveService: brokenArchiveService,
    });

    try {
      const agent = await agentService.create({
        name: "Resilient Specialist",
        role: "keep chatting",
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
      const prompted = await service.sendPrompt(opened.current.id, {
        text: "Still works?",
        attachments: [],
      });
      expect(prompted.messages).toHaveLength(2);
    } finally {
      await testDb.cleanup();
    }
  });

  it("composes and forwards the system prompt, snapshots it on the user message, and the snapshot survives re-sync", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createSpecialistService({
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

    const systems: (string | undefined)[] = [];
    const originalPromptSession = opencodeService.promptSession;
    opencodeService.promptSession = (input) => {
      systems.push(input.system);
      return originalPromptSession(input);
    };

    try {
      const agent = await agentService.create({
        name: "Ada",
        role: "engineer",
        instructions: "Be precise.",
        defaultModel: "openai/gpt-4.1",
        capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
      });
      const opened = await service.resolveCurrent(agent.id);
      const detail = await service.sendPrompt(opened.current.id, { text: "Hi", attachments: [] });

      // The composed system string is forwarded and renders identity + global-chat.
      expect(systems).toHaveLength(1);
      expect(systems[0]).toContain("You are Ada");
      expect(systems[0]).toContain("with a human operator");

      const userMessage = detail.messages.find((message) => message.role === "user");
      expect(userMessage?.systemPromptSnapshot?.map((prompt) => prompt.id)).toEqual([
        "identity",
        "global-chat",
      ]);

      // A later sync rebuilds messages from OpenCode — the snapshot must persist.
      const reloaded = await service.get(agent.id, opened.current.id);
      const reloadedUser = reloaded.messages.find((message) => message.role === "user");
      expect(reloadedUser?.systemPromptSnapshot?.map((prompt) => prompt.id)).toEqual([
        "identity",
        "global-chat",
      ]);
    } finally {
      await testDb.cleanup();
    }
  });

  it("disabling a prompt removes it from the next message and persists the override", async () => {
    const testDb = await createTestDatabase();
    const opencodeService = createMockOpenCodeService();
    const agentService = createSpecialistService({
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

    const systems: (string | undefined)[] = [];
    const originalPromptSession = opencodeService.promptSession;
    opencodeService.promptSession = (input) => {
      systems.push(input.system);
      return originalPromptSession(input);
    };

    try {
      const agent = await agentService.create({
        name: "Ada",
        role: "engineer",
        instructions: "Be precise.",
        defaultModel: "openai/gpt-4.1",
        capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
      });
      const opened = await service.resolveCurrent(agent.id);

      const afterToggle = await service.setConversationSystemPromptEnabled(
        opened.current.id,
        "global-chat",
        false,
      );
      expect(afterToggle.find((prompt) => prompt.id === "global-chat")?.enabled).toBe(false);

      const detail = await service.sendPrompt(opened.current.id, { text: "Hi", attachments: [] });
      expect(systems.at(-1)).toContain("You are Ada");
      expect(systems.at(-1)).not.toContain("with a human operator");

      const userMessage = detail.messages.find((message) => message.role === "user");
      expect(userMessage?.systemPromptSnapshot?.map((prompt) => prompt.id)).toEqual(["identity"]);

      // Override persists across reloads.
      const prompts = await service.getConversationSystemPrompts(opened.current.id);
      expect(prompts.find((prompt) => prompt.id === "global-chat")?.enabled).toBe(false);
    } finally {
      await testDb.cleanup();
    }
  });
});

function createMockOpenCodeService(
  options: { promptAsyncAssistantError?: unknown } = {},
): OpenCodeService {
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
              "gpt-4.1": { name: "GPT-4.1" },
            },
          },
          {
            id: "anthropic",
            name: "Anthropic",
            source: "api",
            env: ["ANTHROPIC_API_KEY"],
            models: {
              "claude-opus": { name: "Claude Opus" },
            },
          },
        ],
        default: { openai: "openai/gpt-4.1", anthropic: "anthropic/claude-opus" },
        connected: ["openai", "anthropic"],
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
        permission: sessionOptions?.permission,
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
    updateSessionPermissions: (_directory, sessionID, permission) => {
      const session = mustSession(sessionID);
      session.permission = permission;
      return Promise.resolve(session);
    },
    listSessionStatuses: () => Promise.resolve({}),
    getSessionStatus: () => Promise.resolve({ type: "idle" as const }),
    listSessionMessages: (_directory, sessionID) => Promise.resolve(messages.get(sessionID) ?? []),
    listPendingPermissions: () => Promise.resolve([]),
    listPendingQuestions: () => Promise.resolve([]),
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
      const assistantMessage = {
        info: {
          id: assistantId,
          sessionID,
          role: "assistant" as const,
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
      };
      list.push(assistantMessage);

      session.title = session.title ?? text.slice(0, 40);
      session.time.updated = nextTime();
      return Promise.resolve(assistantMessage);
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
          error: options.promptAsyncAssistantError,
        },
        parts: options.promptAsyncAssistantError
          ? []
          : [
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
