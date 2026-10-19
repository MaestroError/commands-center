import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { writeConfigFileAtomic } from "../../lib/config-file.js";
import {
  legacyTaskTemplateFileSchema,
  taskTemplateFileSchema,
} from "../../services/task-service/template-files.js";
import type { WorkspaceMigration } from "../types.js";

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export const taskTemplateFoldersMigration = {
  id: "0011-task-template-folders",
  description: "Move task templates into folders with task.md prompts and task.json settings.",
  async up({ config }) {
    const root = resolve(config.paths.subdirectories.configuration, "task-templates");
    await mkdir(root, { recursive: true });
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const source = resolve(root, entry.name);
      const legacy = legacyTaskTemplateFileSchema
        .passthrough()
        .parse(JSON.parse(await readFile(source, "utf8")));
      const id = entry.name.slice(0, -5);
      if (!id || id.startsWith(".") || legacy.id !== id)
        throw new Error(`Template ID does not match filename: ${source}`);
      const directory = resolve(root, id);
      const { description, ...settings } = legacy;
      const next = {
        ...settings,
        version: 2,
        promptPath: relative(config.paths.workspaceDir, resolve(directory, "task.md"))
          .split("\\")
          .join("/"),
      };
      const existing = await readOptional(resolve(directory, "task.json"));
      if (existing !== undefined) {
        if (
          !isDeepStrictEqual(JSON.parse(existing), next) ||
          (await readOptional(resolve(directory, "task.md"))) !== description
        ) {
          throw new Error(`Conflicting task template files: ${source} and ${directory}`);
        }
      } else {
        const staging = await mkdtemp(resolve(root, ".template-migration-"));
        try {
          await writeFile(resolve(staging, "task.md"), description, "utf8");
          await writeConfigFileAtomic(resolve(staging, "task.json"), next);
          await rename(staging, directory);
        } finally {
          await rm(staging, { recursive: true, force: true });
        }
      }
      await rm(source);
    }
  },
  async down({ config }) {
    const root = resolve(config.paths.subdirectories.configuration, "task-templates");
    await mkdir(root, { recursive: true });
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const directory = resolve(root, entry.name);
      const settings = taskTemplateFileSchema
        .passthrough()
        .parse(JSON.parse(await readFile(resolve(directory, "task.json"), "utf8")));
      const expectedPath = relative(config.paths.workspaceDir, resolve(directory, "task.md"))
        .split("\\")
        .join("/");
      if (settings.id !== entry.name || settings.promptPath !== expectedPath) {
        throw new Error(`Invalid task template identity or promptPath: ${directory}`);
      }
      if ((await readdir(directory)).some((name) => name !== "task.md" && name !== "task.json")) {
        throw new Error(`Cannot roll back template with additional assets: ${directory}`);
      }
      const { promptPath: _promptPath, ...metadata } = settings;
      const legacy = {
        ...metadata,
        version: 1,
        description: await readFile(resolve(directory, "task.md"), "utf8"),
      };
      const target = resolve(root, `${settings.id}.json`);
      const existing = await readOptional(target);
      if (existing !== undefined && !isDeepStrictEqual(JSON.parse(existing), legacy)) {
        throw new Error(`Conflicting task template files: ${target} and ${directory}`);
      }
      if (existing === undefined) await writeConfigFileAtomic(target, legacy);
      await rm(directory, { recursive: true });
    }
  },
} satisfies WorkspaceMigration;
