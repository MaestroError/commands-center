import { resolve } from "node:path";

import { sessionArchiveSettingsSchema, type SessionArchiveSettings } from "@cc/shared/schemas";
import type { Logger } from "pino";

import { readConfigFile, writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

const SETTINGS_FILE = "session-archive.json";

const DEFAULT_SETTINGS: SessionArchiveSettings = sessionArchiveSettingsSchema.parse({});

export type SessionArchiveSettingsService = ReturnType<typeof createSessionArchiveSettingsService>;

export function createSessionArchiveSettingsService(options: {
  config: RuntimeConfig;
  logger?: Logger;
}) {
  const filePath = resolve(options.config.paths.subdirectories.preferences, SETTINGS_FILE);

  return {
    async get(): Promise<SessionArchiveSettings> {
      const parsed = await readConfigFile(filePath, sessionArchiveSettingsSchema, options.logger);
      return parsed ?? { ...DEFAULT_SETTINGS };
    },

    async update(input: SessionArchiveSettings): Promise<SessionArchiveSettings> {
      const parsed = sessionArchiveSettingsSchema.parse(input);
      await writeConfigFileAtomic(filePath, parsed);
      return parsed;
    },
  };
}
