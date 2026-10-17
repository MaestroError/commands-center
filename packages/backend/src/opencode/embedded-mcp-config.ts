import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";
import { writeConfigFileAtomic } from "../lib/config-file.js";
import { mcpServerConfigSchema } from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { OpenCodeWorkspaceInput } from "./workspace-contract.js";
import type { EmbeddedMcpOAuthCallbacks } from "./embedded-mcp-oauth-callbacks.js";
import type { EmbeddedMcpServerConfig } from "./embedded-workspace-config.js";

export async function buildEmbeddedMcpDefinitions(
  db: AppDb,
  config: RuntimeConfig,
  appEntries: NonNullable<OpenCodeWorkspaceInput["appMcpEntries"]> = {},
  callbacks?: EmbeddedMcpOAuthCallbacks,
): Promise<Record<string, EmbeddedMcpServerConfig>> {
  const definitions: Record<string, EmbeddedMcpServerConfig> = {};
  for (const row of await db.query.mcp_servers.findMany()) {
    const server = mcpServerConfigSchema.parse(JSON.parse(row.config_json));
    if (Object.hasOwn(appEntries, row.name))
      throw new Error(`MCP server name '${row.name}' is reserved by CC.`);
    definitions[row.name] =
      server.transport === "stdio"
        ? {
            type: "local",
            command: server.command,
            environment: server.environment,
            disabled: !row.enabled,
            timeout: {
              startup: config.timeouts.mcpStdioMs,
              catalog: config.timeouts.mcpStdioMs,
              execution: config.timeouts.mcpStdioMs,
            },
          }
        : {
            type: "remote",
            url: server.url,
            disabled: !row.enabled,
            headers: Object.fromEntries(server.headers.map((header) => [header.key, header.value])),
            oauth:
              server.authMethod === "oauth" ? ((await callbacks?.configure(row.id)) ?? {}) : false,
          };
  }
  for (const [name, server] of Object.entries(appEntries)) {
    definitions[name] = {
      type: "remote",
      url: server.url,
      headers: server.headers,
      oauth: false,
      disabled: !server.enabled,
      ...(server.timeout ? { timeout: { execution: server.timeout } } : {}),
    };
  }
  return definitions;
}

export async function syncEmbeddedGlobalMcpConfig(
  db: AppDb,
  config: RuntimeConfig,
  callbacks?: EmbeddedMcpOAuthCallbacks,
): Promise<void> {
  const path = join(config.paths.workspaceDir, "opencode.jsonc");
  let current: Record<string, unknown> = {};
  try {
    current = z.record(z.string(), z.unknown()).parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const mcp = z.record(z.string(), z.unknown()).parse(current["mcp"] ?? {});
  const servers = await buildEmbeddedMcpDefinitions(db, config, {}, callbacks);
  await writeConfigFileAtomic(path, {
    ...current,
    mcp: {
      ...mcp,
      servers: Object.fromEntries(
        Object.entries(servers).map(([name, server]) => [name, { ...server, codemode: false }]),
      ),
    },
  });
}
