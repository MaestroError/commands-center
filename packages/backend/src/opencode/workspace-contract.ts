import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { z } from "zod";

import type { SpecialistCapabilitySelection, BuiltInSkill } from "@cc/shared/schemas";
import { normalizeBuiltInSkillSlug } from "../lib/builtin-skill-aliases.js";

const OPENCODE_CONFIG_SCHEMA_URL = "https://opencode.ai/config.json";
const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TASK_RUN_TOOL_PERMISSION_DENIES = {
  cc_default_set_task_result: "deny",
  cc_default_add_task_artifact: "deny",
  cc_default_mark_needs_human_review: "deny",
} as const;

const permissionActionSchema = z.enum(["allow", "ask", "deny"]);
const permissionRuleSchema = z.record(z.string().min(1), permissionActionSchema);
const workspaceMcpEnabledSchema = z.object({ enabled: z.boolean() }).strict();
const workspaceRemoteMcpSchema = z
  .object({
    type: z.literal("remote"),
    url: z.string().trim().url(),
    enabled: z.boolean(),
    oauth: z.union([z.boolean(), z.object({}).passthrough()]).optional(),
    headers: z.record(z.string().min(1), z.string()).optional(),
    timeout: z.number().int().positive().optional(),
  })
  .strict();

const skillFrontmatterSchema = z
  .object({
    name: z.string().min(1).max(64).regex(SKILL_NAME_PATTERN),
    description: z.string().min(1).max(1024),
    license: z.string().min(1).optional(),
    compatibility: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const workspaceConfigSchema = z
  .object({
    $schema: z.literal(OPENCODE_CONFIG_SCHEMA_URL),
    model: z.string().trim().min(1),
    mcp: z
      .record(z.string().min(1), z.union([workspaceMcpEnabledSchema, workspaceRemoteMcpSchema]))
      .default({}),
    permission: z
      .record(z.string().min(1), z.union([permissionActionSchema, permissionRuleSchema]))
      .default({}),
  })
  .strict();

const workspaceRulesSchema = z.object({
  title: z.string().trim().min(1),
  role: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
});

export const OPENCODE_WORKSPACE_CONTRACT = {
  docs: {
    config: "https://opencode.ai/docs/config/",
    rules: "https://opencode.ai/docs/rules/",
    models: "https://opencode.ai/docs/models/",
    permissions: "https://opencode.ai/docs/permissions/",
    mcpServers: "https://opencode.ai/docs/mcp-servers/",
    skills: "https://opencode.ai/docs/skills/",
  },
  files: {
    rules: {
      relativePath: "AGENTS.md",
      description: "Project-local OpenCode rules file loaded from the workspace root.",
      docs: ["https://opencode.ai/docs/rules/"],
    },
    config: {
      relativePath: "opencode.jsonc",
      description: "Project-local OpenCode config merged above global config.",
      schemaUrl: OPENCODE_CONFIG_SCHEMA_URL,
      docs: [
        "https://opencode.ai/docs/config/",
        "https://opencode.ai/docs/models/",
        "https://opencode.ai/docs/permissions/",
        "https://opencode.ai/docs/mcp-servers/",
      ],
    },
    skills: {
      relativePath: ".opencode/skills",
      description: "Project-local skill directory discovered by OpenCode.",
      docs: ["https://opencode.ai/docs/skills/"],
    },
  },
} as const;

export type OpenCodeWorkspaceInput = {
  name: string;
  role: string;
  instructions: string;
  defaultModel: string;
  capabilities: SpecialistCapabilitySelection;
  appMcpEntries?: Record<string, z.infer<typeof workspaceRemoteMcpSchema>>;
};

export function getOpenCodeWorkspacePaths(root: string): {
  root: string;
  rulesFile: string;
  configFile: string;
  skillsDir: string;
} {
  return {
    root,
    rulesFile: join(root, OPENCODE_WORKSPACE_CONTRACT.files.rules.relativePath),
    configFile: join(root, OPENCODE_WORKSPACE_CONTRACT.files.config.relativePath),
    skillsDir: join(root, OPENCODE_WORKSPACE_CONTRACT.files.skills.relativePath),
  };
}

export async function listBuiltInSkills(root: string): Promise<BuiltInSkill[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => validateSkillDirectory(join(root, entry.name), entry.name)),
    );

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (isMissingError(error)) {
      return [];
    }

    throw error;
  }
}

export async function writeOpenCodeWorkspace(options: {
  workspacePath: string;
  input: OpenCodeWorkspaceInput;
  skillRoot: string;
  workspaceSkillRoot: string;
  /**
   * Whether to (re)write the AGENTS.md rules file. Defaults to true. Set to
   * false to preserve an existing AGENTS.md — used on agent update so that
   * hand-edited rules are not clobbered unless the caller opts in.
   */
  writeRules?: boolean;
}): Promise<void> {
  const paths = getOpenCodeWorkspacePaths(options.workspacePath);
  const rendered = renderOpenCodeWorkspace(options.input);

  validateOpenCodeWorkspace(rendered);

  await mkdir(paths.root, { recursive: true });
  await rm(paths.skillsDir, { recursive: true, force: true });
  await mkdir(paths.skillsDir, { recursive: true });

  for (const skill of options.input.capabilities.builtInSkills ?? []) {
    await copySkill({
      root: options.skillRoot,
      targetRoot: paths.skillsDir,
      slug: normalizeBuiltInSkillSlug(skill),
      requestedSlug: skill,
      kind: "built-in",
    });
  }

  for (const skill of options.input.capabilities.workspaceSkills ?? []) {
    await copySkill({
      root: options.workspaceSkillRoot,
      targetRoot: paths.skillsDir,
      slug: skill,
      requestedSlug: skill,
      kind: "workspace",
    });
  }

  if (options.writeRules !== false) {
    await writeFile(paths.rulesFile, rendered.rulesMarkdown, "utf8");
  }

  await writeFile(paths.configFile, rendered.configJsonc, "utf8");
}

