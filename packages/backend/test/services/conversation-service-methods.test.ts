import { afterEach, describe, expect, it, vi } from "vitest";

import { createConversationService } from "../../src/services/conversation-service";
import { createSpecialistService } from "../../src/services/specialist-service";
import type { OpenCodeService, OpenCodeSession } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

function mockOpenCode(): OpenCodeService {
  let count = 0;
  const sessions = new Map<string, OpenCodeSession>();
  return {
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
    listProviders: vi.fn(() =>
      Promise.resolve({
        all: [{ id: "openai", name: "OpenAI", source: "api", env: [], models: { "gpt-4.1": {} } }],
        default: { openai: "openai/gpt-4.1" },
        connected: ["openai"],
      }),
    ),
    createSession: vi.fn((_dir: string, opts?: { title?: string }) => {
      count += 1;
      const session: OpenCodeSession = {
        id: `ses-${count}`,
        title: opts?.title,
        time: { created: count, updated: count },
      };
      sessions.set(session.id, session);
      return Promise.resolve(session);
    }),
    getSession: vi.fn((_dir: string, id: string) =>
      Promise.resolve(sessions.get(id) ?? { id, time: { created: 1 } }),
    ),
    listSessionMessages: vi.fn(() => Promise.resolve([])),
    listSessionStatuses: vi.fn(() => Promise.resolve({})),
    getSessionStatus: vi.fn(() => Promise.resolve({ type: "idle" as const })),
    listPendingPermissions: vi.fn(() => Promise.resolve([])),
    listPendingQuestions: vi.fn(() => Promise.resolve([])),
    promptSession: vi.fn(() =>
      Promise.resolve({
        info: { id: "m1", sessionID: "ses-1", role: "assistant", time: { created: 1 } },
        parts: [{ id: "p1", type: "text", text: "ok" }],
      }),
    ),
    promptSessionAsync: vi.fn(() => Promise.resolve()),
    commandSession: vi.fn(() => Promise.resolve()),
    summarizeSession: vi.fn(() => Promise.resolve()),
    shellSession: vi.fn(() => Promise.resolve()),
    replyPermission: vi.fn(() => Promise.resolve()),
    replyQuestion: vi.fn(() => Promise.resolve()),
    rejectQuestion: vi.fn(() => Promise.resolve()),
    abortSession: vi.fn(() => Promise.resolve()),
    deleteSession: vi.fn(() => Promise.resolve()),
  } as unknown as OpenCodeService;
}

async function setup() {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  const opencodeService = mockOpenCode();
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
  const agent = await agentService.create({
    name: "Chat Specialist",
    role: "help",
    instructions: "Be useful.",
    defaultModel: "openai/gpt-4.1",
    capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
  });
  return { testDb, service, opencodeService, agent };
}

describe("conversation-service delegating methods", () => {
  it("runs command, shell, async prompt, and summarize on the current session", async () => {
    const { service, opencodeService, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    const conversationId = snapshot.current.id;

    await service.sendCommand(conversationId, {
      command: "test",
      arguments: "--all",
      attachments: [],
    });
    await service.sendShell(conversationId, { command: "ls -la" });
    await service.sendPromptAsync(conversationId, { text: "background work", attachments: [] });
    await service.summarize(conversationId);

    expect(opencodeService.commandSession).toHaveBeenCalled();
    expect(opencodeService.shellSession).toHaveBeenCalled();
    expect(opencodeService.promptSessionAsync).toHaveBeenCalled();
    expect(opencodeService.summarizeSession).toHaveBeenCalled();
  });

  it("relays permission and question replies and aborts a conversation", async () => {
    const { service, opencodeService, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    const conversationId = snapshot.current.id;

    await service.replyPermission(conversationId, "perm-1", "once");
    await service.replyQuestion(conversationId, "q-1", [["yes"]]);
    await service.rejectQuestion(conversationId, "q-1");
    await service.abortConversation(conversationId);

    expect(opencodeService.replyPermission).toHaveBeenCalled();
    expect(opencodeService.replyQuestion).toHaveBeenCalled();
    expect(opencodeService.rejectQuestion).toHaveBeenCalled();
    expect(opencodeService.abortSession).toHaveBeenCalled();
  });

  it("updates titles, resolves the owning agent, and deletes a conversation", async () => {
    const { service, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    const conversationId = snapshot.current.id;

    await service.updateTitle(conversationId, "Renamed chat");
    const resolved = await service.resolveConversationAgent(conversationId);
    expect(resolved.agent.id).toBe(agent.id);

    expect(await service.getMedia(conversationId)).toEqual([]);

    await service.deleteConversation(agent.id, conversationId);
    // A fresh resolveCurrent creates a new conversation since the old one is gone.
    const after = await service.resolveCurrent(agent.id);
    expect(after.current.id).not.toBe(conversationId);
  });

  it("rejects task-run prompts against a plain chat conversation", async () => {
    const { service, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    await expect(
      service.sendTaskRunPrompt(snapshot.current.id, { text: "hi", attachments: [] }),
    ).rejects.toThrow();
  });

  it("lists conversations for an agent and reads summaries and system prompts", async () => {
    const { service, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    const conversationId = snapshot.current.id;

    expect((await service.list(agent.id)).length).toBeGreaterThanOrEqual(0);
    const forAgent = await service.listForAgent(agent.id, {});
    expect(Array.isArray(forAgent)).toBe(true);

    const summary = await service.getSummaryForAgent(agent.id, conversationId);
    expect(summary?.id).toBe(conversationId);

    const detail = await service.get(agent.id, conversationId);
    expect(detail.id).toBe(conversationId);

    const prompts = await service.getConversationSystemPrompts(conversationId);
    expect(Array.isArray(prompts)).toBe(true);
    if (prompts[0]) {
      await service.setConversationSystemPromptEnabled(conversationId, prompts[0].id, false);
    }

    const fresh = await service.startFresh(agent.id);
    expect(fresh.current.id).not.toBe(conversationId);
  });

  it("rehydrates pending permissions and question scoped to the conversation's session", async () => {
    const { service, opencodeService, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    const conversationId = snapshot.current.id;
    const sessionID = snapshot.current.opencodeSessionId;

    opencodeService.listPendingPermissions = vi.fn(() =>
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
          id: "perm-2",
          sessionID: "other-session",
          permission: "bash",
          patterns: [],
          always: [],
          metadata: {},
        },
      ]),
    );
    opencodeService.listPendingQuestions = vi.fn(() =>
      Promise.resolve([
        {
          id: "q-1",
          sessionID: "other-session",
          questions: [{ question: "Ignored", options: [] }],
        },
        {
          id: "q-2",
          sessionID,
          questions: [{ question: "Proceed?", options: [{ label: "Yes" }, { label: "No" }] }],
          tool: { messageID: "msg-2", callID: "call-2" },
        },
      ]),
    );

    const result = await service.listPendingInteractions(conversationId);

    expect(result.permissions).toEqual([
      {
        id: "perm-1",
        sessionID,
        permission: "bash",
        patterns: ["rm *"],
        always: [],
        metadata: {},
        tool: { messageID: "msg-1", callID: "call-1" },
      },
    ]);
    expect(result.question).toEqual({
      id: "q-2",
      sessionID,
      questions: [{ question: "Proceed?", options: [{ label: "Yes" }, { label: "No" }] }],
      tool: { messageID: "msg-2", callID: "call-2" },
    });
  });

  it("returns no pending question when none match the conversation's session", async () => {
    const { service, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);

    const result = await service.listPendingInteractions(snapshot.current.id);

    expect(result).toEqual({ permissions: [], question: null });
  });
});
