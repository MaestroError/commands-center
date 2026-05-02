import { mkdir, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";

import type { AgentCapabilitySelection, BuiltInSkill } from "../schemas/agents.js";

import type { RuntimeConfig } from "../lib/runtime-config.js";
import { resolveBuiltInSkillsRoot } from "../lib/builtin-skills.js";
import {
  listBuiltInSkills as listContractBuiltInSkills,
  writeOpenCodeWorkspace,
} from "../opencode/workspace-contract.js";

export type AgentWorkspaceInput = {
  name: string;
  role: string;
  instructions: string;
  defaultModel: string;
  capabilities: AgentCapabilitySelection;
  appMcpEntries?: Record<
    string,
    {
      type: "remote";
      url: string;
      enabled: boolean;
      oauth: false;
      headers: Record<string, string>;
    }
  >;
};

export function getBuiltInSkillRoot(config: RuntimeConfig): string {
  void config;
  return resolveBuiltInSkillsRoot();
}

export function getWorkspaceSkillRoot(config: RuntimeConfig): string {
  return config.paths.subdirectories.skills;
}

export async function listBuiltInSkills(root: string): Promise<BuiltInSkill[]> {
  return listContractBuiltInSkills(root);
}

export async function prepareWorkspace(options: {
  config: RuntimeConfig;
  workspacePath: string;
  input: AgentWorkspaceInput;
  skillRoot?: string;
  workspaceSkillRoot?: string;
}): Promise<void> {
  await writeOpenCodeWorkspace({
    workspacePath: options.workspacePath,
    input: options.input,
    skillRoot: options.skillRoot ?? getBuiltInSkillRoot(options.config),
    workspaceSkillRoot: options.workspaceSkillRoot ?? getWorkspaceSkillRoot(options.config),
  });
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

export function resolveAgentWorkspacePath(options: {
  config: RuntimeConfig;
  slug: string;
  status: "active" | "archived";
}): string {
  if (options.status === "archived") {
    return join(options.config.paths.subdirectories.agents, ".archived", options.slug);
  }

  return join(options.config.paths.subdirectories.agents, options.slug);
}
