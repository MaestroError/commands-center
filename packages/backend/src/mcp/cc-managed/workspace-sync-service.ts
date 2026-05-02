import { readFile } from "node:fs/promises";

import type { Logger } from "pino";

import { agentCapabilitySelectionSchema } from "../../schemas/agents.js";
import type { AppDb } from "../../db/client.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";
import {
  getBuiltInSkillRoot,
  getWorkspaceSkillRoot,
  resolveAgentWorkspacePath,
} from "../../services/agent-workspace.js";
import { createCcManagedMcpAuthStateStore } from "./auth-state-store.js";
import { createCcManagedMcpAuthTokenService } from "./auth-token-service.js";
import { createCcManagedMcpToolAccessService } from "./tool-access-service.js";
import { createCcManagedMcpWorkspaceEntryService } from "./workspace-entry-service.js";
import { writeOpenCodeWorkspace } from "../../opencode/workspace-contract.js";

export async function syncCcManagedMcpAgentWorkspaces(options: {
  db: AppDb;
  config: RuntimeConfig;
  logger: Logger;
}): Promise<number> {
  const authStateStore = createCcManagedMcpAuthStateStore(options.config);
  const authTokenService = createCcManagedMcpAuthTokenService({ authStateStore });
  const toolAccessService = createCcManagedMcpToolAccessService();
  const workspaceEntryService = createCcManagedMcpWorkspaceEntryService({
    config: options.config,
    authTokenService,
    toolAccessService,
  });
  const rows = await options.db.query.agents.findMany();
  let updatedCount = 0;

  for (const row of rows) {
    const workspacePath = resolveAgentWorkspacePath({
      config: options.config,
      slug: row.slug,
      status: row.status === "archived" ? "archived" : "active",
    });
    const nextCapabilities = agentCapabilitySelectionSchema.parse(
      JSON.parse(row.capabilities_json),
    );
    const nextEntries = await workspaceEntryService.buildEntries({
      slug: row.slug,
      capabilities: nextCapabilities,
    });
    const currentConfig = await readWorkspaceConfig(workspacePath);

    if (currentConfig && isConfigUpToDate(currentConfig, nextEntries)) {
      continue;
    }

    await writeOpenCodeWorkspace({
      workspacePath,
      input: {
        name: row.name,
        role: row.role,
        instructions: row.instructions,
        defaultModel: row.default_model,
        capabilities: nextCapabilities,
        appMcpEntries: nextEntries,
      },
      skillRoot: getBuiltInSkillRoot(options.config),
      workspaceSkillRoot: getWorkspaceSkillRoot(options.config),
    });
    updatedCount += 1;
  }

  options.logger.info({ updatedCount }, "cc-managed MCP workspace sync completed");
  return updatedCount;
}

async function readWorkspaceConfig(workspacePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(`${workspacePath}/opencode.jsonc`, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function isConfigUpToDate(
  config: Record<string, unknown>,
  nextEntries: Record<string, { url: string; headers: Record<string, string>; enabled: boolean }>,
): boolean {
  const mcp = config["mcp"];

  if (!mcp || typeof mcp !== "object") {
    return false;
  }

  return Object.entries(nextEntries).every(([name, entry]) => {
    const current = (mcp as Record<string, unknown>)[name];

    if (!current || typeof current !== "object") {
      return false;
    }

    const currentHeaders = (current as Record<string, unknown>)["headers"];
    return (
      (current as Record<string, unknown>)["url"] === entry.url &&
      (current as Record<string, unknown>)["enabled"] === entry.enabled &&
      currentHeaders &&
      typeof currentHeaders === "object" &&
      (currentHeaders as Record<string, unknown>)["Authorization"] ===
        entry.headers["Authorization"]
    );
  });
}
