import { afterEach, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";
import type { Logger } from "pino";

import { createId } from "../../src/db/ids";
import { artifact_share_links, artifacts } from "../../src/db/schema/index";
import { createArtifactService } from "../../src/services/artifact-service";
import { NotFoundError } from "../../src/lib/api-error";
import { createConversationService } from "../../src/services/conversation-service";
import { createSpecialistService } from "../../src/services/specialist-service";
import { createTaskService } from "../../src/services/task-service";
import type { OpenCodeService, OpenCodeSession } from "../../src/services/opencode-service";
import {
  createInteractiveChatWatchdogService,
  type InteractiveChatWatchdogService,
} from "../../src/services/interactive-chat-watchdog-service";
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
    listSessionChildren: vi.fn(() => Promise.resolve([])),
    getSessionTreeIds: vi.fn((_dir: string, id: string) => Promise.resolve(new Set([id]))),
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

async function setup(
  options: {
    watchdog?: InteractiveChatWatchdogService;
    createWatchdog?: (opencodeService: OpenCodeService) => InteractiveChatWatchdogService;
    logger?: Logger;
  } = {},
) {
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
    logger: options.logger,
    interactiveChatWatchdogService: options.watchdog ?? options.createWatchdog?.(opencodeService),
  });
  const taskService = createTaskService({ db: testDb.client.db, config: testDb.config });
  const agent = await agentService.create({
    name: "Chat Specialist",
    role: "help",
    instructions: "Be useful.",
    defaultModel: "openai/gpt-4.1",
    capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
  });
  return { testDb, service, opencodeService, taskService, agent };
}

