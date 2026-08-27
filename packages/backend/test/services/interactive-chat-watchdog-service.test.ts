import { afterEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";

import { createInteractiveChatWatchdogService } from "../../src/services/interactive-chat-watchdog-service.js";
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
});

function createLogger(): Logger {
  return {
    warn: vi.fn(),
  } as unknown as Logger;
}
