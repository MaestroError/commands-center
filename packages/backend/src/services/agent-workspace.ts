import { mkdir, readFile, readdir, rename, rm, writeFile, cp } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import type { AgentCapabilitySelection, BuiltInSkill } from "../schemas/agents.js";

import type { RuntimeConfig } from "../lib/runtime-config.js";

export type AgentWorkspaceInput = {
  name: string;
  role: string;
  instructions: string;
  defaultModel: string;
  capabilities: AgentCapabilitySelection;
};

export function getBuiltInSkillRoot(config: RuntimeConfig): string {
  return resolve(config.paths.cwd, ".opencode", "skills");
}

export async function listBuiltInSkills(root: string): Promise<BuiltInSkill[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const slug = entry.name;
          const markdownPath = join(root, slug, "SKILL.md");
          const markdown = await readFile(markdownPath, "utf8");
          const data = parseFrontmatter(markdown);

          return {
            name: data["name"] ?? slug,
            slug,
            description: data["description"] ?? "",
          };
        }),
    );

    return skills
      .filter((skill) => skill.description.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (isMissingError(error)) {
      return [];
    }

    throw error;
  }
}

export async function prepareWorkspace(options: {
  config: RuntimeConfig;
  workspacePath: string;
  input: AgentWorkspaceInput;
  skillRoot?: string;
}): Promise<void> {
  await mkdir(options.workspacePath, { recursive: true });
  await syncSkills({
    workspacePath: options.workspacePath,
    capabilities: options.input.capabilities,
    skillRoot: options.skillRoot ?? getBuiltInSkillRoot(options.config),
  });
  await writeFile(
    join(options.workspacePath, "AGENTS.md"),
    renderAgentsMarkdown(options.input),
    "utf8",
  );
  await writeFile(
    join(options.workspacePath, "opencode.jsonc"),
    `${JSON.stringify(renderOpencodeConfig(options.input), null, 2)}\n`,
    "utf8",
  );
}

export async function archiveWorkspace(activePath: string, archiveRoot: string): Promise<string> {
  await mkdir(archiveRoot, { recursive: true });

  const archivedPath = join(archiveRoot, basename(activePath));
  await rm(archivedPath, { recursive: true, force: true });
  await rename(activePath, archivedPath);
  return archivedPath;
}

export async function moveWorkspace(currentPath: string, nextPath: string): Promise<void> {
  if (currentPath === nextPath) {
    return;
  }

  await rm(nextPath, { recursive: true, force: true });
  await mkdir(join(nextPath, ".."), { recursive: true });
  await rename(currentPath, nextPath);
}

function renderAgentsMarkdown(input: AgentWorkspaceInput): string {
  return `# ${input.name}\n\n## Role\n\n${input.role}\n\n## Instructions\n\n${input.instructions}\n`;
}

function renderOpencodeConfig(input: AgentWorkspaceInput): Record<string, unknown> {
  const permission = Object.fromEntries(
    [
      ...input.capabilities.toolPermissions.map(
        (rule: AgentCapabilitySelection["toolPermissions"][number]) =>
          [rule.pattern, rule.action] as const,
      ),
      ...input.capabilities.mcpServers.map(
        (server: AgentCapabilitySelection["mcpServers"][number]) =>
          [`${server.name}_*`, server.action] as const,
      ),
    ].sort(([a], [b]) => a.localeCompare(b)),
  );
  const mcp = Object.fromEntries(
    input.capabilities.mcpServers.map((server: AgentCapabilitySelection["mcpServers"][number]) => [
      server.name,
      { enabled: server.enabled },
    ]),
  );

  return {
    $schema: "https://opencode.ai/config.json",
    model: input.defaultModel,
    ...(Object.keys(mcp).length > 0 ? { mcp } : {}),
    ...(Object.keys(permission).length > 0 ? { permission } : {}),
  };
}

async function syncSkills(options: {
  workspacePath: string;
  capabilities: AgentCapabilitySelection;
  skillRoot: string;
}): Promise<void> {
  const targetRoot = join(options.workspacePath, "skills");
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });

  for (const skill of options.capabilities.builtInSkills) {
    const source = join(options.skillRoot, skill);
    const target = join(targetRoot, skill);
    await cp(source, target, { recursive: true });
  }
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return {};
  }

  return match[1]
    ? match[1]
        .split("\n")
        .map((line) => line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/))
        .filter((line): line is RegExpMatchArray => line !== null)
        .reduce<Record<string, string>>((result, line) => {
          const key = line[1];

          if (!key) {
            return result;
          }

          result[key] = line[2] ?? "";
          return result;
        }, {})
    : {};
}

function isMissingError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
