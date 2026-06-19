import { resolve } from "node:path";

import { taskRunMonitorSettingsSchema, type TaskRunMonitorSettings } from "@cc/shared/schemas";
import type { Logger } from "pino";

import { readConfigFile, writeConfigFileAtomic } from "../lib/config-file.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";

const SETTINGS_FILE = "task-run-monitor.json";

const DEFAULT_SETTINGS: TaskRunMonitorSettings = taskRunMonitorSettingsSchema.parse({});

export type TaskRunMonitorSettingsService = ReturnType<typeof createTaskRunMonitorSettingsService>;

export function createTaskRunMonitorSettingsService(options: {
  config: RuntimeConfig;
  logger?: Logger;
}) {
  const filePath = resolve(options.config.paths.subdirectories.preferences, SETTINGS_FILE);

  return {
    async get(): Promise<TaskRunMonitorSettings> {
      const parsed = await readConfigFile(filePath, taskRunMonitorSettingsSchema, options.logger);
      return parsed ?? { ...DEFAULT_SETTINGS };
    },

    async update(input: TaskRunMonitorSettings): Promise<TaskRunMonitorSettings> {
      const parsed = taskRunMonitorSettingsSchema.parse(input);
      await writeConfigFileAtomic(filePath, parsed);
      return parsed;
    },
  };
}
