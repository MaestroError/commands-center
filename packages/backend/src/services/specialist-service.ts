import { eq } from "drizzle-orm";
import { access } from "node:fs/promises";
import { join } from "node:path";

import {
  specialistCapabilitySelectionSchema,
  specialistCatalogSchema,
  specialistSchema,
  builtInSkillListSchema,
  createSpecialistInputSchema,
  updateSpecialistInputSchema,
  workspaceSkillListSchema,
  type Specialist,
  type SpecialistCapabilitySelection,
  type SpecialistCatalog,
  type CreateSpecialistInput,
  type UpdateSpecialistInput,
} from "@cc/shared/schemas";

import { createId, now } from "../db/ids.js";
import { agents, mcp_servers } from "../db/schema/index.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { AppDb } from "../db/client.js";
import { ConflictError } from "../lib/api-error.js";
import type { OpenCodeService } from "./opencode-service.js";
import { normalizeSpecialistCapabilities } from "./specialist-capability-sync.js";
import { createCustomToolService, type CustomToolService } from "./custom-tool-service.js";
import { createProviderService } from "./provider-service.js";
import { createCcManagedMcpAuthStateStore } from "../mcp/cc-managed/auth-state-store.js";
import { createCcManagedMcpAuthTokenService } from "../mcp/cc-managed/auth-token-service.js";
import {
  createCcManagedMcpServerRegistry,
  listCcManagedMcpServers,
} from "../mcp/cc-managed/server-registry.js";
import { createCcManagedMcpToolAccessService } from "../mcp/cc-managed/tool-access-service.js";
import { createCcManagedMcpWorkspaceEntryService } from "../mcp/cc-managed/workspace-entry-service.js";
import {
  archiveWorkspace,
  getBuiltInSkillRoot,
  getWorkspaceSkillRoot,
  listBuiltInSkills,
  moveWorkspace,
  prepareWorkspace,
  resolveSpecialistWorkspacePath,
} from "./specialist-workspace.js";
import { writeSpecialistFile } from "./specialist-file.js";

export type SpecialistService = ReturnType<typeof createSpecialistService>;

