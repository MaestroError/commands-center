import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { createId, now } from "../db/ids.js";
import { mcp_servers } from "../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import {
  createMcpServerInputSchema,
  mcpAuthRemoveResultSchema,
  mcpAuthStartResultSchema,
  mcpServerConfigSchema,
  mcpServerListSchema,
  mcpServerSchema,
  updateMcpServerInputSchema,
  type CreateMcpServerInput,
  type McpAuthRemoveResult,
  type McpAuthStartResult,
  type McpRuntimeStatus,
  type McpServer,
  type McpServerConfig,
  type McpTool,
  type UpdateMcpServerInput,
} from "../schemas/mcp.js";
import type { AppDb } from "../db/client.js";
import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";
import type { OpenCodeService } from "./opencode-service.js";
import {
  removeMcpReferences,
  renameMcpReferences,
  rewriteAgentsForMcpChange,
} from "./agent-capability-sync.js";

const OPENCODE_CONFIG_SCHEMA_URL = "https://opencode.ai/config.json";

export type McpServerService = ReturnType<typeof createMcpServerService>;

export function createMcpServerService(options: {
  db: AppDb;
  config: RuntimeConfig;
  orchestrator: OpenCodeOrchestrator;
  opencodeService: OpenCodeService;
}) {
  return {
    async list(): Promise<McpServer[]> {
      const rows = await options.db.query.mcp_servers.findMany({
        orderBy: (table, operators) => [operators.asc(table.name)],
      });

      return mcpServerListSchema.parse(await withRuntime(rows.map(mapMcpServer)));
    },

    async create(input: CreateMcpServerInput): Promise<McpServer> {
      const parsed = createMcpServerInputSchema.parse(input);
      await assertNameAvailable(parsed.name);

      const [row] = await options.db
        .insert(mcp_servers)
        .values({
          id: createId(),
          name: parsed.name,
          transport: parsed.config.transport,
          enabled: parsed.enabled,
          config_json: JSON.stringify(parsed.config),
          created_at: now(),
          updated_at: now(),
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create MCP server record.");
      }

      await syncGlobalConfig();
      await options.orchestrator.restart(`mcp server ${parsed.name} created`);
      return readOne(row);
    },

    async update(id: string, input: UpdateMcpServerInput): Promise<McpServer> {
      const parsed = updateMcpServerInputSchema.parse(input);
      const existing = await getRow(id);
      if (!existing) {
        throw new NotFoundError("MCP server not found.");
      }

      if (existing.name !== parsed.name) {
        await assertNameAvailable(parsed.name, id);
      }

      const [row] = await options.db
        .update(mcp_servers)
        .set({
          name: parsed.name,
          transport: parsed.config.transport,
          config_json: JSON.stringify(parsed.config),
          updated_at: now(),
        })
        .where(eq(mcp_servers.id, id))
        .returning();

      if (!row) {
        throw new Error("Failed to update MCP server record.");
      }

      if (existing.name !== parsed.name) {
        await rewriteAgentsForMcpChange({
          db: options.db,
          config: options.config,
          opencodeService: options.opencodeService,
          transform: (capabilities) =>
            renameMcpReferences(capabilities, existing.name, parsed.name),
        });
      }

      await syncGlobalConfig();
      await options.orchestrator.restart(`mcp server ${parsed.name} updated`);
      return readOne(row);
    },

    async setEnabled(id: string, enabled: boolean): Promise<McpServer> {
      const existing = await getRow(id);
      if (!existing) {
        throw new NotFoundError("MCP server not found.");
      }

      const [row] = await options.db
        .update(mcp_servers)
        .set({ enabled, updated_at: now() })
        .where(eq(mcp_servers.id, id))
        .returning();

      if (!row) {
        throw new Error("Failed to update MCP server state.");
      }

      await syncGlobalConfig();
      await options.orchestrator.restart(
        `mcp server ${existing.name} ${enabled ? "enabled" : "disabled"}`,
      );
      return readOne(row);
    },

    async startAuth(id: string): Promise<McpAuthStartResult> {
      const row = await getRow(id);
      if (!row) {
        throw new NotFoundError("MCP server not found.");
      }

      assertRowSupportsOauth(row);

      const result = await callOpencode(row.name, "start authentication for", () =>
        options.opencodeService.startMcpAuth(options.config.paths.workspaceDir, row.name),
      );
      return mcpAuthStartResultSchema.parse(result);
    },

    async authenticate(id: string): Promise<McpServer> {
      const row = await getRow(id);
      if (!row) {
        throw new NotFoundError("MCP server not found.");
      }

      assertRowSupportsOauth(row);

      const [server] = await withRuntime([mapMcpServer(row)]);
      if (server?.runtimeStatus?.status === "connected") {
        return server;
      }

      await callOpencode(row.name, "authenticate", () =>
        options.opencodeService.authenticateMcp(options.config.paths.workspaceDir, row.name),
      );

      return readOne(row);
    },

    async completeAuth(id: string, code: string): Promise<McpServer> {
      const row = await getRow(id);
      if (!row) {
        throw new NotFoundError("MCP server not found.");
      }

      assertRowSupportsOauth(row);

      await callOpencode(row.name, "complete authentication for", () =>
        options.opencodeService.completeMcpAuth(options.config.paths.workspaceDir, row.name, code),
      );
      return readOne(row);
    },

    async removeAuth(id: string): Promise<McpAuthRemoveResult> {
      const row = await getRow(id);
      if (!row) {
        throw new NotFoundError("MCP server not found.");
      }

      const result = await callOpencode(row.name, "remove credentials for", () =>
        options.opencodeService.removeMcpAuth(options.config.paths.workspaceDir, row.name),
      );
      return mcpAuthRemoveResultSchema.parse(result);
    },

    async remove(id: string): Promise<void> {
      const existing = await getRow(id);
      if (!existing) {
        throw new NotFoundError("MCP server not found.");
      }

      await options.db.delete(mcp_servers).where(eq(mcp_servers.id, id));
      await rewriteAgentsForMcpChange({
        db: options.db,
        config: options.config,
        opencodeService: options.opencodeService,
        transform: (capabilities) => removeMcpReferences(capabilities, existing.name),
      });
      await syncGlobalConfig();
      await options.orchestrator.restart(`mcp server ${existing.name} removed`);
    },
  };

  async function getRow(id: string) {
    return options.db.query.mcp_servers.findFirst({
      where: (table, operators) => operators.eq(table.id, id),
    });
  }

  async function readOne(row: typeof mcp_servers.$inferSelect): Promise<McpServer> {
    const [server] = await withRuntime([mapMcpServer(row)]);

    if (!server) {
      throw new Error("Failed to read MCP server runtime details.");
    }

    return server;
  }

  async function assertNameAvailable(name: string, excludeId?: string): Promise<void> {
    const existing = await options.db.query.mcp_servers.findFirst({
      where:
        excludeId === undefined
          ? (table, operators) => operators.eq(table.name, name)
          : (table, operators) =>
              operators.and(operators.eq(table.name, name), operators.ne(table.id, excludeId)),
    });

    if (existing) {
      throw new ConflictError(`MCP server '${name}' already exists.`);
    }
  }

  async function syncGlobalConfig(): Promise<void> {
    const rows = await options.db.query.mcp_servers.findMany({
      orderBy: (table, operators) => [operators.asc(table.name)],
    });

    const configFilePath = join(options.config.paths.workspaceDir, "opencode.jsonc");
    const current = await readGlobalConfig(configFilePath);
    const next = {
      ...current,
      $schema: OPENCODE_CONFIG_SCHEMA_URL,
      mcp: Object.fromEntries(rows.map((row) => [row.name, renderConfigEntry(row)])),
    };

    await mkdir(options.config.paths.workspaceDir, { recursive: true });
    await writeFile(configFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  async function withRuntime(servers: McpServer[]): Promise<McpServer[]> {
    const [statuses, toolIds] = await Promise.all([
      options.opencodeService.listMcpStatus(options.config.paths.workspaceDir).catch(() => ({})),
      options.opencodeService.listMcpToolIds(options.config.paths.workspaceDir).catch(() => []),
    ]);

    return servers.map((server) =>
      mcpServerSchema.parse({
        ...server,
        runtimeStatus: readStatus(statuses, server.name, server.enabled),
        tools: readTools(toolIds, server.name),
      }),
    );
  }
}

function assertRowSupportsOauth(row: typeof mcp_servers.$inferSelect): void {
  const config = mcpServerConfigSchema.parse(JSON.parse(row.config_json));

  if (config.transport === "stdio") {
    throw new BadRequestError("Local (stdio) MCP servers do not support OAuth authentication.");
  }

  if (config.authMethod !== "oauth") {
    throw new BadRequestError(
      `MCP server '${row.name}' is not configured to use OAuth authentication.`,
    );
  }
}

async function callOpencode<T>(
  serverName: string,
  action: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BadRequestError(`Failed to ${action} MCP server '${serverName}': ${message}`);
  }
}

function readStatus(
  statuses: Record<string, McpRuntimeStatus>,
  name: string,
  enabled: boolean,
): McpRuntimeStatus {
  return statuses[name] ?? { status: enabled ? "disconnected" : "disabled" };
}

function readTools(toolIds: string[], name: string): McpTool[] {
  const prefix = `${name}_`;

  return toolIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => ({ id, name: id.slice(prefix.length) }));
}

async function readGlobalConfig(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function renderConfigEntry(row: typeof mcp_servers.$inferSelect): Record<string, unknown> {
  const config = mcpServerConfigSchema.parse(JSON.parse(row.config_json)) satisfies McpServerConfig;

  if (config.transport === "stdio") {
    return {
      type: "local",
      command: config.command,
      enabled: row.enabled,
      ...(Object.keys(config.environment).length > 0 ? { environment: config.environment } : {}),
    };
  }

  const headers = Object.fromEntries(config.headers.map((header) => [header.key, header.value]));

  return {
    type: "remote",
    url: config.url,
    enabled: row.enabled,
    ...(config.authMethod === "oauth" ? {} : { oauth: false }),
    ...(config.headers.length > 0 ? { headers } : {}),
  };
}

function mapMcpServer(row: typeof mcp_servers.$inferSelect): McpServer {
  return mcpServerSchema.parse({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    config: mcpServerConfigSchema.parse(JSON.parse(row.config_json) as unknown),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}
