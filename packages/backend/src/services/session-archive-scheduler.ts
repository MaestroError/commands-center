import type { Logger } from "pino";

import type { SessionArchiveService } from "./session-archive-service.js";
import type { SessionArchiveSettingsService } from "./session-archive-settings-service.js";

const MINUTE_MS = 60_000;

export type SessionArchiveScheduler = ReturnType<typeof createSessionArchiveScheduler>;

/**
 * Periodically materializes session archive transcripts that have fallen behind
 * their appended message count. Runs on a fixed cadence derived from settings at
 * start time; each tick re-checks the enabled flag so the job can be paused
 * without a restart.
 */
export function createSessionArchiveScheduler(options: {
  archiveService: SessionArchiveService;
  settingsService: SessionArchiveSettingsService;
  logger?: Logger;
  batchLimit?: number;
}) {
  let interval: NodeJS.Timeout | undefined;
  const batchLimit = options.batchLimit ?? 25;

  async function tick(): Promise<void> {
    try {
      const settings = await options.settingsService.get();

      if (!settings.sessionArchiveEnabled) {
        return;
      }

      await options.archiveService.materializeDueSessions({ limit: batchLimit });
    } catch (error) {
      options.logger?.warn({ err: error }, "session archive scheduler tick failed");
    }
  }

  return {
    async start(): Promise<void> {
      if (interval) {
        return;
      }

      const settings = await options.settingsService.get();
      const tickMs = Math.max(1, settings.sessionArchiveMaterializeIntervalMinutes) * MINUTE_MS;
      interval = setInterval(() => {
        void tick();
      }, tickMs);
      interval.unref();
    },

    stop(): void {
      if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
    },

    tick,
  };
}
