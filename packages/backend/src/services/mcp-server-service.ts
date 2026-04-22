import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { createId, now } from "../db/ids.js";
import { mcp_servers } from "../db/schema/index.js";
import { ConflictError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import {
  createMcpServerInputSchema,
  mcpServerConfigSchema,
  mcpServerListSchema,
  mcpServerSchema,
  updateMcpServerInputSchema,
  type CreateMcpServerInput,
  type McpServer,
  type McpServerConfig,
  type UpdateMcpServerInput,
} from "../schemas/mcp.js";
import type { AppDb } from "../db/client.js";
import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";

const OPENCODE_CONFIG_SCHEMA_URL = "https://opencode.ai/config.json";

export type McpServerService = ReturnType<typeof createMcpServerService>;

export function createMcpServerService(options: {
  db: AppDb;
  config: RuntimeConfig;
  orchestrator: OpenCodeOrchestrator;
}) {
  return {
    async list(): Promise<McpServer[]> {
      const rows = await options.db.query.mcp_servers.findMany({
        orderBy: (table, operators) => [operators.asc(table.name)],
      });

      return mcpServerListSchema.parse(rows.map(mapMcpServer));
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
      return mapMcpServer(row);
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

      await syncGlobalConfig();
      await options.orchestrator.restart(`mcp server ${parsed.name} updated`);
      return mapMcpServer(row);
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
      return mapMcpServer(row);
    },

    async remove(id: string): Promise<void> {
      const existing = await getRow(id);
      if (!existing) {
        throw new NotFoundError("MCP server not found.");
      }

      await options.db.delete(mcp_servers).where(eq(mcp_servers.id, id));
      await syncGlobalConfig();
      await options.orchestrator.restart(`mcp server ${existing.name} removed`);
    },
  };

  async function getRow(id: string) {
    return options.db.query.mcp_servers.findFirst({
      where: (table, operators) => operators.eq(table.id, id),
    });
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
  const headers = Object.fromEntries(config.headers.map((header) => [header.key, header.value]));

  return {
    type: "remote",
    url: config.url,
    enabled: row.enabled,
    ...(config.authMethod === "oauth" ? { oauth: true } : {}),
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
