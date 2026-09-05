import { afterEach, describe, expect, it, vi } from "vitest";

import { eq, inArray } from "drizzle-orm";
import type { Logger } from "pino";

import { createId } from "../../src/db/ids";
import {
  artifact_share_links,
  artifacts,
  conversations,
  task_runs,
} from "../../src/db/schema/index";
import { createArtifactService } from "../../src/services/artifact-service";
import { NotFoundError } from "../../src/lib/api-error";
import { createConversationService } from "../../src/services/conversation-service";
import { createSpecialistService } from "../../src/services/specialist-service";
import { createTaskService } from "../../src/services/task-service";
import {
  OpenCodeRequestError,
  type OpenCodeService,
  type OpenCodeSession,
} from "../../src/services/opencode-service";
import {
  createInteractiveChatWatchdogService,
  type InteractiveChatWatchdogService,
} from "../../src/services/interactive-chat-watchdog-service";
import { createTestDatabase } from "../helpers/db";

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.useRealTimers();
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
    watchdogRecoveryRetryDelaysMs?: readonly number[];
    opencodeRequestMs?: number;
    watchdogRecoveryListActiveChats?: () => Promise<(typeof conversations.$inferSelect)[]>;
  } = {},
) {
  const testDb = await createTestDatabase();
  disposers.push(() => testDb.cleanup());
  if (options.opencodeRequestMs !== undefined) {
    testDb.config.timeouts.opencodeRequestMs = options.opencodeRequestMs;
  }
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
    watchdogRecoveryRetryDelaysMs: options.watchdogRecoveryRetryDelaysMs,
    watchdogRecoveryListActiveChats: options.watchdogRecoveryListActiveChats,
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
  it("re-arms active busy and retrying chats after restart", async () => {
    const watchdog = {
      rearm: vi.fn(() => Promise.resolve()),
    } as unknown as InteractiveChatWatchdogService;
    const { testDb, service, opencodeService, agent } = await setup({ watchdog });
    const busy = await service.resolveCurrent(agent.id);
    const retrying = await service.startFresh(agent.id);
    const idle = await service.startFresh(agent.id);
    await testDb.client.db.insert(conversations).values({
      id: createId(),
      agent_id: agent.id,
      opencode_session_id: "task-session",
      title: "Task run",
      status: "active",
      source: "task_run",
      is_current: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    opencodeService.getSessionStatus = vi.fn((_directory: string, sessionID: string) => {
      if (sessionID === busy.current.opencodeSessionId) {
        return Promise.resolve({ type: "busy" as const });
      }
      if (sessionID === retrying.current.opencodeSessionId) {
        return Promise.resolve({
          type: "retry" as const,
          attempt: 1,
          message: "retrying",
          next: 1,
        });
      }
      return Promise.resolve({ type: "idle" as const });
    });

    await service.resumeInteractiveChatWatchdogs();

    expect(watchdog.rearm).toHaveBeenCalledTimes(2);
    expect(watchdog.rearm).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: busy.current.id,
        directory: agent.workspacePath,
        sessionID: busy.current.opencodeSessionId,
      }),
    );
    expect(watchdog.rearm).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: retrying.current.id,
        directory: agent.workspacePath,
        sessionID: retrying.current.opencodeSessionId,
      }),
    );
    expect(opencodeService.getSessionStatus).not.toHaveBeenCalledWith(
      expect.anything(),
      "task-session",
    );
    expect(watchdog.rearm).not.toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: idle.current.opencodeSessionId }),
    );
  });

  it("re-arms active converted task-run conversations after restart", async () => {
    const watchdog = {
      rearm: vi.fn(() => Promise.resolve()),
    } as unknown as InteractiveChatWatchdogService;
    const { testDb, service, opencodeService, taskService, agent } = await setup({ watchdog });
    const task = await taskService.create({ agentId: agent.id, title: "Converted recovery" });
    const busyRun = await taskService.createRun({
      taskId: task.id,
      agentId: agent.id,
      status: "completed",
      triggerSource: "manual",
      renderedPrompt: "Busy conversion.",
    });
    const retryingRun = await taskService.createRun({
      taskId: task.id,
      agentId: agent.id,
      status: "completed",
      triggerSource: "manual",
      renderedPrompt: "Retrying conversion.",
    });
    const busy = await service.createTaskRunConversation({
      agentId: agent.id,
      taskId: task.id,
      taskRunId: busyRun.id,
      title: "Busy converted chat",
    });
    const retrying = await service.createTaskRunConversation({
      agentId: agent.id,
      taskId: task.id,
      taskRunId: retryingRun.id,
      title: "Retrying converted chat",
    });
    await testDb.client.db
      .update(conversations)
      .set({ converted_at: new Date() })
      .where(inArray(conversations.id, [busy.id, retrying.id]));
    opencodeService.getSessionStatus = vi.fn((_directory: string, sessionID: string) => {
      if (sessionID === busy.opencodeSessionId) {
        return Promise.resolve({ type: "busy" as const });
      }
      return Promise.resolve({
        type: "retry" as const,
        attempt: 1,
        message: "retrying",
        next: 1,
      });
    });

    await service.resumeInteractiveChatWatchdogs();

    expect(watchdog.rearm).toHaveBeenCalledTimes(2);
    expect(watchdog.rearm).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: busy.id, sessionID: busy.opencodeSessionId }),
    );
    expect(watchdog.rearm).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: retrying.id,
        sessionID: retrying.opencodeSessionId,
      }),
    );
  });

  it("retries only chats whose watchdog restoration failed", async () => {
    vi.useFakeTimers();
    const recoveryError = new Error("snapshot failed");
    const logger = { warn: vi.fn() } as unknown as Logger;
    const watchdog = {
      rearm: vi.fn(),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({
      watchdog,
      logger,
      watchdogRecoveryRetryDelaysMs: [10],
    });
    const failed = await service.resolveCurrent(agent.id);
    const successful = await service.startFresh(agent.id);
    opencodeService.getSessionStatus = vi.fn(() => Promise.resolve({ type: "busy" as const }));
    vi.mocked(watchdog.rearm).mockImplementation(({ conversationId }) => {
      if (
        conversationId === failed.current.id &&
        vi.mocked(watchdog.rearm).mock.calls.length === 1
      ) {
        return Promise.reject(recoveryError);
      }
      return Promise.resolve();
    });

    const recovery = service.resumeInteractiveChatWatchdogs();
    await vi.advanceTimersByTimeAsync(10);
    await expect(recovery).resolves.toBeUndefined();

    expect(watchdog.rearm).toHaveBeenCalledTimes(3);
    expect(watchdog.rearm).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: failed.current.id }),
    );
    expect(
      vi
        .mocked(watchdog.rearm)
        .mock.calls.filter(([input]) => input.conversationId === successful.current.id),
    ).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: recoveryError, attempt: 1, nextDelayMs: 10 }),
      "interactive chat watchdog restart recovery failed; retrying",
    );
  });

  it("keeps retrying watchdog restoration at the capped final delay", async () => {
    vi.useFakeTimers();
    const logger = { warn: vi.fn() } as unknown as Logger;
    const watchdog = {
      rearm: vi
        .fn()
        .mockRejectedValueOnce(new Error("snapshot failed"))
        .mockRejectedValueOnce(new Error("snapshot failed"))
        .mockRejectedValueOnce(new Error("snapshot failed"))
        .mockResolvedValueOnce(undefined),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({
      watchdog,
      logger,
      watchdogRecoveryRetryDelaysMs: [10, 20],
    });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.getSessionStatus = vi.fn(() => Promise.resolve({ type: "busy" as const }));

    const recovery = service.resumeInteractiveChatWatchdogs();
    await vi.advanceTimersByTimeAsync(50);
    await expect(recovery).resolves.toBeUndefined();

    expect(watchdog.rearm).toHaveBeenCalledTimes(4);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: snapshot.current.id,
        sessionID: snapshot.current.opencodeSessionId,
        attempt: 3,
        nextDelayMs: 20,
      }),
      "interactive chat watchdog restart recovery failed; retrying",
    );
  });

  it("bounds restart status reads and retries after a request timeout", async () => {
    vi.useRealTimers();
    const watchdog = {
      rearm: vi.fn(() => Promise.resolve()),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({
      watchdog,
      watchdogRecoveryRetryDelaysMs: [10],
      opencodeRequestMs: 5,
    });
    await service.resolveCurrent(agent.id);
    opencodeService.getSessionStatus = vi
      .fn()
      .mockImplementationOnce(
        (_directory: string, _sessionID: string, signal?: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(signal.reason instanceof Error ? signal.reason : new Error("aborted")),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce({ type: "busy" as const });

    const recovery = service.resumeInteractiveChatWatchdogs();
    await recovery;

    expect(opencodeService.getSessionStatus).toHaveBeenCalledTimes(2);
    expect(watchdog.rearm).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps retrying restart scans at the capped final delay", async () => {
    const listActiveChats = vi.fn<() => Promise<(typeof conversations.$inferSelect)[]>>();
    const watchdog = {
      rearm: vi.fn(() => Promise.resolve()),
    } as unknown as InteractiveChatWatchdogService;
    const { testDb, service, agent } = await setup({
      watchdog,
      watchdogRecoveryRetryDelaysMs: [1],
      watchdogRecoveryListActiveChats: listActiveChats,
    });
    await service.resolveCurrent(agent.id);
    const activeChats = await testDb.client.db.query.conversations.findMany();
    listActiveChats
      .mockRejectedValueOnce(new Error("database busy"))
      .mockRejectedValueOnce(new Error("database busy"))
      .mockResolvedValueOnce(activeChats);

    await service.resumeInteractiveChatWatchdogs();

    expect(listActiveChats).toHaveBeenCalledTimes(3);
  });

  it("cancels pending watchdog restoration retries when disposed", async () => {
    vi.useFakeTimers();
    const watchdog = {
      rearm: vi.fn(() => Promise.reject(new Error("snapshot failed"))),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({
      watchdog,
      watchdogRecoveryRetryDelaysMs: [10, 20],
    });
    await service.resolveCurrent(agent.id);
    opencodeService.getSessionStatus = vi.fn(() => Promise.resolve({ type: "busy" as const }));

    const recovery = service.resumeInteractiveChatWatchdogs();
    await vi.advanceTimersByTimeAsync(0);
    expect(watchdog.rearm).toHaveBeenCalledOnce();
    service.dispose();
    await vi.runAllTimersAsync();
    await recovery;

    expect(watchdog.rearm).toHaveBeenCalledOnce();
  });

  it("does not retry watchdog restoration after the conversation is deleted", async () => {
    vi.useFakeTimers();
    const watchdog = {
      rearm: vi.fn(() => Promise.reject(new Error("snapshot failed"))),
    } as unknown as InteractiveChatWatchdogService;
    const { testDb, service, opencodeService, agent } = await setup({
      watchdog,
      watchdogRecoveryRetryDelaysMs: [10],
    });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.getSessionStatus = vi.fn(() => Promise.resolve({ type: "busy" as const }));

    const recovery = service.resumeInteractiveChatWatchdogs();
    await vi.advanceTimersByTimeAsync(0);
    expect(watchdog.rearm).toHaveBeenCalledOnce();
    await testDb.client.db.delete(conversations).where(eq(conversations.id, snapshot.current.id));
    await vi.advanceTimersByTimeAsync(10);
    await recovery;

    expect(watchdog.rearm).toHaveBeenCalledOnce();
  });

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

  it("protects a synchronous prompt until it settles", async () => {
    const prompt = createDeferred<Awaited<ReturnType<OpenCodeService["promptSession"]>>>();
    const arm = vi.fn();
    const cancel = vi.fn();
    const watchdog = {
      prepare: vi.fn(() => Promise.resolve({ arm, cancel })),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({ watchdog });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.promptSession = vi.fn(() => prompt.promise);

    const sending = service.sendPrompt(snapshot.current.id, { text: "work", attachments: [] });
    await vi.waitFor(() => expect(opencodeService.promptSession).toHaveBeenCalledOnce());

    expect(arm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    expect(opencodeService.promptSession).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    prompt.resolve({
      info: {
        id: "message-sync",
        sessionID: snapshot.current.opencodeSessionId,
        role: "assistant",
        time: { created: 1 },
      },
      parts: [{ id: "part-sync", type: "text", text: "done" }],
    });
    await sending;

    expect(cancel).toHaveBeenCalledOnce();
  });

  it("retains watchdog protection when a synchronous prompt times out", async () => {
    const arm = vi.fn();
    const cancel = vi.fn();
    const watchdog = {
      prepare: vi.fn(() => Promise.resolve({ arm, cancel })),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({ watchdog, opencodeRequestMs: 10 });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.promptSession = vi.fn(({ signal }: { signal?: AbortSignal }) =>
      neverSettlesUntilAborted<Awaited<ReturnType<OpenCodeService["promptSession"]>>>(signal),
    );

    await expect(
      service.sendPrompt(snapshot.current.id, { text: "work", attachments: [] }),
    ).rejects.toBeDefined();

    expect(arm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("submits an async prompt when watchdog preparation fails", async () => {
    const error = new Error("snapshot failed");
    const logger = { warn: vi.fn() } as unknown as Logger;
    const arm = vi.fn();
    const cancel = vi.fn();
    const watchdog = {
      prepare: vi.fn(() => Promise.reject(error)),
      prepareFallback: vi.fn(() => Promise.resolve({ arm, cancel })),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({ watchdog, logger });
    const snapshot = await service.resolveCurrent(agent.id);

    await service.sendPromptAsync(snapshot.current.id, { text: "work", attachments: [] });

    expect(opencodeService.promptSessionAsync).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(arm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { err: error, conversationId: snapshot.current.id },
      "interactive chat watchdog preparation failed",
    );
  });

  it("arms fallback protection when prompt acceptance fails ambiguously", async () => {
    const arm = vi.fn();
    const cancel = vi.fn();
    const watchdog = {
      prepare: vi.fn(() => Promise.reject(new Error("baseline unavailable"))),
      prepareFallback: vi.fn(() => Promise.resolve({ arm, cancel })),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({ watchdog });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.promptSessionAsync = vi.fn(() => Promise.reject(new TypeError("network lost")));

    await expect(
      service.sendPromptAsync(snapshot.current.id, { text: "work", attachments: [] }),
    ).rejects.toThrow("network lost");

    expect(arm).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels fallback protection when prompt acceptance is definitively rejected", async () => {
    const arm = vi.fn();
    const cancel = vi.fn();
    const watchdog = {
      prepare: vi.fn(() => Promise.reject(new Error("baseline unavailable"))),
      prepareFallback: vi.fn(() => Promise.resolve({ arm, cancel })),
    } as unknown as InteractiveChatWatchdogService;
    const { service, opencodeService, agent } = await setup({ watchdog });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.promptSessionAsync = vi.fn(() =>
      Promise.reject(new OpenCodeRequestError("rejected", 400)),
    );

    await expect(
      service.sendPromptAsync(snapshot.current.id, { text: "work", attachments: [] }),
    ).rejects.toThrow("rejected");

    expect(arm).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
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

  it("serializes manual abort after deferred prompt acceptance", async () => {
    const prompt = createDeferred<void>();
    const { service, opencodeService, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.promptSessionAsync = vi.fn(() => prompt.promise);

    const sending = service.sendPromptAsync(snapshot.current.id, {
      text: "work",
      attachments: [],
    });
    await vi.waitFor(() => expect(opencodeService.promptSessionAsync).toHaveBeenCalledOnce());
    const aborting = service.abortConversation(snapshot.current.id);

    expect(opencodeService.abortSession).not.toHaveBeenCalled();

    prompt.resolve();
    await Promise.all([sending, aborting]);
    expect(opencodeService.abortSession).toHaveBeenCalledOnce();
  });

  it("releases serialized conversation operations when abort stalls", async () => {
    const { service, opencodeService, agent } = await setup({ opencodeRequestMs: 10 });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.abortSession = vi.fn(
      (_directory: string, _sessionID: string, signal?: AbortSignal) =>
        neverSettlesUntilAborted(signal),
    );

    const aborting = service.abortConversation(snapshot.current.id);
    const abortResult = expect(aborting).rejects.toBeDefined();
    await vi.waitFor(() => expect(opencodeService.abortSession).toHaveBeenCalledOnce());
    const sending = service.sendPromptAsync(snapshot.current.id, {
      text: "work after timeout",
      attachments: [],
    });

    await abortResult;
    await expect(sending).resolves.toBeUndefined();
    expect(opencodeService.promptSessionAsync).toHaveBeenCalledOnce();
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
      .mockRejectedValueOnce(new OpenCodeRequestError("prompt rejected", 400));

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

  it.each([
    { depth: "direct", sessionID: "child-session", interaction: "permission", action: "once" },
    { depth: "direct", sessionID: "child-session", interaction: "permission", action: "reject" },
    { depth: "nested", sessionID: "nested-session", interaction: "permission", action: "once" },
    { depth: "nested", sessionID: "nested-session", interaction: "permission", action: "reject" },
    { depth: "direct", sessionID: "child-session", interaction: "question", action: "reply" },
    { depth: "direct", sessionID: "child-session", interaction: "question", action: "reject" },
    { depth: "nested", sessionID: "nested-session", interaction: "question", action: "reply" },
    { depth: "nested", sessionID: "nested-session", interaction: "question", action: "reject" },
  ] as const)(
    "$action a pending $depth descendant $interaction",
    async ({ sessionID, interaction, action }) => {
      const { service, opencodeService, agent } = await setup();
      const snapshot = await service.resolveCurrent(agent.id);
      opencodeService.getSessionTreeIds = vi.fn(() =>
        Promise.resolve(
          new Set([snapshot.current.opencodeSessionId, "child-session", "nested-session"]),
        ),
      );
      opencodeService.listPendingPermissions = vi.fn(() =>
        Promise.resolve([
          {
            id: "permission-descendant",
            sessionID,
            permission: "external_directory",
            patterns: ["/shared/*"],
            always: [],
            metadata: {},
          },
        ]),
      );
      opencodeService.listPendingQuestions = vi.fn(() =>
        Promise.resolve([
          {
            id: "question-descendant",
            sessionID,
            questions: [{ question: "Proceed?", options: [] }],
          },
        ]),
      );

      if (interaction === "permission") {
        await service.replyPermission(snapshot.current.id, "permission-descendant", action);
        expect(opencodeService.replyPermission).toHaveBeenCalledWith(
          agent.workspacePath,
          "permission-descendant",
          action,
          expect.any(AbortSignal),
        );
      } else if (action === "reply") {
        await service.replyQuestion(snapshot.current.id, "question-descendant", [["yes"]]);
        expect(opencodeService.replyQuestion).toHaveBeenCalledWith(
          agent.workspacePath,
          "question-descendant",
          [["yes"]],
          expect.any(AbortSignal),
        );
      } else {
        await service.rejectQuestion(snapshot.current.id, "question-descendant");
        expect(opencodeService.rejectQuestion).toHaveBeenCalledWith(
          agent.workspacePath,
          "question-descendant",
          expect.any(AbortSignal),
        );
      }
    },
  );

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
      effectivePermissions: { approvalPolicy: "auto_approve" },
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
      expect.any(AbortSignal),
    );
  });

  it("releases task-run cancellation when a permission reply stalls", async () => {
    const { service, opencodeService, taskService, agent } = await setup({ opencodeRequestMs: 10 });
    const task = await taskService.create({ agentId: agent.id, title: "Task" });
    const run = await taskService.createRun({
      id: "run-stalled-reply",
      taskId: task.id,
      agentId: agent.id,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Run.",
      effectivePermissions: { approvalPolicy: "auto_approve" },
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
          id: "perm-stalled",
          sessionID: "child-session",
          permission: "external_directory",
          patterns: ["/shared/*"],
          always: [],
          metadata: {},
        },
      ]),
    );
    opencodeService.replyPermission = vi.fn(
      (_directory: string, _requestId: string, _reply: string, signal?: AbortSignal) =>
        neverSettlesUntilAborted(signal),
    );

    const listing = service.listTaskRunPendingInteractions(task.id, run.id);
    await vi.waitFor(() => expect(opencodeService.replyPermission).toHaveBeenCalledOnce());
    service.taskRunOperationGuard.requestCancellation(run.id);
    const cancelling = service.taskRunOperationGuard.runExclusive(run.id, () =>
      Promise.resolve(true),
    );

    await expect(listing).resolves.toEqual([
      expect.objectContaining({ type: "permission", id: "perm-stalled" }),
    ]);
    await expect(cancelling).resolves.toBe(true);
  });

  it.each([
    { policy: "missing", value: null },
    { policy: "inherit", value: JSON.stringify({ approvalPolicy: "inherit" }) },
    { policy: "deny", value: JSON.stringify({ approvalPolicy: "deny" }) },
    { policy: "invalid", value: "not-json" },
  ])("surfaces task permissions when the frozen policy is $policy", async ({ value }) => {
    const { testDb, service, opencodeService, taskService, agent } = await setup();
    const task = await taskService.create({ agentId: agent.id, title: "Task" });
    const run = await taskService.createRun({
      id: `run-${String(value)}`,
      taskId: task.id,
      agentId: agent.id,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Run.",
      effectivePermissions: { approvalPolicy: "auto_approve" },
    });
    await testDb.client.db
      .update(task_runs)
      .set({ effective_permissions_json: value })
      .where(eq(task_runs.id, run.id));
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

    const pending = await service.listTaskRunPendingInteractions(task.id, run.id);

    expect(pending).toEqual([expect.objectContaining({ type: "permission", id: "perm-child" })]);
    expect(opencodeService.replyPermission).not.toHaveBeenCalled();
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
      effectivePermissions: { approvalPolicy: "auto_approve" },
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

  it("reconciles a task permission after an ambiguous auto-approval failure", async () => {
    const { service, opencodeService, taskService, agent } = await setup();
    const task = await taskService.create({ agentId: agent.id, title: "Task" });
    const run = await taskService.createRun({
      id: "run-ambiguous-reply",
      taskId: task.id,
      agentId: agent.id,
      status: "running",
      triggerSource: "manual",
      renderedPrompt: "Run.",
      effectivePermissions: { approvalPolicy: "auto_approve" },
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
    opencodeService.listPendingPermissions = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "perm-applied",
          sessionID: "child-session",
          permission: "external_directory",
          patterns: ["/shared/*"],
          always: [],
          metadata: {},
        },
      ])
      .mockResolvedValueOnce([]);
    opencodeService.replyPermission = vi.fn(() =>
      Promise.reject(new Error("reply response timed out")),
    );

    await expect(service.listTaskRunPendingInteractions(task.id, run.id)).resolves.toEqual([]);
    expect(opencodeService.listPendingPermissions).toHaveBeenCalledTimes(2);
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
      effectivePermissions: { approvalPolicy: "auto_approve" },
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

  it("rejects a send queued behind conversation deletion", async () => {
    const deleting = createDeferred<void>();
    const { service, opencodeService, agent } = await setup();
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.deleteSession = vi.fn(() => deleting.promise);

    const deletion = service.deleteConversation(agent.id, snapshot.current.id);
    await vi.waitFor(() => expect(opencodeService.deleteSession).toHaveBeenCalledOnce());
    const sending = service.sendPromptAsync(snapshot.current.id, {
      text: "stale work",
      attachments: [],
    });

    expect(opencodeService.promptSessionAsync).not.toHaveBeenCalled();

    deleting.resolve();
    await deletion;
    await expect(sending).rejects.toThrow("Conversation not found.");
    expect(opencodeService.promptSessionAsync).not.toHaveBeenCalled();
  });

  it("completes local deletion when the OpenCode delete request stalls", async () => {
    const { service, opencodeService, agent } = await setup({ opencodeRequestMs: 10 });
    const snapshot = await service.resolveCurrent(agent.id);
    opencodeService.deleteSession = vi.fn(
      (_directory: string, _sessionID: string, signal?: AbortSignal) =>
        neverSettlesUntilAborted(signal),
    );

    await expect(
      service.deleteConversation(agent.id, snapshot.current.id),
    ).resolves.toBeUndefined();
    await expect(
      service.sendPromptAsync(snapshot.current.id, { text: "stale work", attachments: [] }),
    ).rejects.toThrow("Conversation not found.");
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

  it.each(["permissions", "questions"] as const)(
    "bounds stalled pending %s hydration",
    async (interaction) => {
      const { service, opencodeService, agent } = await setup({ opencodeRequestMs: 10 });
      const snapshot = await service.resolveCurrent(agent.id);
      if (interaction === "permissions") {
        opencodeService.listPendingPermissions = vi.fn((_directory: string, signal?: AbortSignal) =>
          neverSettlesUntilAborted<Awaited<ReturnType<OpenCodeService["listPendingPermissions"]>>>(
            signal,
          ),
        );
      } else {
        opencodeService.listPendingQuestions = vi.fn((_directory: string, signal?: AbortSignal) =>
          neverSettlesUntilAborted<Awaited<ReturnType<OpenCodeService["listPendingQuestions"]>>>(
            signal,
          ),
        );
      }

      await expect(service.listPendingInteractions(snapshot.current.id)).rejects.toBeDefined();
    },
  );

  it.each(["permission", "question reply", "question rejection"] as const)(
    "bounds a stalled manual %s operation with one request budget",
    async (interaction) => {
      const { service, opencodeService, agent } = await setup({ opencodeRequestMs: 10 });
      const snapshot = await service.resolveCurrent(agent.id);
      const sessionID = snapshot.current.opencodeSessionId;
      let operationSignal: AbortSignal | undefined;
      const getSessionTreeIds = vi.fn(
        (_directory: string, _sessionID: string, _signal?: AbortSignal) =>
          Promise.resolve(new Set([sessionID])),
      );
      opencodeService.getSessionTreeIds = getSessionTreeIds;

      if (interaction === "permission") {
        const listPendingPermissions = vi.fn((_directory: string, signal?: AbortSignal) => {
          operationSignal = signal;
          return Promise.resolve([
            {
              id: "permission-stalled",
              sessionID,
              permission: "read",
              patterns: ["*"],
              always: [],
              metadata: {},
            },
          ]);
        });
        opencodeService.listPendingPermissions = listPendingPermissions;
        opencodeService.replyPermission = vi.fn(
          (_directory: string, _requestId: string, _reply: "once", signal?: AbortSignal) => {
            expect(signal).toBe(operationSignal);
            return neverSettlesUntilAborted(signal);
          },
        );

        await expect(
          service.replyPermission(snapshot.current.id, "permission-stalled", "once"),
        ).rejects.toBeDefined();
        expect(listPendingPermissions).toHaveBeenCalledWith(
          agent.workspacePath,
          expect.any(AbortSignal),
        );
      } else {
        const listPendingQuestions = vi.fn((_directory: string, signal?: AbortSignal) => {
          operationSignal = signal;
          return Promise.resolve([
            {
              id: "question-stalled",
              sessionID,
              questions: [{ question: "Proceed?", options: [] }],
            },
          ]);
        });
        opencodeService.listPendingQuestions = listPendingQuestions;
        if (interaction === "question reply") {
          opencodeService.replyQuestion = vi.fn(
            (
              _directory: string,
              _requestId: string,
              _answers: string[][],
              signal?: AbortSignal,
            ) => {
              expect(signal).toBe(operationSignal);
              return neverSettlesUntilAborted(signal);
            },
          );
          await expect(
            service.replyQuestion(snapshot.current.id, "question-stalled", [["yes"]]),
          ).rejects.toBeDefined();
        } else {
          opencodeService.rejectQuestion = vi.fn(
            (_directory: string, _requestId: string, signal?: AbortSignal) => {
              expect(signal).toBe(operationSignal);
              return neverSettlesUntilAborted(signal);
            },
          );
          await expect(
            service.rejectQuestion(snapshot.current.id, "question-stalled"),
          ).rejects.toBeDefined();
        }
      }

      expect(getSessionTreeIds).toHaveBeenCalledWith(
        agent.workspacePath,
        sessionID,
        operationSignal,
      );
    },
  );
});

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function neverSettlesUntilAborted<T = void>(signal?: AbortSignal): Promise<T> {
  return new Promise<T>((_resolve, reject) => {
    signal?.addEventListener(
      "abort",
      () => reject(signal.reason instanceof Error ? signal.reason : new Error("aborted")),
      { once: true },
    );
  });
}
