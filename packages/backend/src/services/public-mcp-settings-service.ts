import { resolve } from "node:path";

import { publicMcpSettingsSchema, type PublicMcpSettings } from "@cc/shared/schemas";
import type { Logger } from "pino";

import { readConfigFile, writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

const SETTINGS_FILE = "public-mcp.json";

const DEFAULT_SETTINGS: PublicMcpSettings = publicMcpSettingsSchema.parse({});

export type PublicMcpSettingsService = ReturnType<typeof createPublicMcpSettingsService>;

export function createPublicMcpSettingsService(options: {
  config: RuntimeConfig;
  logger?: Logger;
}) {
  const filePath = resolve(options.config.paths.subdirectories.preferences, SETTINGS_FILE);

  return {
    async get(): Promise<PublicMcpSettings> {
      const parsed = await readConfigFile(filePath, publicMcpSettingsSchema, options.logger);
      return parsed ?? { ...DEFAULT_SETTINGS };
    },

    async update(input: PublicMcpSettings): Promise<PublicMcpSettings> {
      const parsed = publicMcpSettingsSchema.parse(input);
      await writeConfigFileAtomic(filePath, parsed);
      return parsed;
    },
  };
}