export function renderOpenCodeWorkspace(input: OpenCodeWorkspaceInput): {
  rulesMarkdown: string;
  configJsonc: string;
  config: z.infer<typeof workspaceConfigSchema>;
} {
  const rules = workspaceRulesSchema.parse({
    title: input.name,
    role: input.role,
    instructions: input.instructions,
  });
  const config = workspaceConfigSchema.parse({
    $schema: OPENCODE_CONFIG_SCHEMA_URL,
    model: input.defaultModel,
    mcp: {
      ...Object.fromEntries(
        (input.capabilities.mcpServers ?? []).map((server) => [
          server.name,
          { enabled: server.enabled },
        ]),
      ),
      ...(input.appMcpEntries ?? {}),
    },
    permission: {
      ...TASK_RUN_TOOL_PERMISSION_DENIES,
      ...Object.fromEntries([
        ...(input.capabilities.mcpServers ?? [])
          .filter((server) => server.enabled !== false)
          .map((server) => [`${server.name}_*`, server.action] as const),
        ...(input.capabilities.toolPermissions ?? []).map(
          (rule) => [rule.pattern, rule.action] as const,
        ),
      ]),
    },
  });

  return {
    rulesMarkdown: [
      `# ${rules.title}`,
      "",
      `- Role: ${rules.role}`,
      "",
      "## Instructions",
      "",
      rules.instructions,
      "",
    ].join("\n"),
    configJsonc: `${JSON.stringify(config, null, 2)}\n`,
    config,
  };
}

export function validateOpenCodeWorkspace(rendered: {
  rulesMarkdown: string;
  configJsonc: string;
}): void {
  parseRulesMarkdown(rendered.rulesMarkdown);
  workspaceConfigSchema.parse(JSON.parse(rendered.configJsonc));
}

export function parseRulesMarkdown(markdown: string): z.infer<typeof workspaceRulesSchema> {
  const lines = markdown.trim().split("\n");
  const title = lines[0]?.match(/^#\s+(.+)$/)?.[1]?.trim();
  const role = lines
    .find((line) => line.startsWith("- Role:"))
    ?.replace(/^- Role:\s*/, "")
    .trim();
  const heading = lines.findIndex((line) => line.trim() === "## Instructions");
  const instructions =
    heading === -1
      ? ""
      : lines
          .slice(heading + 1)
          .join("\n")
          .trim();

  return workspaceRulesSchema.parse({
    title,
    role,
    instructions,
  });
}

export async function validateSkillDirectory(dir: string, slug: string): Promise<BuiltInSkill> {
  const markdown = await readFile(join(dir, "SKILL.md"), "utf8");
  const frontmatter = parseSkillFrontmatter(markdown);

  if (frontmatter.name !== slug) {
    throw new Error(
      `OpenCode skill directory '${slug}' must match frontmatter name '${frontmatter.name}'.`,
    );
  }

  return {
    name: frontmatter.name,
    slug,
    description: frontmatter.description,
    category: frontmatter.metadata?.["category"] ?? frontmatter.metadata?.["area"] ?? "custom",
    version: frontmatter.metadata?.["version"],
    license: frontmatter.license,
    compatibility: frontmatter.compatibility,
    metadata: frontmatter.metadata ?? {},
    detailsMarkdown: stripSkillFrontmatter(markdown),
    files: await listSkillFiles(dir),
  };
}

export function parseSkillFrontmatter(markdown: string): z.infer<typeof skillFrontmatterSchema> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);

  if (!match?.[1]) {
    throw new Error("OpenCode skill must start with YAML frontmatter.");
  }

  const lines = match[1].split("\n");
  const data: Record<string, string | Record<string, string>> = {};
  let activeObject: Record<string, string> | undefined;

  for (const line of lines) {
    const nestedMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.*)$/);

    if (nestedMatch && activeObject) {
      const nestedKey = nestedMatch[1];

      if (nestedKey) {
        activeObject[nestedKey] = nestedMatch[2] ?? "";
      }

      continue;
    }

    const topLevelMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (!topLevelMatch) {
      activeObject = undefined;
      continue;
    }

    const key = topLevelMatch[1];

    if (!key) {
      continue;
    }

    if (topLevelMatch[2] === "" && key === "metadata") {
      activeObject = {};
      data[key] = activeObject;
      continue;
    }

    data[key] = topLevelMatch[2] ?? "";
    activeObject = undefined;
  }

  return skillFrontmatterSchema.parse(data);
}

function stripSkillFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

async function listSkillFiles(root: string, baseRoot = root): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = join(root, entry.name);

      if (entry.isDirectory()) {
        return listSkillFiles(absolutePath, baseRoot);
      }

      return [relative(baseRoot, absolutePath)];
    }),
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}

async function copySkill(options: {
  root: string;
  targetRoot: string;
  slug: string;
  requestedSlug: string;
  kind: "built-in" | "workspace";
}): Promise<void> {
  const { root, targetRoot, slug, requestedSlug, kind } = options;
  const source = join(root, slug);

  try {
    await validateSkillDirectory(source, slug);
    await cp(source, join(targetRoot, slug), { recursive: true });
  } catch (error) {
    if (isMissingError(error)) {
      const aliasNote = requestedSlug === slug ? "" : ` It maps to '${slug}'.`;

      throw new Error(
        `${capitalize(kind)} skill '${requestedSlug}' was not found.${aliasNote} Update this specialist's skill capabilities or restore the missing skill directory.`,
      );
    }

    throw error;
  }
}

function isMissingError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