describe("conversation-service delegating methods", () => {
  it("arms the chat watchdog only after an async prompt is accepted", async () => {
    const arm = vi.fn();
    const cancel = vi.fn();
    const watchdog = {
      prepare: vi.fn(() => Promise.resolve({ arm, cancel })),
    } as unknown as InteractiveChatWatchdogService;
    const { service, agent } = await setup({ watchdog });
    const snapshot = await service.resolveCurrent(agent.id);

    await service.sendPromptAsync(snapshot.current.id, { text: "work", attachments: [] });

    expect(watchdog.prepare).toHaveBeenCalledWith({
      conversationId: snapshot.current.id,
      directory: agent.workspacePath,
      sessionID: snapshot.current.opencodeSessionId,
    });
    expect(arm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("submits an async prompt when watchdog preparation fails", async () => {
    const error = new Error("snapshot failed");
    const logger = { warn: vi.fn() } as unknown as Logger;
    const watchdog = {
      prepare: vi.fn(() => Promise.reject(error)),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({ watchdog, logger });
    const snapshot = await service.resolveCurrent(agent.id);

    await service.sendPromptAsync(snapshot.current.id, { text: "work", attachments: [] });

    expect(opencodeService.promptSessionAsync).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      { err: error, conversationId: snapshot.current.id },
      "interactive chat watchdog preparation failed",
    );
  });

  it("submits an async prompt when watchdog baseline preparation times out", async () => {
    const logger = { warn: vi.fn() } as unknown as Logger;
    const { service, opencodeService, agent } = await setup({
      logger,
      createWatchdog: (service) =>
        createInteractiveChatWatchdogService({
          opencodeService: service,
          logger,
          prepareTimeoutMs: 10,
        }),
    });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.getSessionTreeIds = vi.fn(
      (_directory: string, _sessionID: string, signal?: AbortSignal) =>
        new Promise<Set<string>>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );
    vi.useFakeTimers();

    const sending = service.sendPromptAsync(snapshot.current.id, { text: "work", attachments: [] });
    await vi.advanceTimersByTimeAsync(10);
    await sending;

    expect(opencodeService.promptSessionAsync).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: snapshot.current.id }),
      "interactive chat watchdog preparation failed",
    );
    vi.useRealTimers();
  });

  it("serializes concurrent prompt replacement for one conversation", async () => {
    let acceptFirst: (() => void) | undefined;
    const firstPrompt = new Promise<void>((resolve) => {
      acceptFirst = resolve;
    });
    const watchdog = {
      prepare: vi
        .fn()
        .mockResolvedValueOnce({ arm: vi.fn(), cancel: vi.fn() })
        .mockResolvedValueOnce({ arm: vi.fn(), cancel: vi.fn() }),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({ watchdog });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.promptSessionAsync = vi
      .fn()
      .mockImplementationOnce(() => firstPrompt)
      .mockResolvedValueOnce(undefined);

    const first = service.sendPromptAsync(snapshot.current.id, { text: "first", attachments: [] });
    const second = service.sendPromptAsync(snapshot.current.id, {
      text: "second",
      attachments: [],
    });
    await vi.waitFor(() => expect(opencodeService.promptSessionAsync).toHaveBeenCalledOnce());
    expect(watchdog.prepare).toHaveBeenCalledOnce();

    acceptFirst?.();
    await Promise.all([first, second]);

    expect(watchdog.prepare).toHaveBeenCalledTimes(2);
    expect(opencodeService.promptSessionAsync).toHaveBeenCalledTimes(2);
  });

  it("cancels only a failed replacement candidate", async () => {
    const firstArm = vi.fn();
    const firstCancel = vi.fn();
    const secondArm = vi.fn();
    const secondCancel = vi.fn();
    const watchdog = {
      prepare: vi
        .fn()
        .mockResolvedValueOnce({ arm: firstArm, cancel: firstCancel })
        .mockResolvedValueOnce({ arm: secondArm, cancel: secondCancel }),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({ watchdog });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.promptSessionAsync = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("prompt rejected"));

    await service.sendPromptAsync(snapshot.current.id, { text: "first", attachments: [] });
    await expect(
      service.sendPromptAsync(snapshot.current.id, { text: "second", attachments: [] }),
    ).rejects.toThrow("prompt rejected");

    expect(firstArm).toHaveBeenCalledOnce();
    expect(firstCancel).not.toHaveBeenCalled();
    expect(secondArm).not.toHaveBeenCalled();
    expect(secondCancel).toHaveBeenCalledOnce();
  });

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
    const sessionID = snapshot.current.opencodeSessionId;
    opencodeService.listPendingPermissions = vi.fn(() =>
      Promise.resolve([
        {
          id: "perm-1",
          sessionID,
          permission: "read",
          patterns: ["*"],
          always: [],
          metadata: {},
        },
      ]),
    );
    opencodeService.listPendingQuestions = vi.fn(() =>
      Promise.resolve([
        { id: "q-1", sessionID, questions: [{ question: "Proceed?", options: [] }] },
      ]),
    );

    await service.replyPermission(conversationId, "perm-1", "once");
    await service.replyQuestion(conversationId, "q-1", [["yes"]]);
    await service.rejectQuestion(conversationId, "q-1");
    await service.abortConversation(conversationId);

    expect(opencodeService.replyPermission).toHaveBeenCalled();
    expect(opencodeService.replyQuestion).toHaveBeenCalled();
    expect(opencodeService.rejectQuestion).toHaveBeenCalled();
    expect(opencodeService.abortSession).toHaveBeenCalled();
  });

  it("rejects replies for pending requests owned by an unrelated session", async () => {
    const { service, opencodeService, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.listPendingPermissions = vi.fn(() =>
      Promise.resolve([
        {
          id: "perm-other",
          sessionID: "unrelated",
          permission: "read",
          patterns: ["*"],
          always: [],
          metadata: {},
        },
      ]),
    );
    opencodeService.listPendingQuestions = vi.fn(() =>
      Promise.resolve([
        {
          id: "question-other",
          sessionID: "unrelated",
          questions: [{ question: "Proceed?", options: [] }],
        },
      ]),
    );

    await expect(
      service.replyPermission(snapshot.current.id, "perm-other", "once"),
    ).rejects.toThrow('Pending request "perm-other" no longer exists.');
    await expect(
      service.replyQuestion(snapshot.current.id, "question-other", [["yes"]]),
    ).rejects.toThrow('Pending request "question-other" no longer exists.');
    await expect(service.rejectQuestion(snapshot.current.id, "question-other")).rejects.toThrow(
      'Pending request "question-other" no longer exists.',
    );
    expect(opencodeService.replyPermission).not.toHaveBeenCalled();
    expect(opencodeService.replyQuestion).not.toHaveBeenCalled();
    expect(opencodeService.rejectQuestion).not.toHaveBeenCalled();
  });

  it("auto-approves verified descendant permissions for task runs", async () => {
    const { service, opencodeService, taskService, agent } = await setup();
    const task = await taskService.create({ agentId: agent.id, title: "Task" });
    const run = await taskService.createRun({
      id: "run-1",
      taskId: task.id,
      agentId: agent.id,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Run.",
    });
    const conversation = await service.createTaskRunConversation({
      agentId: agent.id,
      taskId: task.id,
      taskRunId: run.id,
      title: "Run",
    });
    opencodeService.getSessionTreeIds = vi.fn(() =>
      Promise.resolve(new Set([conversation.opencodeSessionId, "child-session"])),
    );
    opencodeService.listPendingPermissions = vi.fn(() =>
      Promise.resolve([
        {
          id: "perm-child",
          sessionID: "child-session",
          permission: "external_directory",
          patterns: ["/shared/*"],
          always: [],
          metadata: {},
        },
      ]),
    );

    await expect(service.listTaskRunPendingInteractions(task.id, run.id)).resolves.toEqual([]);
    expect(opencodeService.replyPermission).toHaveBeenCalledWith(
      agent.workspacePath,
      "perm-child",
      "once",
    );
  });

  it("surfaces a descendant task permission when auto-approval fails", async () => {
    const { service, opencodeService, taskService, agent } = await setup();
    const task = await taskService.create({ agentId: agent.id, title: "Task" });
    const run = await taskService.createRun({
      id: "run-2",
      taskId: task.id,
      agentId: agent.id,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Run.",
    });
    const conversation = await service.createTaskRunConversation({
      agentId: agent.id,
      taskId: task.id,
      taskRunId: run.id,
      title: "Run",
    });
    opencodeService.getSessionTreeIds = vi.fn(() =>
      Promise.resolve(new Set([conversation.opencodeSessionId, "child-session"])),
    );
    opencodeService.listPendingPermissions = vi.fn(() =>
      Promise.resolve([
        {
          id: "perm-child",
          sessionID: "child-session",
          permission: "external_directory",
          patterns: ["/shared/*"],
          always: [],
          metadata: {},
        },
      ]),
    );
    opencodeService.replyPermission = vi.fn(() => Promise.reject(new Error("reply failed")));

    await expect(service.listTaskRunPendingInteractions(task.id, run.id)).resolves.toEqual([
      {
        type: "permission",
        id: "perm-child",
        sessionID: "child-session",
        permission: "external_directory",
        patterns: ["/shared/*"],
        always: [],
        metadata: {},
      },
    ]);
  });

  it("ignores a task permission resolved between listing and auto-approval", async () => {
    const logger = { warn: vi.fn() } as unknown as Logger;
    const { service, opencodeService, taskService, agent } = await setup({ logger });
    const task = await taskService.create({ agentId: agent.id, title: "Task" });
    const run = await taskService.createRun({
      id: "run-stale-permission",
      taskId: task.id,
      agentId: agent.id,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Run.",
    });
    const conversation = await service.createTaskRunConversation({
      agentId: agent.id,
      taskId: task.id,
      taskRunId: run.id,
      title: "Run",
    });
    opencodeService.getSessionTreeIds = vi.fn(() =>
      Promise.resolve(new Set([conversation.opencodeSessionId, "child-session"])),
    );
    opencodeService.listPendingPermissions = vi.fn(() =>
      Promise.resolve([
        {
          id: "perm-stale",
          sessionID: "child-session",
          permission: "external_directory",
          patterns: ["/shared/*"],
          always: [],
          metadata: {},
        },
      ]),
    );
    opencodeService.replyPermission = vi.fn(() =>
      Promise.reject(new NotFoundError('Pending request "perm-stale" no longer exists.')),
    );

    await expect(service.listTaskRunPendingInteractions(task.id, run.id)).resolves.toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("updates titles, resolves the owning agent, and deletes a conversation", async () => {
    const watchdog = { cancel: vi.fn() } as unknown as InteractiveChatWatchdogService;
    const { service, agent } = await setup({ watchdog });
    const snapshot = await service.resolveCurrent(agent.id);
    const conversationId = snapshot.current.id;

    await service.updateTitle(conversationId, "Renamed chat");
    const resolved = await service.resolveConversationAgent(conversationId);
    expect(resolved.agent.id).toBe(agent.id);

    expect(await service.getMedia(conversationId)).toEqual([]);

    await service.deleteConversation(agent.id, conversationId);
    expect(watchdog.cancel).toHaveBeenCalledWith(conversationId);
    // A fresh resolveCurrent creates a new conversation since the old one is gone.
    const after = await service.resolveCurrent(agent.id);
    expect(after.current.id).not.toBe(conversationId);
  });

  it("deletes a conversation that owns artifacts and share links", async () => {
    const { testDb, service, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    const conversationId = snapshot.current.id;

    const artifactService = createArtifactService({
      db: testDb.client.db,
      config: testDb.config,
    });
    const artifact = await artifactService.create({
      conversationId,
      title: "Report",
      type: "url",
      link: "https://example.com/report",
    });
    // A share link carries a NOT NULL foreign key to artifacts.id, so its
    // presence exercises the second FK the delete must clear.
    await testDb.client.db.insert(artifact_share_links).values({
      id: createId(),
      artifact_id: artifact.id,
      token_hash: "hash",
      token_prefix: "prefix",
      created_at: new Date(),
      expires_at: null,
      revoked_at: null,
      last_used_at: null,
      download_count: 0,
    });

    // With foreign_keys=ON this threw SQLITE_CONSTRAINT_FOREIGNKEY before the fix.
    await expect(service.deleteConversation(agent.id, conversationId)).resolves.toBeUndefined();

    const remainingArtifacts = await testDb.client.db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(eq(artifacts.conversation_id, conversationId));
    expect(remainingArtifacts).toHaveLength(0);

    const remainingLinks = await testDb.client.db
      .select({ id: artifact_share_links.id })
      .from(artifact_share_links)
      .where(eq(artifact_share_links.artifact_id, artifact.id));
    expect(remainingLinks).toHaveLength(0);
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
    opencodeService.getSessionTreeIds = vi.fn(() =>
      Promise.resolve(new Set([sessionID, "child-session", "nested-session"])),
    );

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
          sessionID: "child-session",
          permission: "bash",
          patterns: ["pwd"],
          always: [],
          metadata: {},
        },
        {
          id: "perm-3",
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
          sessionID: "nested-session",
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
      {
        id: "perm-2",
        sessionID: "child-session",
        permission: "bash",
        patterns: ["pwd"],
        always: [],
        metadata: {},
      },
    ]);
    const expectedQuestion = {
      id: "q-2",
      sessionID: "nested-session",
      questions: [{ question: "Proceed?", options: [{ label: "Yes" }, { label: "No" }] }],
      tool: { messageID: "msg-2", callID: "call-2" },
    };
    expect(result.question).toEqual(expectedQuestion);
    expect(result.questions).toEqual([expectedQuestion]);
  });

  it("returns no pending question when none match the conversation's session", async () => {
    const { service, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);

    const result = await service.listPendingInteractions(snapshot.current.id);

    expect(result).toEqual({ permissions: [], question: null, questions: [] });
  });
});
