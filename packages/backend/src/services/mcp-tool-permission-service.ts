import { join } from "node:path";
import {
  specialistCapabilitySelectionSchema,
  type McpToolCatalog,
  type TaskPermissionProfile,
} from "@cc/shared/schemas";
import type { AppDb } from "../db/client.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";

type Rules = NonNullable<TaskPermissionProfile["mcpToolPermissions"]>;

export function createMcpToolPermissionService(options: {
  db: AppDb;
  specialistsDirectory: string;
  readCatalog(directory: string): Promise<McpToolCatalog>;
}) {
  async function catalog(agentId: string): Promise<McpToolCatalog> {
    const agent = await options.db.query.agents.findFirst({
      where: (table, { eq }) => eq(table.id, agentId),
    });
    if (!agent || agent.status !== "active") throw new NotFoundError("Specialist not found.");
    const capabilities = specialistCapabilitySelectionSchema.parse(
      JSON.parse(agent.capabilities_json),
    );
    const discovered = await options.readCatalog(join(options.specialistsDirectory, agent.slug));
    return discovered.filter((server) =>
      capabilities.mcpServers.some(
        (entry) => entry.name === server.server && entry.enabled !== false,
      ),
    );
  }
  return {
    catalog,
    async validate(agentId: string, rules: Rules | undefined, previous: Rules = []): Promise<void> {
      if (!rules) return;
      await validateMcpToolChanges(() => catalog(agentId), rules, previous);
    },
  };
}
export type McpToolPermissionService = ReturnType<typeof createMcpToolPermissionService>;

export function validateMcpToolRules(
  available: McpToolCatalog,
  rules: Rules,
  previous: Rules = [],
): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    const key = JSON.stringify([rule.server, rule.tool]);
    if (seen.has(key)) throw new BadRequestError("Duplicate MCP tool permission.");
    seen.add(key);
    if (
      previous.some(
        (entry) =>
          entry.server === rule.server && entry.tool === rule.tool && entry.action === rule.action,
      )
    )
      continue;
    if (
      !available.some(
        (server) =>
          server.available &&
          server.server === rule.server &&
          server.tools.some((tool) => tool.name === rule.tool),
      )
    ) {
      throw new BadRequestError(
        `MCP tool '${rule.server}/${rule.tool}' is not connected in this specialist workspace.`,
      );
    }
  }
}

export async function validateMcpToolChanges(
  readCatalog: () => Promise<McpToolCatalog>,
  rules: Rules,
  previous: Rules = [],
): Promise<void> {
  const changed = rules.some(
    (rule) =>
      !previous.some(
        (entry) =>
          entry.server === rule.server && entry.tool === rule.tool && entry.action === rule.action,
      ),
  );
  validateMcpToolRules(changed ? await readCatalog() : [], rules, previous);
}
