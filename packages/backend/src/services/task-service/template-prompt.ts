import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { BadRequestError, ConflictError } from "../../lib/api-error.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";

export function templatePromptPath(config: RuntimeConfig, id: string): string {
  return resolve(config.paths.subdirectories.configuration, "task-templates", id, "task.md");
}

export function templatePromptRevision(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function readTemplatePrompt(config: RuntimeConfig, path: string): Promise<string> {
  try {
    const root = await realpath(config.paths.workspaceDir);
    const target = await realpath(path);
    const local = relative(root, target);
    if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
      throw new BadRequestError("Template prompt must be inside the workspace.");
    }
    return await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new BadRequestError(
        `Template prompt is missing: ${path}. Restore task.md before generating a task.`,
      );
    }
    if (["EACCES", "EPERM", "EISDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      throw new BadRequestError(
        `Cannot read template prompt: ${path}. Check that task.md is a readable file.`,
      );
    }
    throw error;
  }
}

export async function writeTemplatePrompt(
  config: RuntimeConfig,
  path: string,
  content: string,
  expectedRevision?: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const root = await realpath(config.paths.workspaceDir);
  const local = relative(root, await realpath(dirname(path)));
  if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new BadRequestError("Template prompt must be inside the workspace.");
  }
  if (expectedRevision !== undefined) {
    const current = await readTemplatePrompt(config, path);
    if (templatePromptRevision(current) !== expectedRevision) {
      throw new ConflictError(
        "The template prompt changed on disk. Reload it before saving your edits.",
      );
    }
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
