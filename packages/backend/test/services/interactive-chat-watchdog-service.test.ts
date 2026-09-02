import { afterEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";

import { createInteractiveChatWatchdogService } from "../../src/services/interactive-chat-watchdog-service.js";
import type { OpenCodeSessionStatusMap } from "../../src/services/opencode-service.js";
import { createMockOpenCodeService } from "../helpers/fake-opencode.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("interactive-chat-watchdog-service", () => {
  it("aborts a busy root and publishes a replayable error after 30 minutes without progress", async () => {
    vi.useFakeTimers();
    let now = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() => Promise.resolve({}));
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 30 * 60 * 1_000,
      pollMs: 1_000,
      now: () => now,
    });
    const listener = vi.fn();
    const controller = new AbortController();
    service.subscribe({
      conversationId: "conversation-1",
      signal: controller.signal,
      onEvent: listener,
    });
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    prepared.arm();

    now = 30 * 60 * 1_000;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(opencodeService.abortSession).toHaveBeenCalledWith(
      "/work",
      "root",
      expect.any(AbortSignal),
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "session.error",
        properties: expect.objectContaining({ sessionID: "root" }),
      }),
    );
    expect(service.getError("conversation-1")).toEqual(listener.mock.calls[0]?.[0]);
    controller.abort();
  });

  it("continues publishing after a watchdog subscriber throws", async () => {
    vi.useFakeTimers();
    let now = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() => Promise.resolve({}));
    const logger = createLogger();
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger,
      noProgressMs: 100,
      pollMs: 10,
      now: () => now,
    });
    const subscriberError = new Error("listener failed");
    const listener = vi.fn();
    service.subscribe({
      conversationId: "conversation-1",
      signal: AbortSignal.timeout(1_000),
      onEvent: () => {
        throw subscriberError;
      },
    });
    service.subscribe({
      conversationId: "conversation-1",
      signal: AbortSignal.timeout(1_000),
      onEvent: listener,
    });
    await service.rearm({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });

    now = 100;
    await vi.advanceTimersByTimeAsync(10);

    expect(listener).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      {
        err: subscriberError,
        conversationId: "conversation-1",
        sessionID: "root",
      },
      "interactive chat watchdog subscriber failed",
    );
  });

  it("stops polling after a watchdog subscriber throws", async () => {
    vi.useFakeTimers();
    let now = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() => Promise.resolve({}));
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 100,
      pollMs: 10,
      now: () => now,
    });
    service.subscribe({
      conversationId: "conversation-1",
      signal: AbortSignal.timeout(1_000),
      onEvent: () => {
        throw new Error("listener failed");
      },
    });
    await service.rearm({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });

    now = 100;
    await vi.advanceTimersByTimeAsync(100);

    expect(opencodeService.abortSession).toHaveBeenCalledOnce();
  });

  it("counts nested descendant message changes as progress", async () => {
    vi.useFakeTimers();
    let now = 0;
    let nestedText = "working";
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() =>
      Promise.resolve(new Set(["root", "child", "nested"])),
    );
    opencodeService.listSessionMessages = vi.fn((_directory: string, sessionID: string) =>
      Promise.resolve(
        sessionID === "nested"
          ? [
              {
                info: {
                  id: "message",
                  sessionID,
                  role: "assistant" as const,
                  time: { created: 1 },
                },
                parts: [{ id: "part", type: "text", text: nestedText }],
              },
            ]
          : [],
      ),
    );
    opencodeService.listSessionStatuses = vi.fn(() =>
      Promise.resolve({ root: { type: "busy" as const } }),
    );
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 100,
      pollMs: 10,
      now: () => now,
    });
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    prepared.arm();

    now = 100;
    nestedText = "still working";
    await vi.advanceTimersByTimeAsync(10);
    now = 150;
    await vi.advanceTimersByTimeAsync(10);

    expect(opencodeService.abortSession).not.toHaveBeenCalled();
  });

  it("does not arm a prepared watchdog after cancellation", async () => {
    vi.useFakeTimers();
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() =>
      Promise.resolve({ root: { type: "busy" as const } }),
    );
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 1,
      pollMs: 1,
    });
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });

    prepared.cancel();
    prepared.arm();
    await vi.advanceTimersByTimeAsync(10);

    expect(opencodeService.listSessionStatuses).not.toHaveBeenCalled();
  });

  it("disarms fallback protection when no prompt was accepted", async () => {
    vi.useFakeTimers();
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() =>
      Promise.resolve({ root: { type: "idle" as const } }),
    );
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 10,
      pollMs: 1,
    });
    const fallback = await service.prepareFallback({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    fallback.arm();

    await vi.advanceTimersByTimeAsync(20);

    expect(opencodeService.listSessionStatuses).toHaveBeenCalledOnce();
    expect(opencodeService.abortSession).not.toHaveBeenCalled();
  });

  it("does not abort or publish after cancellation during a poll", async () => {
    vi.useFakeTimers();
    let now = 0;
    let resolveStatuses: ((statuses: { root: { type: "busy" } }) => void) | undefined;
    const statuses = new Promise<{ root: { type: "busy" } }>((resolve) => {
      resolveStatuses = resolve;
    });
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() => statuses);
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 1,
      pollMs: 1,
      now: () => now,
    });
    const listener = vi.fn();
    service.subscribe({
      conversationId: "conversation-1",
      signal: AbortSignal.timeout(1_000),
      onEvent: listener,
    });
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    prepared.arm();

    now = 1;
    void vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(opencodeService.listSessionStatuses).toHaveBeenCalledOnce());
    prepared.cancel();
    resolveStatuses?.({ root: { type: "busy" } });
    await vi.runAllTimersAsync();

    expect(opencodeService.abortSession).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("waits for an in-flight abort before preparing a replacement prompt", async () => {
    vi.useFakeTimers();
    let now = 0;
    let resolveAbort: (() => void) | undefined;
    const abortPending = new Promise<void>((resolve) => {
      resolveAbort = resolve;
    });
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() =>
      Promise.resolve({ root: { type: "busy" as const } }),
    );
    opencodeService.abortSession = vi.fn(() => abortPending);
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 1,
      pollMs: 1,
      now: () => now,
    });
    const listener = vi.fn();
    service.subscribe({
      conversationId: "conversation-1",
      signal: AbortSignal.timeout(1_000),
      onEvent: listener,
    });
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    prepared.arm();

    now = 1;
    void vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(opencodeService.abortSession).toHaveBeenCalledOnce());
    const abortSignal = vi.mocked(opencodeService.abortSession).mock.calls[0]?.[2];
    let replacementReady = false;
    const replacement = service
      .prepare({
        conversationId: "conversation-1",
        directory: "/work",
        sessionID: "root",
      })
      .then((value) => {
        replacementReady = true;
        return value;
      });

    await Promise.resolve();
    expect(abortSignal?.aborted).toBe(false);
    expect(replacementReady).toBe(false);

    resolveAbort?.();
    await replacement;

    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps the active watchdog when replacement preparation fails", async () => {
    vi.useFakeTimers();
    let now = 0;
    let preparationCount = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => {
      preparationCount += 1;
      return preparationCount === 2
        ? Promise.reject(new Error("replacement snapshot failed"))
        : Promise.resolve(new Set(["root"]));
    });
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() =>
      Promise.resolve({ root: { type: "busy" as const } }),
    );
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 100,
      pollMs: 10,
      now: () => now,
    });
    const active = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    active.arm();

    await expect(
      service.prepare({
        conversationId: "conversation-1",
        directory: "/work",
        sessionID: "root",
      }),
    ).rejects.toThrow("replacement snapshot failed");
    now = 10;
    await vi.advanceTimersByTimeAsync(10);

    expect(opencodeService.listSessionStatuses).toHaveBeenCalledOnce();
  });

  it("does not abort the active turn while a replacement is being prepared", async () => {
    vi.useFakeTimers();
    let now = 0;
    let rejectReplacement: ((error: Error) => void) | undefined;
    const replacementSnapshot = new Promise<Set<string>>((_resolve, reject) => {
      rejectReplacement = reject;
    });
    let treeReads = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => {
      treeReads += 1;
      return treeReads === 2 ? replacementSnapshot : Promise.resolve(new Set(["root"]));
    });
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() =>
      Promise.resolve({ root: { type: "busy" as const } }),
    );
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 100,
      pollMs: 10,
      now: () => now,
    });
    const active = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    active.arm();
    const replacement = service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    const rejection = expect(replacement).rejects.toThrow("replacement failed");

    now = 100;
    await vi.advanceTimersByTimeAsync(10);
    expect(opencodeService.abortSession).not.toHaveBeenCalled();

    rejectReplacement?.(new Error("replacement failed"));
    await rejection;
    await vi.advanceTimersByTimeAsync(10);
    expect(opencodeService.abortSession).toHaveBeenCalledOnce();
  });

  it("bounds preparation when a baseline session-tree read never settles", async () => {
    vi.useFakeTimers();
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(
      (_directory: string, _sessionID: string, signal?: AbortSignal) =>
        new Promise<Set<string>>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      prepareTimeoutMs: 10,
    });

    const preparation = service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    const rejection = expect(preparation).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10);

    await rejection;
  });

  it("does not abort while a verified descendant interaction is actionable", async () => {
    vi.useFakeTimers();
    let now = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() =>
      Promise.resolve(new Set(["root", "child-session"])),
    );
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() =>
      Promise.resolve({ root: { type: "busy" as const } }),
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
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 100,
      pollMs: 10,
      now: () => now,
    });
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    prepared.arm();

    now = 100;
    await vi.advanceTimersByTimeAsync(10);

    expect(opencodeService.abortSession).not.toHaveBeenCalled();
  });

  it("retries a failed root abort without publishing a false recovery", async () => {
    vi.useFakeTimers();
    let now = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() =>
      Promise.resolve({ root: { type: "busy" as const } }),
    );
    opencodeService.abortSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("abort failed"))
      .mockResolvedValue(undefined);
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 100,
      pollMs: 10,
      now: () => now,
    });
    const listener = vi.fn();
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    service.subscribe({
      conversationId: "conversation-1",
      signal: AbortSignal.timeout(1_000),
      onEvent: listener,
    });
    prepared.arm();

    now = 100;
    await vi.advanceTimersByTimeAsync(10);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);

    expect(opencodeService.abortSession).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("cancels a hanging armed poll read and resumes polling", async () => {
    vi.useFakeTimers();
    let statusReads = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn((_directory: string, signal?: AbortSignal) => {
      statusReads += 1;
      if (statusReads > 1) return Promise.resolve({ root: { type: "busy" as const } });
      return new Promise<OpenCodeSessionStatusMap>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 1_000,
      pollMs: 10,
      pollTimeoutMs: 5,
    });
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    prepared.arm();

    await vi.advanceTimersByTimeAsync(25);

    expect(opencodeService.listSessionStatuses).toHaveBeenCalledTimes(2);
    expect(opencodeService.abortSession).not.toHaveBeenCalled();
  });

  it("aborts after the no-progress deadline when every poll read times out", async () => {
    vi.useFakeTimers();
    let now = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(
      (_directory: string, signal?: AbortSignal) =>
        new Promise<OpenCodeSessionStatusMap>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 100,
      pollMs: 10,
      pollTimeoutMs: 5,
      now: () => now,
    });
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    prepared.arm();

    now = 50;
    await vi.advanceTimersByTimeAsync(15);
    expect(opencodeService.abortSession).not.toHaveBeenCalled();

    now = 100;
    await vi.advanceTimersByTimeAsync(10);

    expect(opencodeService.listSessionStatuses).toHaveBeenCalledTimes(2);
    expect(opencodeService.listPendingPermissions).toHaveBeenCalledOnce();
    expect(opencodeService.abortSession).toHaveBeenCalledOnce();
    expect(service.getError("conversation-1")).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          error: expect.objectContaining({ name: "ChatNoProgressError" }),
        }),
      }),
    );
  });

  it("stops a re-armed watchdog when the recovered turn is already settled", async () => {
    vi.useFakeTimers();
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() =>
      Promise.resolve([
        {
          info: {
            id: "assistant",
            sessionID: "root",
            role: "assistant" as const,
            time: { created: 1, completed: 2 },
          },
          parts: [{ id: "part", type: "text", text: "done" }],
        },
      ]),
    );
    opencodeService.listSessionStatuses = vi.fn(() => Promise.resolve({}));
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 100,
      pollMs: 10,
    });

    await service.rearm({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    await vi.advanceTimersByTimeAsync(20);

    expect(opencodeService.listSessionStatuses).toHaveBeenCalledOnce();
    expect(opencodeService.abortSession).not.toHaveBeenCalled();
  });

  it("stops after persistent abort failures and publishes a terminal recovery error", async () => {
    vi.useFakeTimers();
    let now = 0;
    const opencodeService = createMockOpenCodeService();
    opencodeService.getSessionTreeIds = vi.fn(() => Promise.resolve(new Set(["root"])));
    opencodeService.listSessionMessages = vi.fn(() => Promise.resolve([]));
    opencodeService.listSessionStatuses = vi.fn(() =>
      Promise.resolve({ root: { type: "busy" as const } }),
    );
    opencodeService.abortSession = vi.fn(() => Promise.reject(new Error("abort failed")));
    const service = createInteractiveChatWatchdogService({
      opencodeService,
      logger: createLogger(),
      noProgressMs: 100,
      pollMs: 10,
      now: () => now,
    });
    const listener = vi.fn();
    service.subscribe({
      conversationId: "conversation-1",
      signal: AbortSignal.timeout(1_000),
      onEvent: listener,
    });
    const prepared = await service.prepare({
      conversationId: "conversation-1",
      directory: "/work",
      sessionID: "root",
    });
    prepared.arm();

    now = 100;
    await vi.advanceTimersByTimeAsync(40);

    expect(opencodeService.abortSession).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining("could not be stopped"),
          }),
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(opencodeService.abortSession).toHaveBeenCalledTimes(3);
  });
});

function createLogger(): Logger {
  return {
    warn: vi.fn(),
  } as unknown as Logger;
}
