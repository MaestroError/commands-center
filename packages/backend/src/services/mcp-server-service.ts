import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { createId, now } from "../db/ids.js";
import { mcp_servers } from "../db/schema/index.js";
import { readConfigFile, writeConfigFileAtomic } from "../lib/config-file.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { WorkspaceReconciler } from "../lib/workspace-reconciler.js";
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
} from "@cc/shared/schemas";
import type { AppDb } from "../db/client.js";
import type { OpenCodeService } from "./opencode-service.js";
import type { SecretService } from "./secret-service.js";
import {
  removeMcpReferences,
  renameMcpReferences,
  rewriteAgentsForMcpChange,
} from "./specialist-capability-sync.js";

const OPENCODE_CONFIG_SCHEMA_URL = "https://opencode.ai/config.json";

// ---------------------------------------------------------------------------
// MCP configuration file schema  (configuration/mcp.json)
// ---------------------------------------------------------------------------

const mcpFileEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  transport: z.string(),
  config: mcpServerConfigSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const mcpFileSchema = z.object({
  version: z.literal(1),
  servers: z.array(mcpFileEntrySchema),
});

type McpFileEntry = z.infer<typeof mcpFileEntrySchema>;

function mcpConfigFilePath(config: RuntimeConfig): string {
  return resolve(config.paths.subdirectories.configuration, "mcp.json");
}

async function readMcpConfigFile(config: RuntimeConfig): Promise<McpFileEntry[]> {
  const path = mcpConfigFilePath(config);

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  // File exists — parse strictly. A corrupt or schema-invalid file must abort
  // the caller rather than return [] and silently overwrite the user's config.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `configuration/mcp.json contains invalid JSON — refusing write to avoid data loss. Fix or delete the file to continue.`,
    );
  }

  const result = mcpFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `configuration/mcp.json failed schema validation — refusing write to avoid data loss. Fix or delete the file to continue.`,
    );
  }

  return result.data.servers;
}

async function writeMcpConfigFile(config: RuntimeConfig, servers: McpFileEntry[]): Promise<void> {
  await writeConfigFileAtomic(mcpConfigFilePath(config), { version: 1, servers });
}

// ---------------------------------------------------------------------------
// Standalone opencode.jsonc sync (used by service and boot reconciler)
// ---------------------------------------------------------------------------

