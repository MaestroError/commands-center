import { eq } from "drizzle-orm";
import { access } from "node:fs/promises";
import { join } from "node:path";

import {
  agentCapabilitySelectionSchema,
  agentCatalogSchema,
  agentSchema,
  builtInSkillListSchema,
  createAgentInputSchema,
  updateAgentInputSchema,
  type Agent,
  type AgentCatalog,
  type CreateAgentInput,
  type UpdateAgentInput,
} from "../schemas/agents.js";

import { createId, now } from "../db/ids.js";
import { agents, custom_tools, mcp_servers } from "../db/schema/index.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { AppDb } from "../db/client.js";
import type { OpenCodeService } from "./opencode-service.js";
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
  opencodeService: OpenCodeService;
  skillRoot?: string;
}) {
  const skillRoot = options.skillRoot ?? getBuiltInSkillRoot(options.config);
  const providerService = createProviderService({
    config: options.config,
    opencodeService: options.opencodeService,
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

    async getBySlug(slug: string): Promise<Agent | undefined> {
      const row = await options.db.query.agents.findFirst({
        where: (table, operators) => operators.eq(table.slug, slug),
      });

      return row ? mapAgent(row) : undefined;
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
      const workspacePath = buildWorkspacePath(slug);

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
      const nextWorkspacePath = buildWorkspacePath(nextSlug);

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

      await options.opencodeService.dispose(nextWorkspacePath).catch(() => {});

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

      await options.opencodeService.dispose(existing.workspace_path).catch(() => {});

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

    async getCatalog(): Promise<AgentCatalog> {
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

      return agentCatalogSchema.parse({
        builtInSkills: builtInSkillListSchema.parse(skills),
        providerModels: Array.from(
          new Map(
            providerModels.map((model) => {
              const qualifiedId = qualifyModelId(model.providerId, model.id);

              return [qualifiedId, { id: qualifiedId, label: qualifiedId }];
            }),
          ).values(),
        ),
        mcpServers: mcpRows,
        customTools: toolRows,
      });
    },
  };

  function buildWorkspacePath(slug: string): string {
    return join(options.config.paths.subdirectories.agents, slug);
  }

  function buildArchiveRoot(): string {
    return join(options.config.paths.subdirectories.agents, ".archived");
  }

  async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
    const existing = await options.db.query.agents.findFirst({
      where:
        excludeId === undefined
          ? (table, operators) => operators.eq(table.slug, slug)
          : (table, operators) =>
              operators.and(operators.eq(table.slug, slug), operators.ne(table.id, excludeId)),
    });

    if (existing) {
      return true;
    }

    try {
      await access(buildWorkspacePath(slug));
      return true;
    } catch {
      return false;
    }
  }

  async function reserveSlug(name: string, excludeId?: string): Promise<string> {
    const slug = slugify(name);

    if (await isSlugTaken(slug, excludeId)) {
      throw new Error(`Agent identifier '${slug}' is already in use.`);
    }

    return slug;
  }
}

function qualifyModelId(providerId: string, modelId: string): string {
  return modelId.includes("/") ? modelId : `${providerId}/${modelId}`;
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
