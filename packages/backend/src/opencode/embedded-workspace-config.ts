import { mcpPermissionAction, mcpRuntimeToolId } from "./embedded-mcp-permissions.js";
import { z } from "zod";
import { CC_MANAGED_GROUP_METAS } from "../mcp/cc-managed/group-metadata.js";

import { renderOpenCodeRules, type OpenCodeWorkspaceInput } from "./workspace-contract.js";

const timeoutSchema = z
  .object({
    startup: z.number().int().positive().optional(),
    catalog: z.number().int().positive().optional(),
    execution: z.number().int().positive().optional(),
  })
  .strict();
const serverOptions = {
  disabled: z.boolean().optional(),
  timeout: timeoutSchema.optional(),
};
const serverSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...serverOptions,
      type: z.literal("local"),
      command: z.array(z.string()).min(1),
      cwd: z.string().optional(),
      environment: z.record(z.string(), z.string()).optional(),
    })
    .strict(),
  z
    .object({
      ...serverOptions,
      type: z.literal("remote"),
      url: z.string().url(),
      headers: z.record(z.string(), z.string()).optional(),
      oauth: z
        .union([
          z.literal(false),
          z
            .object({
              client_id: z.string().optional(),
              client_secret: z.string().optional(),
              scope: z.string().optional(),
              callback_port: z.number().int().min(1).max(65535).optional(),
              redirect_uri: z.string().url().optional(),
              auth_server_metadata_url: z.string().url().optional(),
            })
            .strict(),
        ])
        .optional(),
    })
    .strict(),
]);
export type EmbeddedMcpServerConfig = z.infer<typeof serverSchema>;

type Permission = { action: string; resource: string; effect: "allow" | "ask" | "deny" };

export function renderEmbeddedWorkspace(
  input: OpenCodeWorkspaceInput,
  definitions: Record<string, EmbeddedMcpServerConfig>,
  plugins: string[] = [],
): { rulesMarkdown: string; configJsonc: string } {
  const selected = [
    ...(input.capabilities.mcpServers ?? []),
    ...Object.entries(input.appMcpEntries ?? {}).map(([name, entry]) => ({
      name,
      enabled: entry.enabled,
      action: "allow" as const,
      ...input.capabilities.appMcpServers?.find((server) => server.name === name),
    })),
    ...(input.capabilities.appMcpServers ?? []).filter(
      (server) => !Object.hasOwn(input.appMcpEntries ?? {}, server.name),
    ),
  ];
  const servers = Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => {
      const server = serverSchema.parse(definition);
      const selection = selected.find((item) => item.name === name);
      return [
        name,
        {
          ...server,
          disabled: server.disabled === true || !selection || selection.enabled === false,
          codemode: false,
        },
      ];
    }),
  );
  for (const server of selected) {
    if (
      server.enabled !== false &&
      !Object.hasOwn(servers, server.name) &&
      !CC_MANAGED_GROUP_METAS.some((group) => group.name === server.name)
    ) {
      throw new Error(`Missing MCP definition for specialist server '${server.name}'.`);
    }
  }
  const permissions: Permission[] = [
    ...selected
      .filter((server) => server.enabled !== false)
      .map((server) => ({
        action: `${server.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_*`,
        resource: "*",
        effect: server.action,
      })),
    ...[
      ...(input.capabilities.toolPermissions ?? []),
      ...(input.capabilities.appToolPermissions ?? []),
    ].map((rule) => ({
      action: rule.pattern,
      resource: "*",
      effect: rule.action,
    })),
  ];
  for (const server of input.capabilities.mcpServers ?? []) {
    permissions.push({
      action: `cc_mcp:${encodeURIComponent(server.name)}:*`,
      resource: "*",
      effect: server.enabled === false ? "deny" : server.action,
    });
  }
  for (const rule of input.capabilities.mcpToolPermissions ?? []) {
    for (const action of [
      mcpPermissionAction(rule.server, rule.tool),
      mcpRuntimeToolId(rule.server, rule.tool),
    ]) {
      permissions.push({ action, resource: "*", effect: rule.action });
    }
  }
  return {
    rulesMarkdown: renderOpenCodeRules(input),
    configJsonc: `${JSON.stringify(
      {
        model: input.defaultModel,
        providers: { openai: { settings: { headerTimeout: 60_000 } } },
        mcp: { servers },
        permissions,
        plugins,
      },
      null,
      2,
    )}\n`,
  };
}
