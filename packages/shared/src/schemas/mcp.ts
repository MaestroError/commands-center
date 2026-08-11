import { z } from "zod";

// OpenCode derives every MCP tool id as `sanitize(serverName)_sanitize(toolName)`,
// replacing anything outside this character set with "_". A name CC accepts but
// OpenCode rewrites would silently break permission patterns, which are matched
// against the derived tool id. Reject those names instead of compensating for
// them at each rendering site.
export const mcpServerNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "MCP server name may only contain letters, digits, underscores, and hyphens.",
  );

// The name a user-facing label is stored under. Two labels that derive to the
// same name would produce the same OpenCode tool-id prefix and clobber each
// other, so this is also the comparison used for uniqueness — it is stricter
// than OpenCode's own sanitize (it lowercases and collapses runs), which means
// it cannot miss a collision OpenCode would create.
export function toMcpServerName(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const mcpTransportSchema = z.enum(["streamable-http", "sse", "stdio"]);
export const mcpAuthMethodSchema = z.enum(["none", "oauth", "headers"]);

export const mcpHeaderSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

export const mcpRemoteServerConfigSchema = z.object({
  transport: z.enum(["streamable-http", "sse"]),
  url: z.string().trim().url(),
  authMethod: mcpAuthMethodSchema,
  headers: z.array(mcpHeaderSchema).default([]),
});

export const mcpStdioServerConfigSchema = z.object({
  transport: z.literal("stdio"),
  command: z.array(z.string().trim().min(1)).min(1),
  environment: z.record(z.string().trim().min(1), z.string()).default({}),
});

export const mcpServerConfigSchema = z.discriminatedUnion("transport", [
  mcpRemoteServerConfigSchema,
  mcpStdioServerConfigSchema,
]);

export const mcpRuntimeStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("connected") }),
  z.object({ status: z.literal("disabled") }),
  z.object({ status: z.literal("needs_auth") }),
  z.object({ status: z.literal("disconnected") }),
  z.object({ status: z.literal("needs_client_registration"), error: z.string().min(1) }),
  z.object({ status: z.literal("failed"), error: z.string().min(1) }),
]);

export const mcpToolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const mcpToolListSchema = z.array(mcpToolSchema);

export const mcpAuthStartResultSchema = z.object({
  authorizationUrl: z.string(),
});

export const mcpAuthRemoveResultSchema = z.object({
  success: z.literal(true),
});

export const MCP_ENGINE_RESTART_REQUIRED_REASON = "engine_restart_required";

export const activateMcpServerInputSchema = z.object({
  restartEngine: z.boolean().default(false),
});

export const mcpServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  enabled: z.boolean(),
  config: mcpServerConfigSchema,
  missingSecrets: z.array(z.string().trim().min(1)).default([]),
  requiresEngineRestart: z.boolean().default(false),
  runtimeStatus: mcpRuntimeStatusSchema.optional(),
  tools: mcpToolListSchema.default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const mcpServerListSchema = z.array(mcpServerSchema);

export const createMcpServerInputSchema = z.object({
  name: mcpServerNameSchema,
  enabled: z.boolean().default(true),
  config: mcpServerConfigSchema,
});

export const updateMcpServerInputSchema = z.object({
  name: mcpServerNameSchema,
  config: mcpServerConfigSchema,
});

export const setMcpServerEnabledInputSchema = z.object({
  enabled: z.boolean(),
});

export type CreateMcpServerInput = z.infer<typeof createMcpServerInputSchema>;
export type ActivateMcpServerInput = z.infer<typeof activateMcpServerInputSchema>;
export type McpAuthRemoveResult = z.infer<typeof mcpAuthRemoveResultSchema>;
export type McpAuthStartResult = z.infer<typeof mcpAuthStartResultSchema>;
export type McpAuthMethod = z.infer<typeof mcpAuthMethodSchema>;
export type McpHeader = z.infer<typeof mcpHeaderSchema>;
export type McpServer = z.infer<typeof mcpServerSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
export type McpRuntimeStatus = z.infer<typeof mcpRuntimeStatusSchema>;
export type McpTool = z.infer<typeof mcpToolSchema>;
export type McpTransport = z.infer<typeof mcpTransportSchema>;
export type SetMcpServerEnabledInput = z.infer<typeof setMcpServerEnabledInputSchema>;
export type UpdateMcpServerInput = z.infer<typeof updateMcpServerInputSchema>;
