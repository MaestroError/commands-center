import { z } from "zod";

export const mcpTransportSchema = z.enum(["streamable-http", "sse"]);
export const mcpAuthMethodSchema = z.enum(["none", "oauth", "headers"]);

export const mcpHeaderSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

export const mcpServerConfigSchema = z.object({
  url: z.string().trim().url(),
  transport: mcpTransportSchema,
  authMethod: mcpAuthMethodSchema,
  headers: z.array(mcpHeaderSchema).default([]),
});

export const mcpServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  enabled: z.boolean(),
  config: mcpServerConfigSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const mcpServerListSchema = z.array(mcpServerSchema);

export const createMcpServerInputSchema = z.object({
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  config: mcpServerConfigSchema,
});

export const updateMcpServerInputSchema = z.object({
  name: z.string().trim().min(1),
  config: mcpServerConfigSchema,
});

export const setMcpServerEnabledInputSchema = z.object({
  enabled: z.boolean(),
});

export type CreateMcpServerInput = z.infer<typeof createMcpServerInputSchema>;
export type McpAuthMethod = z.infer<typeof mcpAuthMethodSchema>;
export type McpHeader = z.infer<typeof mcpHeaderSchema>;
export type McpServer = z.infer<typeof mcpServerSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
export type McpTransport = z.infer<typeof mcpTransportSchema>;
export type SetMcpServerEnabledInput = z.infer<typeof setMcpServerEnabledInputSchema>;
export type UpdateMcpServerInput = z.infer<typeof updateMcpServerInputSchema>;
