import { writeEmbeddedSpecialistWorkspace } from "../opencode/embedded-specialist-workspace.js";
import { eq } from "drizzle-orm";

import {
  specialistCapabilitySelectionSchema,
  type SpecialistCapabilitySelection,
} from "@cc/shared/schemas";

import { writeSpecialistFile } from "./specialist-file.js";
import { now } from "../db/ids.js";
import { agents } from "../db/schema/index.js";
import type { AppDb } from "../db/client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { normalizeBuiltInSkillSlugs } from "../lib/builtin-skill-aliases.js";
import {
  getBuiltInSkillRoot,
  getWorkspaceSkillRoot,
  type prepareWorkspace,
  resolveSpecialistWorkspacePath,
} from "./specialist-workspace.js";
import { createCustomToolService } from "./custom-tool-service.js";
import type { OpenCodeService } from "./opencode-service.js";

export function normalizeSpecialistCapabilities(
  capabilities: SpecialistCapabilitySelection,
  availableMcpNames: readonly string[],
  availableAppMcpNames: readonly string[],
): SpecialistCapabilitySelection {
  const available = new Set(availableMcpNames);
  const availableApp = new Set(availableAppMcpNames);
  const nextMcpServers = (capabilities.mcpServers ?? []).filter((server) =>
    available.has(server.name),
  );
  const staleNames = new Set(
    (capabilities.mcpServers ?? [])
      .filter((server) => !available.has(server.name))
      .map((server) => server.name),
  );
  const nextAppMcpServers = (capabilities.appMcpServers ?? []).filter((server) =>
    availableApp.has(server.name),
  );
  const staleAppNames = new Set(
    (capabilities.appMcpServers ?? [])
      .filter((server) => !availableApp.has(server.name))
      .map((server) => server.name),
  );

  return {
    builtInSkills: normalizeBuiltInSkillSlugs(capabilities.builtInSkills),
    workspaceSkills: capabilities.workspaceSkills ?? [],
    customTools: capabilities.customTools ?? [],
    mcpServers: dedupeMcpServers(nextMcpServers),
    mcpToolPermissions: capabilities.mcpToolPermissions,
    toolPermissions: (capabilities.toolPermissions ?? []).filter(
      (rule) => !matchesAnyMcpPrefix(rule.pattern, staleNames),
    ),
    appMcpServers: dedupeMcpServers(nextAppMcpServers),
    appToolPermissions: (capabilities.appToolPermissions ?? []).filter(
      (rule) => !matchesAnyMcpPrefix(rule.pattern, staleAppNames),
    ),
  };
}

export function removeMcpReferences(
  capabilities: SpecialistCapabilitySelection,
  mcpName: string,
): SpecialistCapabilitySelection {
  return {
    builtInSkills: normalizeBuiltInSkillSlugs(capabilities.builtInSkills),
    workspaceSkills: capabilities.workspaceSkills ?? [],
    customTools: capabilities.customTools ?? [],
    mcpServers: (capabilities.mcpServers ?? []).filter((server) => server.name !== mcpName),
    mcpToolPermissions: capabilities.mcpToolPermissions,
    toolPermissions: (capabilities.toolPermissions ?? []).filter(
      (rule) => !matchesMcpPrefix(rule.pattern, mcpName),
    ),
    appMcpServers: capabilities.appMcpServers ?? [],
    appToolPermissions: capabilities.appToolPermissions ?? [],
  };
}

export function renameMcpReferences(
  capabilities: SpecialistCapabilitySelection,
  previousName: string,
  nextName: string,
): SpecialistCapabilitySelection {
  return {
    builtInSkills: normalizeBuiltInSkillSlugs(capabilities.builtInSkills),
    workspaceSkills: capabilities.workspaceSkills ?? [],
    customTools: capabilities.customTools ?? [],
    mcpServers: dedupeMcpServers(
      (capabilities.mcpServers ?? []).map((server) =>
        server.name === previousName ? { ...server, name: nextName } : server,
      ),
    ),
    mcpToolPermissions: capabilities.mcpToolPermissions?.map((rule) =>
      rule.server === previousName ? { ...rule, server: nextName } : rule,
    ),
    toolPermissions: (capabilities.toolPermissions ?? []).map((rule) => ({
      ...rule,
      pattern: matchesMcpPrefix(rule.pattern, previousName)
        ? `${nextName}${rule.pattern.slice(previousName.length)}`
        : rule.pattern,
    })),
    appMcpServers: capabilities.appMcpServers ?? [],
    appToolPermissions: capabilities.appToolPermissions ?? [],
  };
}