export async function syncGlobalMcpConfig(db: AppDb, config: RuntimeConfig): Promise<void> {
  const rows = await db.query.mcp_servers.findMany({
    orderBy: (table, operators) => [operators.asc(table.name)],
  });

  const configFilePath = join(config.paths.workspaceDir, "opencode.jsonc");
  const current = await readGlobalConfig(configFilePath);
  const next = {
    ...current,
    $schema: OPENCODE_CONFIG_SCHEMA_URL,
    mcp: Object.fromEntries(rows.map((row) => [row.name, renderConfigEntry(row, config)])),
  };

  await mkdir(config.paths.workspaceDir, { recursive: true });
  await writeFile(configFilePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// MCP server — boot reconciler
// ---------------------------------------------------------------------------

export const mcpServerReconciler: WorkspaceReconciler = {
  name: "mcp-servers",

  async reconcile({ config, db, logger }) {
    const data = await readConfigFile(mcpConfigFilePath(config), mcpFileSchema, logger);
    if (!data) return; // file missing — nothing to reconcile

    const servers = data.servers;
    const fileIds = new Set(servers.map((s) => s.id));

    for (const entry of servers) {
      const existing = await db.query.mcp_servers.findFirst({
        where: (t, { eq }) => eq(t.id, entry.id),
      });

      const payload = {
        name: entry.name,
        transport: entry.transport,
        enabled: entry.enabled,
        config_json: JSON.stringify(entry.config),
        updated_at: new Date(entry.updatedAt),
      };

      if (existing) {
        await db.update(mcp_servers).set(payload).where(eq(mcp_servers.id, entry.id));
      } else {
        await db.insert(mcp_servers).values({
          id: entry.id,
          ...payload,
          created_at: new Date(entry.createdAt),
        });
      }
    }

    const existing = await db.select({ id: mcp_servers.id }).from(mcp_servers);
    for (const row of existing) {
      if (!fileIds.has(row.id)) {
        await db.delete(mcp_servers).where(eq(mcp_servers.id, row.id));
      }
    }

    await syncGlobalMcpConfig(db, config);
  },
};

export type McpServerService = ReturnType<typeof createMcpServerService>;

export function createMcpServerService(options: {
  db: AppDb;
  config: RuntimeConfig;
  opencodeService: OpenCodeService;
  secretService: SecretService;
}) {
  return {
    async list(): Promise<McpServer[]> {
      const rows = await options.db.query.mcp_servers.findMany({
        orderBy: (table, operators) => [operators.asc(table.name)],
      });

      return mcpServerListSchema.parse(await withRuntime(rows.map(mapMcpServer)));
    },

    async refresh(): Promise<McpServer[]> {
      await options.opencodeService.disposeGlobal();
      return this.list();
    },

    async create(input: CreateMcpServerInput): Promise<McpServer> {
      const parsed = createMcpServerInputSchema.parse(input);
      await assertNameAvailable(parsed.name);
      const normalizedConfig = await normalizeConfig({
        config: parsed.config,
        serverName: parsed.name,
        secretService: options.secretService,
      });

      const id = createId();
      const timestamp = now();

      // File-first: persist to configuration/mcp.json before DB insert.
      const existingEntries = await readMcpConfigFile(options.config);
      await writeMcpConfigFile(options.config, [
        ...existingEntries,
        {
          id,
          name: parsed.name,
          enabled: parsed.enabled,
          transport: normalizedConfig.transport,
          config: normalizedConfig,
          createdAt: timestamp.toISOString(),
          updatedAt: timestamp.toISOString(),
        },
      ]);

      const [row] = await options.db
        .insert(mcp_servers)
        .values({
          id,
          name: parsed.name,
          transport: normalizedConfig.transport,
          enabled: parsed.enabled,
          config_json: JSON.stringify(normalizedConfig),
          created_at: timestamp,
          updated_at: timestamp,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to create MCP server record.");
      }

      await syncGlobalConfig();
      await options.opencodeService.disposeGlobal();
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

      const normalizedConfig = await normalizeConfig({
        config: parsed.config,
        serverName: parsed.name,
        secretService: options.secretService,
      });

      const updatedAt = now();

      // File-first: update the entry in configuration/mcp.json.
      const entries = await readMcpConfigFile(options.config);
      await writeMcpConfigFile(
        options.config,
        entries.map((e) =>
          e.id === id
            ? {
                ...e,
                name: parsed.name,
                transport: normalizedConfig.transport,
                config: normalizedConfig,
                updatedAt: updatedAt.toISOString(),
              }
            : e,
        ),
      );

      const [row] = await options.db
        .update(mcp_servers)
        .set({
          name: parsed.name,
          transport: normalizedConfig.transport,
          config_json: JSON.stringify(normalizedConfig),
          updated_at: updatedAt,
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
      await options.opencodeService.disposeGlobal();
      return readOne(row);
    },

    async setEnabled(id: string, enabled: boolean): Promise<McpServer> {
      const existing = await getRow(id);
      if (!existing) {
        throw new NotFoundError("MCP server not found.");
      }

      const updatedAt = now();

      // File-first: flip enabled flag in configuration/mcp.json.
      const entries = await readMcpConfigFile(options.config);
      await writeMcpConfigFile(
        options.config,
        entries.map((e) =>
          e.id === id ? { ...e, enabled, updatedAt: updatedAt.toISOString() } : e,
        ),
      );

      const [row] = await options.db
        .update(mcp_servers)
        .set({ enabled, updated_at: updatedAt })
        .where(eq(mcp_servers.id, id))
        .returning();

      if (!row) {
        throw new Error("Failed to update MCP server state.");
      }

      await syncGlobalConfig();
      await options.opencodeService.disposeGlobal();
      return readOne(row);
    },

    async startAuth(id: string): Promise<McpAuthStartResult> {
      const row = await getRow(id);
      if (!row) {
        throw new NotFoundError("MCP server not found.");
      }

      assertRowSupportsOauth(row);
      await syncGlobalConfig();
      // Ensure OpenCode reloads the config so the CC-hosted redirectUri (if any)
      // is applied before the authorization URL is generated.
      await options.opencodeService.disposeGlobal();

      // Clear any stored OAuth client registration so dynamic client registration
      // re-runs against the current redirectUri. A client registered during an
      // earlier attempt (e.g. with OpenCode's default loopback redirect) pins its
      // own redirect_uris, which the provider rejects once the redirect changes
      // ("Invalid redirect_uri for OAuth client").
      await options.opencodeService
        .removeMcpAuth(options.config.paths.workspaceDir, row.name)
        .catch(() => undefined);

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
      await syncGlobalConfig();

      const [server] = await withRuntime([mapMcpServer(row)]);
      if (server?.runtimeStatus?.status === "connected") {
        return server;
      }

      await callOpencode(row.name, "authenticate", () =>
        options.opencodeService.authenticateMcp(options.config.paths.workspaceDir, row.name),
      );

      await options.opencodeService.disposeGlobal();
      return readOne(row);
    },

    async completeAuth(id: string, code: string): Promise<McpServer> {
      const row = await getRow(id);
      if (!row) {
        throw new NotFoundError("MCP server not found.");
      }

      assertRowSupportsOauth(row);
      await syncGlobalConfig();

      await callOpencode(row.name, "complete authentication for", () =>
        options.opencodeService.completeMcpAuth(options.config.paths.workspaceDir, row.name, code),
      );
      await options.opencodeService.disposeGlobal();
      return readOne(row);
    },

    async removeAuth(id: string): Promise<McpAuthRemoveResult> {
      const row = await getRow(id);
      if (!row) {
        throw new NotFoundError("MCP server not found.");
      }

      await syncGlobalConfig();

      const result = await callOpencode(row.name, "remove credentials for", () =>
        options.opencodeService.removeMcpAuth(options.config.paths.workspaceDir, row.name),
      );
      await options.opencodeService.disposeGlobal();
      return mcpAuthRemoveResultSchema.parse(result);
    },

    async remove(id: string): Promise<void> {
      const existing = await getRow(id);
      if (!existing) {
        throw new NotFoundError("MCP server not found.");
      }

      // File-first: remove entry from configuration/mcp.json before DB delete.
      const entries = await readMcpConfigFile(options.config);
      await writeMcpConfigFile(
        options.config,
        entries.filter((e) => e.id !== id),
      );

      await options.db.delete(mcp_servers).where(eq(mcp_servers.id, id));
      await rewriteAgentsForMcpChange({
        db: options.db,
        config: options.config,
        opencodeService: options.opencodeService,
        transform: (capabilities) => removeMcpReferences(capabilities, existing.name),
      });
      await syncGlobalConfig();
      await options.opencodeService.disposeGlobal();
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
    await syncGlobalMcpConfig(options.db, options.config);
  }

  async function withRuntime(servers: McpServer[]): Promise<McpServer[]> {
    const [statuses, toolIds] = await Promise.all([
      options.opencodeService.listMcpStatus(options.config.paths.workspaceDir).catch(() => ({})),
      options.opencodeService.listMcpToolIds(options.config.paths.workspaceDir).catch(() => []),
    ]);

    const missingByServer = await Promise.all(
      servers.map(async (server) => ({
        server,
        missingSecrets: await options.secretService.listMissing(
          listReferencedSecrets(server.config),
        ),
      })),
    );

    return missingByServer.map(({ server, missingSecrets }) =>
      mcpServerSchema.parse({
        ...server,
        missingSecrets,
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

function renderConfigEntry(
  row: typeof mcp_servers.$inferSelect,
  config: RuntimeConfig,
): Record<string, unknown> {
  const serverConfig = mcpServerConfigSchema.parse(
    JSON.parse(row.config_json),
  ) satisfies McpServerConfig;

  if (serverConfig.transport === "stdio") {
    return {
      type: "local",
      command: serverConfig.command,
      enabled: row.enabled,
      ...(Object.keys(serverConfig.environment).length > 0
        ? { environment: serverConfig.environment }
        : {}),
    };
  }

  const headers = Object.fromEntries(
    serverConfig.headers.map((header) => [header.key, header.value]),
  );

  return {
    type: "remote",
    url: serverConfig.url,
    enabled: row.enabled,
    ...renderOauthConfig(row.id, serverConfig, config),
    ...(serverConfig.headers.length > 0 ? { headers } : {}),
  };
}

// Decide what OpenCode `oauth` config a remote server gets.
//
// - Non-OAuth servers: `oauth: false` (OpenCode never attempts a flow).
// - Composio OAuth: left untouched (`{}`) — its loopback flow is unchanged, as
//   Composio is configured separately and OAuth against it is not supported here.
// - Other OAuth servers: point the redirect at a CC-hosted callback so the
//   browser-based flow completes through CC (works on a remote/VPS host) instead
//   of OpenCode's loopback `127.0.0.1:19876` listener.
function renderOauthConfig(
  serverId: string,
  serverConfig: Extract<McpServerConfig, { transport: "streamable-http" | "sse" }>,
  config: RuntimeConfig,
): Record<string, unknown> {
  if (serverConfig.authMethod !== "oauth") {
    return { oauth: false };
  }

  if (isComposioRemoteUrl(serverConfig.url)) {
    return {};
  }

  return { oauth: { redirectUri: buildMcpOauthRedirectUri(serverId, config) } };
}

export function buildMcpOauthRedirectUri(serverId: string, config: RuntimeConfig): string {
  return new URL(
    `/api/mcp-servers/${encodeURIComponent(serverId)}/auth/redirect`,
    config.security.publicOrigin,
  ).toString();
}

function isComposioRemoteUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "composio.dev" || hostname.endsWith(".composio.dev");
  } catch {
    return false;
  }
}

function mapMcpServer(row: typeof mcp_servers.$inferSelect): McpServer {
  return mcpServerSchema.parse({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    config: mcpServerConfigSchema.parse(JSON.parse(row.config_json) as unknown),
    missingSecrets: [],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

async function normalizeConfig(options: {
  config: McpServerConfig;
  serverName: string;
  secretService: SecretService;
}): Promise<McpServerConfig> {
  if (options.config.transport === "stdio") {
    const environmentEntries = await Promise.all(
      Object.entries(options.config.environment).map(
        async ([key, value]) =>
          [
            key,
            await normalizeSecretValue({
              secretService: options.secretService,
              serverName: options.serverName,
              fieldName: key,
              fieldPrefix: "env",
              value,
            }),
          ] as const,
      ),
    );
    const environment = Object.fromEntries(environmentEntries) as Record<string, string>;

    return {
      ...options.config,
      environment,
    };
  }

  const headers = await Promise.all(
    options.config.headers.map(async (header) => ({
      key: header.key,
      value: await normalizeSecretValue({
        secretService: options.secretService,
        serverName: options.serverName,
        fieldName: header.key,
        fieldPrefix: "header",
        value: header.value,
      }),
    })),
  );

  return {
    ...options.config,
    headers,
  };
}

async function normalizeSecretValue(options: {
  secretService: SecretService;
  serverName: string;
  fieldPrefix: string;
  fieldName: string;
  value: string;
}): Promise<string> {
  const referencedSecrets = extractEnvRefs(options.value);

  if (referencedSecrets.length > 0) {
    await options.secretService.ensure(referencedSecrets);
    return options.value;
  }

  const generatedSecretKey = buildManagedSecretKey(
    options.serverName,
    `${options.fieldPrefix}_${options.fieldName}`,
  );
  await options.secretService.set(generatedSecretKey, options.value);

  return `{env:${generatedSecretKey}}`;
}

function listReferencedSecrets(config: McpServerConfig): string[] {
  if (config.transport === "stdio") {
    return Object.values(config.environment).flatMap(extractEnvRefs);
  }

  return config.headers.flatMap((header) => extractEnvRefs(header.value));
}

function extractEnvRefs(value: string): string[] {
  const matches = value.matchAll(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g);
  return [...new Set(Array.from(matches, (match) => match[1] ?? "").filter(Boolean))];
}

function buildManagedSecretKey(serverName: string, fieldName: string): string {
  return `CC_MCP_${sanitizeSecretSegment(serverName)}_${sanitizeSecretSegment(fieldName)}`;
}

function sanitizeSecretSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  return sanitized || "VALUE";
}
