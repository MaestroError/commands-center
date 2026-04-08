import { eq } from "drizzle-orm";
import { join } from "node:path";

import {
  agentCapabilitySelectionSchema,
  agentSchema,
  builtInSkillListSchema,
  createAgentInputSchema,
  updateAgentInputSchema,
  type Agent,
  type BuiltInSkill,
  type CreateAgentInput,
  type UpdateAgentInput,
} from "../schemas/agents.js";

import { createId, now } from "../db/ids.js";
import { agents, custom_tools, mcp_servers } from "../db/schema/index.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";
import type { AppDb } from "../db/client.js";
import { createProviderService } from "./provider-service.js";
import {
  archiveWorkspace,
  getBuiltInSkillRoot,
  listBuiltInSkills,
  moveWorkspace,
  prepareWorkspace,
} from "./agent-workspace.js";

export type AgentService = ReturnType<typeof createAgentService>;

export function createAgentService(options: {
  db: AppDb;
  config: RuntimeConfig;
  orchestrator: OpenCodeOrchestrator;
  skillRoot?: string;
}) {
  const skillRoot = options.skillRoot ?? getBuiltInSkillRoot(options.config);
  const providerService = createProviderService({
    config: options.config,
    orchestrator: options.orchestrator,
  });

  return {
    async list(includeArchived = false): Promise<Agent[]> {
      const rows = await options.db.query.agents.findMany({
        where: includeArchived
          ? undefined
          : (table, operators) => operators.eq(table.status, "active"),
        orderBy: (table, operators) => [operators.desc(table.updated_at)],
      });

      return rows.map(mapAgent);
    },

    async get(id: string): Promise<Agent | undefined> {
      const row = await options.db.query.agents.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });

      return row ? mapAgent(row) : undefined;
    },

    async create(input: CreateAgentInput): Promise<Agent> {
      const parsed = createAgentInputSchema.parse(input);
      const id = createId();
      const slug = await reserveSlug(parsed.name);
      const timestamp = now();
      const workspacePath = buildWorkspacePath(slug, id);

      await prepareWorkspace({
        config: options.config,
        workspacePath,
        input: parsed,
        skillRoot,
      });

      const [row] = await options.db
        .insert(agents)
        .values({
          id,
          slug,
          name: parsed.name,
          role: parsed.role,
          instructions: parsed.instructions,
          default_model: parsed.defaultModel,
          icon_path: parsed.iconPath,
          workspace_path: workspacePath,
          status: "active",
          capabilities_json: JSON.stringify(parsed.capabilities),
          created_at: timestamp,
          updated_at: timestamp,
          archived_at: null,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create agent record.");
      }

      return mapAgent(row);
    },

    async update(id: string, input: UpdateAgentInput): Promise<Agent | undefined> {
      const parsed = updateAgentInputSchema.parse(input);
      const existing = await options.db.query.agents.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });

      if (!existing) {
        return undefined;
      }

      const nextName = parsed.name ?? existing.name;
      const nextSlug = parsed.name ? await reserveSlug(parsed.name, id) : existing.slug;
      const nextWorkspacePath = buildWorkspacePath(nextSlug, existing.id);

      if (existing.workspace_path !== nextWorkspacePath) {
        await moveWorkspace(existing.workspace_path, nextWorkspacePath);
      }

      const capabilities = parsed.capabilities ?? parseCapabilities(existing.capabilities_json);
      const workspaceInput = {
        name: nextName,
        role: parsed.role ?? existing.role,
        instructions: parsed.instructions ?? existing.instructions,
        defaultModel: parsed.defaultModel ?? existing.default_model,
        capabilities,
      };

      await prepareWorkspace({
        config: options.config,
        workspacePath: nextWorkspacePath,
        input: workspaceInput,
        skillRoot,
      });

      await options.orchestrator
        .disposeWorkspace({ directory: nextWorkspacePath })
        .catch(() => false);

      const [row] = await options.db
        .update(agents)
        .set({
          slug: nextSlug,
          name: workspaceInput.name,
          role: workspaceInput.role,
          instructions: workspaceInput.instructions,
          default_model: workspaceInput.defaultModel,
          icon_path: parsed.iconPath ?? existing.icon_path,
          workspace_path: nextWorkspacePath,
          capabilities_json: JSON.stringify(capabilities),
          updated_at: now(),
        })
        .where(eq(agents.id, id))
        .returning();

      if (!row) {
        throw new Error("Failed to update agent record.");
      }

      return mapAgent(row);
    },

    async archive(id: string): Promise<Agent | undefined> {
      const existing = await options.db.query.agents.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });

      if (!existing) {
        return undefined;
      }

      if (existing.status === "archived") {
        return mapAgent(existing);
      }

      await options.orchestrator
        .disposeWorkspace({ directory: existing.workspace_path })
        .catch(() => false);

      const archivedPath = await archiveWorkspace(existing.workspace_path, buildArchiveRoot());
      const archivedAt = now();
      const [row] = await options.db
        .update(agents)
        .set({
          status: "archived",
          workspace_path: archivedPath,
          archived_at: archivedAt,
          updated_at: archivedAt,
        })
        .where(eq(agents.id, id))
        .returning();

      if (!row) {
        throw new Error("Failed to archive agent record.");
      }

      return mapAgent(row);
    },

    async getCatalog(): Promise<{
      builtInSkills: BuiltInSkill[];
      mcpServers: Array<{ name: string; enabled: boolean }>;
      customTools: Array<{ name: string; enabled: boolean }>;
      providerModels: string[];
    }> {
      const [skills, mcpRows, toolRows, providerModels] = await Promise.all([
        listBuiltInSkills(skillRoot),
        options.db
          .select({ name: mcp_servers.name, enabled: mcp_servers.enabled })
          .from(mcp_servers),
        options.db
          .select({ name: custom_tools.name, enabled: custom_tools.enabled })
          .from(custom_tools),
        providerService.listModels(),
      ]);

      return {
        builtInSkills: builtInSkillListSchema.parse(skills),
        mcpServers: mcpRows,
        customTools: toolRows,
        providerModels: providerModels.map((model) => model.id),
      };
    },
  };

  function buildWorkspacePath(slug: string, id: string): string {
    return join(options.config.paths.subdirectories.agents, `${slug}-${id}`);
  }

  function buildArchiveRoot(): string {
    return join(options.config.paths.subdirectories.agents, ".archived");
  }

  async function reserveSlug(name: string, excludeId?: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let index = 2;

    while (true) {
      const existing = await options.db.query.agents.findFirst({
        where:
          excludeId === undefined
            ? (table, operators) => operators.eq(table.slug, candidate)
            : (table, operators) =>
                operators.and(
                  operators.eq(table.slug, candidate),
                  operators.ne(table.id, excludeId),
                ),
      });

      if (!existing) {
        return candidate;
      }

      candidate = `${base}-${String(index)}`;
      index += 1;
    }
  }
}

function mapAgent(row: typeof agents.$inferSelect): Agent {
  return agentSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    instructions: row.instructions,
    defaultModel: row.default_model,
    iconPath: row.icon_path ?? undefined,
    workspacePath: row.workspace_path,
    status: row.status,
    capabilities: parseCapabilities(row.capabilities_json),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString(),
  });
}

function parseCapabilities(value: string) {
  return agentCapabilitySelectionSchema.parse(JSON.parse(value));
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "agent";
}
