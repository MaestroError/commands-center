import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { fileManagerPreferencesSchema, type FileManagerPreferences } from "@cc/shared/schemas";

import type { RuntimeConfig } from "../lib/runtime-config.js";

const PREFERENCES_FILE = "file-manager.json";
const DEFAULT_PREFERENCES: FileManagerPreferences = {
  allowHostFilesystemEdits: false,
};

export type FileManagerPreferencesService = ReturnType<typeof createFileManagerPreferencesService>;

export function createFileManagerPreferencesService(options: { config: RuntimeConfig }) {
  const filePath = resolve(options.config.paths.subdirectories.preferences, PREFERENCES_FILE);

  return {
    async get(): Promise<FileManagerPreferences> {
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        return fileManagerPreferencesSchema.parse(parsed);
      } catch (error) {
        if (isMissingError(error)) {
          return { ...DEFAULT_PREFERENCES };
        }

        throw error;
      }
    },

    async update(input: FileManagerPreferences): Promise<FileManagerPreferences> {
      const parsed = fileManagerPreferencesSchema.parse(input);
      await mkdir(options.config.paths.subdirectories.preferences, { recursive: true });
      await writeFile(filePath, JSON.stringify(parsed, null, 2), "utf8");
      return parsed;
    },
  };
}

function isMissingError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
