import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  createWorkspaceSkillInputSchema,
  workspaceSkillMutationResultSchema,
  workspaceSkillUploadInputSchema,
  type CreateWorkspaceSkillInput,
  type WorkspaceSkill,
  type WorkspaceSkillUploadInput,
} from "@cc/shared/schemas";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import { ConflictError, NotFoundError } from "../lib/api-error.js";
import { listBuiltInSkills, validateSkillDirectory } from "../opencode/workspace-contract.js";
import { resolveBuiltInSkillsRoot } from "../lib/builtin-skills.js";

export type WorkspaceSkillService = ReturnType<typeof createWorkspaceSkillService>;

export function createWorkspaceSkillService(options: { config: RuntimeConfig }) {
  const builtInSkillRoot = resolveBuiltInSkillsRoot();

  return {
    async list(): Promise<WorkspaceSkill[]> {
      return listBuiltInSkills(options.config.paths.subdirectories.skills);
    },

    async get(slug: string): Promise<WorkspaceSkill> {
      const skill = await readWorkspaceSkill(slug);

      if (!skill) {
        throw new NotFoundError("Workspace skill not found.");
      }

      return skill;
    },

    async create(input: CreateWorkspaceSkillInput) {
      const parsed = createWorkspaceSkillInputSchema.parse(input);
      const slug = slugify(parsed.name);
      await assertSkillSlugAvailable(slug);

      const directoryPath = getWorkspaceSkillDirectoryPath(slug);
      await mkdir(directoryPath, { recursive: true });
      await writeFile(
        join(directoryPath, "SKILL.md"),
        renderSkillTemplate({ slug, description: parsed.description }),
        "utf8",
      );

      const skill = await materializeWorkspaceSkill(slug);
      return workspaceSkillMutationResultSchema.parse({ skill, overwritten: false });
    },

    async delete(slug: string): Promise<void> {
      const skill = await readWorkspaceSkill(slug);

      if (!skill) {
        throw new NotFoundError("Workspace skill not found.");
      }

      await rm(getWorkspaceSkillDirectoryPath(slug), { recursive: true, force: true });
    },

    async upload(input: WorkspaceSkillUploadInput) {
      const parsed = workspaceSkillUploadInputSchema.parse(input);
      const slug = getUploadedSkillSlug(parsed.entries.map((entry) => entry.relativePath));
      await assertSkillSlugAvailable(slug, parsed.overwrite);

      const tempRoot = await prepareUploadRoot();
      const tempSkillDir = join(tempRoot, slug);

      try {
        for (const entry of parsed.entries) {
          const relativePath = normalizeUploadPath(entry.relativePath);
          const targetPath = join(tempRoot, relativePath);

          await mkdir(dirname(targetPath), { recursive: true });
          await writeFile(targetPath, Buffer.from(entry.contentBase64, "base64"), "utf8");
        }

        await validateSkillDirectory(tempSkillDir, slug);

        const destinationPath = getWorkspaceSkillDirectoryPath(slug);

        if (parsed.overwrite) {
          await rm(destinationPath, { recursive: true, force: true });
        }

        await mkdir(options.config.paths.subdirectories.skills, { recursive: true });
        await rename(tempSkillDir, destinationPath);

        const skill = await materializeWorkspaceSkill(slug);
        return workspaceSkillMutationResultSchema.parse({ skill, overwritten: parsed.overwrite });
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    },
  };

  function getWorkspaceSkillDirectoryPath(slug: string): string {
    return join(options.config.paths.subdirectories.skills, slug);
  }

  async function readWorkspaceSkill(slug: string): Promise<WorkspaceSkill | undefined> {
    try {
      return await materializeWorkspaceSkill(slug);
    } catch (error) {
      if (isMissingError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async function materializeWorkspaceSkill(slug: string): Promise<WorkspaceSkill> {
    return validateSkillDirectory(getWorkspaceSkillDirectoryPath(slug), slug);
  }

  async function assertSkillSlugAvailable(slug: string, allowOverwrite = false): Promise<void> {
    const builtInPath = join(builtInSkillRoot, slug);

    if (await pathExists(builtInPath)) {
      throw new ConflictError(`Workspace skill '${slug}' conflicts with a built-in skill.`);
    }

    if (!allowOverwrite && (await pathExists(getWorkspaceSkillDirectoryPath(slug)))) {
      throw new ConflictError(`Workspace skill '${slug}' already exists.`);
    }
  }

  async function prepareUploadRoot(): Promise<string> {
    await mkdir(options.config.paths.subdirectories.tmp, { recursive: true });
    return mkdtemp(join(options.config.paths.subdirectories.tmp, "skill-upload-"));
  }
}

function renderSkillTemplate(options: { slug: string; description: string }): string {
  return [
    "---",
    `name: ${options.slug}`,
    `description: ${options.description.trim()}`,
    "compatibility: opencode",
    "metadata:",
    "  category: workspace",
    "  version: 1.0.0",
    "---",
    "",
    `# ${options.slug}`,
    "",
    options.description.trim(),
    "",
    "## Usage",
    "",
    "Add the instructions, examples, and supporting files this skill needs.",
    "",
  ].join("\n");
}

function getUploadedSkillSlug(paths: string[]): string {
  const topLevelSegments = new Set(paths.map((path) => normalizeUploadPath(path).split("/")[0]));

  if (topLevelSegments.size !== 1) {
    throw new ConflictError("Skill upload must contain exactly one top-level skill folder.");
  }

  const [slug] = Array.from(topLevelSegments);

  if (!slug) {
    throw new ConflictError("Skill upload must contain a top-level skill folder.");
  }

  return slug;
}

function normalizeUploadPath(path: string): string {
  const normalized = path.trim().split(/[\\/]/).filter(Boolean).join("/");

  if (normalized.length === 0 || normalized.includes("..")) {
    throw new ConflictError("Skill upload path is invalid.");
  }

  return normalized;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingError(error)) {
      return false;
    }

    throw error;
  }
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "skill";
}

function isMissingError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
