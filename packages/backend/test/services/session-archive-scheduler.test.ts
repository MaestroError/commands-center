import { describe, expect, it, vi } from "vitest";

import { createSessionArchiveScheduler } from "../../src/services/session-archive-scheduler";
import type { SessionArchiveService } from "../../src/services/session-archive-service";
import type { SessionArchiveSettingsService } from "../../src/services/session-archive-settings-service";

function makeScheduler(
  overrides: {
    enabled?: boolean;
    intervalMinutes?: number;
    materialize?: () => Promise<void>;
    getSettings?: () => Promise<unknown>;
  } = {},
) {
  const materializeDueSessions = vi.fn(overrides.materialize ?? (() => Promise.resolve()));
  const get = vi.fn(
    overrides.getSettings ??
      (() =>
        Promise.resolve({
          sessionArchiveEnabled: overrides.enabled ?? true,
          sessionArchiveMaterializeIntervalMinutes: overrides.intervalMinutes ?? 5,
        })),
  );
  const logger = { warn: vi.fn() };
  const scheduler = createSessionArchiveScheduler({
    archiveService: { materializeDueSessions } as unknown as SessionArchiveService,
    settingsService: { get } as unknown as SessionArchiveSettingsService,
    logger: logger as never,
  });
  return { scheduler, materializeDueSessions, get, logger };
}

describe("createSessionArchiveScheduler", () => {
  it("materializes due sessions on tick when archiving is enabled", async () => {
    const { scheduler, materializeDueSessions } = makeScheduler({ enabled: true });
    await scheduler.tick();
    expect(materializeDueSessions).toHaveBeenCalledWith({ limit: 25 });
  });

  it("skips materialization when archiving is disabled", async () => {
    const { scheduler, materializeDueSessions } = makeScheduler({ enabled: false });
    await scheduler.tick();
    expect(materializeDueSessions).not.toHaveBeenCalled();
  });

  it("logs a warning when a tick fails", async () => {
    const { scheduler, logger } = makeScheduler({
      getSettings: () => Promise.reject(new Error("settings unavailable")),
    });
    await scheduler.tick();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "session archive scheduler tick failed",
    );
  });

  it("starts an interval once and is idempotent, then stops cleanly", async () => {
    const { scheduler, get } = makeScheduler({ intervalMinutes: 1 });
    await scheduler.start();
    await scheduler.start(); // no-op — interval already set
    // start() reads settings exactly once because the second call bails early.
    expect(get).toHaveBeenCalledTimes(1);
    scheduler.stop();
    scheduler.stop(); // safe to call twice
  });
});
