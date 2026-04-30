import { eq } from "drizzle-orm";

import type { AgentCapabilitySelection } from "../schemas/agents.js";

import { now } from "../db/ids.js";
import { agents } from "../db/schema/index.js";
import type { AppDb } from "../db/client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import {
  getBuiltInSkillRoot,
  prepareWorkspace,
  resolveAgentWorkspacePath,
} from "./agent-workspace.js";
import type { OpenCodeService } from "./opencode-service.js";

export function normalizeAgentCapabilities(
  capabilities: AgentCapabilitySelection,
  availableMcpNames: readonly string[],
): AgentCapabilitySelection {
  const available = new Set(availableMcpNames);
  const nextMcpServers = capabilities.mcpServers.filter((server) => available.has(server.name));
  const staleNames = new Set(
    capabilities.mcpServers
      .filter((server) => !available.has(server.name))
      .map((server) => server.name),
  );

  return {
    builtInSkills: capabilities.builtInSkills,
    customTools: capabilities.customTools,
    mcpServers: dedupeMcpServers(nextMcpServers),
    toolPermissions: capabilities.toolPermissions.filter(
      (rule) => !matchesAnyMcpPrefix(rule.pattern, staleNames),
    ),
  };
}

export function removeMcpReferences(
  capabilities: AgentCapabilitySelection,
  mcpName: string,
): AgentCapabilitySelection {
  return {
    builtInSkills: capabilities.builtInSkills,
    customTools: capabilities.customTools,
    mcpServers: capabilities.mcpServers.filter((server) => server.name !== mcpName),
    toolPermissions: capabilities.toolPermissions.filter(
      (rule) => !matchesMcpPrefix(rule.pattern, mcpName),
    ),
  };
}

export function renameMcpReferences(
  capabilities: AgentCapabilitySelection,
  previousName: string,
  nextName: string,
): AgentCapabilitySelection {
  return {
    builtInSkills: capabilities.builtInSkills,
    customTools: capabilities.customTools,
    mcpServers: dedupeMcpServers(
      capabilities.mcpServers.map((server) =>
        server.name === previousName ? { ...server, name: nextName } : server,
      ),
    ),
    toolPermissions: capabilities.toolPermissions.map((rule) => ({
      ...rule,
      pattern: matchesMcpPrefix(rule.pattern, previousName)
        ? `${nextName}${rule.pattern.slice(previousName.length)}`
        : rule.pattern,
    })),
  };
}

export async function rewriteAgentsForMcpChange(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: OpenCodeService;
  transform: (capabilities: AgentCapabilitySelection) => AgentCapabilitySelection;
}): Promise<number> {
  const rows = await options.db.query.agents.findMany();
  let updatedCount = 0;

  for (const row of rows) {
    const capabilities = parseCapabilities(row.capabilities_json);
    const nextCapabilities = options.transform(capabilities);
    const workspacePath = resolveAgentWorkspacePath({
      config: options.config,
      slug: row.slug,
      status: row.status === "archived" ? "archived" : "active",
    });

    if (JSON.stringify(nextCapabilities) === JSON.stringify(capabilities)) {
      continue;
    }

    await prepareWorkspace({
      config: options.config,
      workspacePath,
      input: {
        name: row.name,
        role: row.role,
        instructions: row.instructions,
        defaultModel: row.default_model,
        capabilities: nextCapabilities,
      },
      skillRoot: getBuiltInSkillRoot(options.config),
    });

    if (typeof options.opencodeService.dispose === "function") {
      await options.opencodeService.dispose(workspacePath).catch(() => {});
    }

    await options.db
      .update(agents)
      .set({
        capabilities_json: JSON.stringify(nextCapabilities),
        updated_at: now(),
      })
      .where(eq(agents.id, row.id));

    updatedCount += 1;
  }

  return updatedCount;
}

function parseCapabilities(value: string): AgentCapabilitySelection {
  return JSON.parse(value) as AgentCapabilitySelection;
}

function dedupeMcpServers(capabilities: AgentCapabilitySelection["mcpServers"]) {
  const unique = new Map(capabilities.map((server) => [server.name, server]));
  return Array.from(unique.values());
}

function matchesAnyMcpPrefix(pattern: string, names: ReadonlySet<string>): boolean {
  for (const name of names) {
    if (matchesMcpPrefix(pattern, name)) {
      return true;
    }
  }

  return false;
}

function matchesMcpPrefix(pattern: string, name: string): boolean {
  return pattern === `${name}_*` || pattern.startsWith(`${name}_`);
}