export function createSpecialistService(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: OpenCodeService;
  customToolService?: CustomToolService;
  skillRoot?: string;
}) {
  const skillRoot = options.skillRoot ?? getBuiltInSkillRoot(options.config);
  const workspaceSkillRoot = getWorkspaceSkillRoot(options.config);
  const providerService = createProviderService({
    config: options.config,
    opencodeService: options.opencodeService,
  });
  const customToolService =
    options.customToolService ??
    createCustomToolService({
      config: options.config,
      db: options.db,
      opencodeService: options.opencodeService,
    });
  const appMcpAuthStateStore = createCcManagedMcpAuthStateStore(options.config);
  const appMcpRegistry = createCcManagedMcpServerRegistry({
    customToolService,
  });
  const appMcpAuthTokenService = createCcManagedMcpAuthTokenService({
    authStateStore: appMcpAuthStateStore,
  });
  const appMcpToolAccessService = createCcManagedMcpToolAccessService();
  const appMcpWorkspaceEntryService = createCcManagedMcpWorkspaceEntryService({
    config: options.config,
    authTokenService: appMcpAuthTokenService,
    toolAccessService: appMcpToolAccessService,
    registry: appMcpRegistry,
  });

  return {
    async list(includeArchived = false): Promise<Specialist[]> {
      const rows = await options.db.query.agents.findMany({
        where: includeArchived
          ? undefined
          : (table, operators) => operators.eq(table.status, "active"),
        orderBy: (table, operators) => [operators.desc(table.updated_at)],
      });

      return rows.map(mapSpecialist);
    },

    async getBySlug(slug: string): Promise<Specialist | undefined> {
      const row = await options.db.query.agents.findFirst({
        where: (table, operators) => operators.eq(table.slug, slug),
      });

      return row ? mapSpecialist(row) : undefined;
    },

    async get(id: string): Promise<Specialist | undefined> {
      const row = await options.db.query.agents.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });

      return row ? mapSpecialist(row) : undefined;
    },

    async create(input: CreateSpecialistInput): Promise<Specialist> {
      const parsed = createSpecialistInputSchema.parse(input);
      const id = createId();
      const slug = await reserveSlug(parsed.name);
      const timestamp = now();
      const workspacePath = buildWorkspacePath(slug);
      const capabilities = await normalizeCapabilities(parsed.capabilities);
      const appMcpEntries = await appMcpWorkspaceEntryService.buildEntries({
        slug,
        capabilities,
      });

      await prepareWorkspace({
        config: options.config,
        workspacePath,
        input: {
          name: parsed.name,
          role: parsed.role,
          instructions: parsed.instructions,
          defaultModel: parsed.defaultModel,
          capabilities,
          appMcpEntries,
        },
        skillRoot,
        workspaceSkillRoot,
      });

      await customToolService.syncSpecialistAssignments({
        workspacePath,
        selectedToolSlugs: capabilities.customTools ?? [],
        overwriteSlugs: parsed.customToolOverwriteSlugs,
      });

      // File-first: specialist.json is the source of record for the derived row.
      await writeSpecialistFile(options.config, slug, "active", {
        id,
        name: parsed.name,
        role: parsed.role,
        instructions: parsed.instructions,
        defaultModel: parsed.defaultModel,
        iconPath: parsed.iconPath,
        capabilities,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
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
          status: "active",
          capabilities_json: JSON.stringify(capabilities),
          created_at: timestamp,
          updated_at: timestamp,
          archived_at: null,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create specialist record.");
      }

      return mapSpecialist(row);
    },

    async update(id: string, input: UpdateSpecialistInput): Promise<Specialist | undefined> {
      const parsed = updateSpecialistInputSchema.parse(input);
      const existing = await options.db.query.agents.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });

      if (!existing) {
        return undefined;
      }

      const nextName = parsed.name ?? existing.name;
      const nextSlug = parsed.name ? await reserveSlug(parsed.name, id) : existing.slug;
      const nextWorkspacePath = buildWorkspacePath(nextSlug);
      const currentWorkspacePath = resolveWorkspacePath(existing);

      if (currentWorkspacePath !== nextWorkspacePath) {
        await moveWorkspace(currentWorkspacePath, nextWorkspacePath);
      }

      const capabilities = parsed.capabilities ?? parseCapabilities(existing.capabilities_json);
      const normalizedCapabilities = await normalizeCapabilities(capabilities);
      const appMcpEntries = await appMcpWorkspaceEntryService.buildEntries({
        slug: nextSlug,
        capabilities: normalizedCapabilities,
      });
      const workspaceInput = {
        name: nextName,
        role: parsed.role ?? existing.role,
        instructions: parsed.instructions ?? existing.instructions,
        defaultModel: parsed.defaultModel ?? existing.default_model,
        capabilities: normalizedCapabilities,
        appMcpEntries,
      };

      await prepareWorkspace({
        config: options.config,
        workspacePath: nextWorkspacePath,
        input: workspaceInput,
        skillRoot,
        workspaceSkillRoot,
        // AGENTS.md is preserved on update unless the caller opts in; opencode.jsonc
        // and skills always re-render so capability changes take effect.
        writeRules: parsed.rewriteAgentsMd,
      });

      await customToolService.syncSpecialistAssignments({
        workspacePath: nextWorkspacePath,
        selectedToolSlugs: normalizedCapabilities.customTools ?? [],
        overwriteSlugs: parsed.customToolOverwriteSlugs,
      });

      await options.opencodeService.dispose(nextWorkspacePath).catch(() => {});

      const updatedAt = now();
      const nextIconPath = parsed.iconPath ?? existing.icon_path;

      // File-first: specialist.json is the source of record for the derived row.
      await writeSpecialistFile(options.config, nextSlug, "active", {
        id,
        name: workspaceInput.name,
        role: workspaceInput.role,
        instructions: workspaceInput.instructions,
        defaultModel: workspaceInput.defaultModel,
        iconPath: nextIconPath ?? undefined,
        capabilities: normalizedCapabilities,
        createdAt: existing.created_at.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });

      const [row] = await options.db
        .update(agents)
        .set({
          slug: nextSlug,
          name: workspaceInput.name,
          role: workspaceInput.role,
          instructions: workspaceInput.instructions,
          default_model: workspaceInput.defaultModel,
          icon_path: nextIconPath,
          capabilities_json: JSON.stringify(normalizedCapabilities),
          updated_at: updatedAt,
        })
        .where(eq(agents.id, id))
        .returning();

      if (!row) {
        throw new Error("Failed to update specialist record.");
      }

      return mapSpecialist(row);
    },

    async archive(id: string): Promise<Specialist | undefined> {
      const existing = await options.db.query.agents.findFirst({
        where: (table, operators) => operators.eq(table.id, id),
      });

      if (!existing) {
        return undefined;
      }

      if (existing.status === "archived") {
        return mapSpecialist(existing);
      }

      const workspacePath = resolveWorkspacePath(existing);

      await options.opencodeService.dispose(workspacePath).catch(() => {});

      await archiveWorkspace(workspacePath, buildArchiveRoot());
      const archivedAt = now();
      const [row] = await options.db
        .update(agents)
        .set({
          status: "archived",
          archived_at: archivedAt,
          updated_at: archivedAt,
        })
        .where(eq(agents.id, id))
        .returning();

      if (!row) {
        throw new Error("Failed to archive specialist record.");
      }

      return mapSpecialist(row);
    },

    async getCatalog(): Promise<SpecialistCatalog> {
      const [skills, workspaceSkills, mcpRows, toolRows, providerModels] = await Promise.all([
        listBuiltInSkills(skillRoot),
        listBuiltInSkills(workspaceSkillRoot),
        options.db
          .select({ name: mcp_servers.name, enabled: mcp_servers.enabled })
          .from(mcp_servers),
        options.customToolService?.listGlobal() ?? Promise.resolve([]),
        providerService.listModels(),
      ]);

      const ccManagedMcpServers = listCcManagedMcpServers(appMcpRegistry).map((server) => ({
        name: server.name,
        enabledByDefault: server.enabledByDefault,
        systemManaged: server.systemManaged,
        description: server.description,
        tools: server.catalogTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          context: tool.context,
        })),
      }));

      return specialistCatalogSchema.parse({
        builtInSkills: builtInSkillListSchema.parse(skills),
        workspaceSkills: workspaceSkillListSchema.parse(workspaceSkills),
        providerModels: Array.from(
          new Map(
            providerModels.map((model) => {
              const qualifiedId = qualifyModelId(model.providerId, model.id);

              return [qualifiedId, { id: qualifiedId, label: qualifiedId }];
            }),
          ).values(),
        ),
        mcpServers: mcpRows,
        appMcpServers: ccManagedMcpServers
          .filter((server) => !server.systemManaged)
          .map((server) => ({
            name: server.name,
            enabledByDefault: server.enabledByDefault,
            description: server.description,
            tools: server.tools,
          })),
        ccManagedMcpServers,
        customTools: toolRows.map((tool) => ({
          slug: tool.slug,
          name: tool.name,
          description: tool.description,
          enabled: tool.enabled,
        })),
      });
    },
  };

  function buildWorkspacePath(slug: string): string {
    return join(options.config.paths.subdirectories.specialists, slug);
  }

  function buildArchiveRoot(): string {
    return join(options.config.paths.subdirectories.specialists, ".archived");
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

    // If we're updating a specialist, check whether the directory belongs to it.
    if (excludeId) {
      const self = await options.db.query.agents.findFirst({
        where: (table, operators) => operators.eq(table.id, excludeId),
      });
      if (self?.slug === slug) {
        return false;
      }
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
      throw new ConflictError(`Specialist identifier '${slug}' is already in use.`);
    }

    return slug;
  }

  async function normalizeCapabilities(
    capabilities: SpecialistCapabilitySelection,
  ): Promise<SpecialistCapabilitySelection> {
    const rows = await options.db.select({ name: mcp_servers.name }).from(mcp_servers);
    return specialistCapabilitySelectionSchema.parse(
      normalizeSpecialistCapabilities(
        capabilities,
        rows.map((row) => row.name),
        listCcManagedMcpServers(appMcpRegistry).map((row) => row.name),
      ),
    );
  }

  function resolveWorkspacePath(row: typeof agents.$inferSelect): string {
    return resolveSpecialistWorkspacePath({
      config: options.config,
      slug: row.slug,
      status: row.status === "archived" ? "archived" : "active",
    });
  }

  function mapSpecialist(row: typeof agents.$inferSelect): Specialist {
    return specialistSchema.parse({
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      instructions: row.instructions,
      defaultModel: row.default_model,
      iconPath: row.icon_path ?? undefined,
      workspacePath: resolveWorkspacePath(row),
      status: row.status,
      capabilities: parseCapabilities(row.capabilities_json),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      archivedAt: row.archived_at?.toISOString(),
    });
  }
}

function qualifyModelId(providerId: string, modelId: string): string {
  const prefix = `${providerId}/`;
  return modelId.startsWith(prefix) ? modelId : `${prefix}${modelId}`;
}

function parseCapabilities(value: string) {
  return specialistCapabilitySelectionSchema.parse(JSON.parse(value));
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "specialist";
}