export function setMcpServerAssignment(
  capabilities: SpecialistCapabilitySelection,
  mcpName: string,
  enabled: boolean,
): SpecialistCapabilitySelection {
  const remainingServers = (capabilities.mcpServers ?? []).filter(
    (server) => server.name !== mcpName,
  );
  const remainingPermissions = (capabilities.toolPermissions ?? []).filter(
    (rule) => !matchesMcpPrefix(rule.pattern, mcpName),
  );

  return {
    ...capabilities,
    mcpServers: [
      ...remainingServers,
      { name: mcpName, enabled, action: enabled ? "allow" : "deny" },
    ],
    toolPermissions: enabled ? (capabilities.toolPermissions ?? []) : remainingPermissions,
  };
}

export async function rewriteAgentsForMcpChange(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: Pick<OpenCodeService, "dispose">;
  prepareWorkspace?: typeof prepareWorkspace;
  transform: (
    capabilities: SpecialistCapabilitySelection,
    specialistId: string,
  ) => SpecialistCapabilitySelection;
  activeOnly?: boolean;
}): Promise<number> {
  const customToolService = createCustomToolService({
    config: options.config,
    db: options.db,
    opencodeService: options.opencodeService,
  });
  const prepare: typeof prepareWorkspace =
    options.prepareWorkspace ??
    ((input) => writeEmbeddedSpecialistWorkspace({ ...input, db: options.db, customToolService }));
  const rows = await options.db.query.agents.findMany({
    where: options.activeOnly
      ? (table, operators) => operators.eq(table.status, "active")
      : undefined,
  });
  let updatedCount = 0;

  for (const row of rows) {
    const capabilities = parseCapabilities(row.capabilities_json);
    const nextCapabilities = options.transform(capabilities, row.id);
    const workspacePath = resolveSpecialistWorkspacePath({
      config: options.config,
      slug: row.slug,
      status: row.status === "archived" ? "archived" : "active",
    });

    if (JSON.stringify(nextCapabilities) === JSON.stringify(capabilities)) {
      continue;
    }

    await prepare({
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
      workspaceSkillRoot: getWorkspaceSkillRoot(options.config),
      // An MCP server change must not fail because some other specialist
      // references a library skill that has since been deleted.
      missingSkillPolicy: "retain",
    });

    if (typeof options.opencodeService.dispose === "function") {
      await options.opencodeService.dispose(workspacePath).catch(() => {});
    }

    const updatedAt = now();
    await writeSpecialistFile(
      options.config,
      row.slug,
      row.status === "archived" ? "archived" : "active",
      {
        id: row.id,
        name: row.name,
        role: row.role,
        instructions: row.instructions,
        defaultModel: row.default_model,
        iconPath: row.icon_path ?? undefined,
        capabilities: nextCapabilities,
        createdAt: row.created_at.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    );

    await options.db
      .update(agents)
      .set({
        capabilities_json: JSON.stringify(nextCapabilities),
        updated_at: updatedAt,
      })
      .where(eq(agents.id, row.id));

    updatedCount += 1;
  }

  return updatedCount;
}

function parseCapabilities(value: string): SpecialistCapabilitySelection {
  return specialistCapabilitySelectionSchema.parse(JSON.parse(value));
}

function dedupeMcpServers(capabilities: SpecialistCapabilitySelection["mcpServers"]) {
  const unique = new Map((capabilities ?? []).map((server) => [server.name, server]));
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
