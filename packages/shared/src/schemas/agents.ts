import { z } from "zod";

export const permissionActionSchema = z.enum(["allow", "ask", "deny"]);

export const builtInSkillSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  version: z.string().min(1).optional(),
  license: z.string().min(1).optional(),
  compatibility: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.string()).default({}),
  detailsMarkdown: z.string(),
  files: z.array(z.string().min(1)).default([]),
});

export const agentCatalogSchema = z.object({
  builtInSkills: z.array(builtInSkillSchema),
  providerModels: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
    }),
  ),
  mcpServers: z.array(
    z.object({
      name: z.string().min(1),
      enabled: z.boolean(),
    }),
  ),
  customTools: z.array(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      description: z.string(),
      enabled: z.boolean(),
    }),
  ),
});

export const agentPermissionRuleSchema = z.object({
  pattern: z.string().min(1),
  action: permissionActionSchema,
});

export const agentMcpServerSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  action: permissionActionSchema,
});

export const agentCapabilitySelectionSchema = z.object({
  builtInSkills: z.array(z.string().min(1)).default([]),
  customTools: z.array(z.string().min(1)).default([]),
  mcpServers: z.array(agentMcpServerSchema).default([]),
  toolPermissions: z.array(agentPermissionRuleSchema).default([]),
});

export const createAgentInputSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  defaultModel: z.string().trim().min(1),
  iconPath: z.string().trim().min(1).optional(),
  customToolOverwriteSlugs: z.array(z.string().min(1)).default([]),
  capabilities: agentCapabilitySelectionSchema,
});

export const updateAgentInputSchema = createAgentInputSchema.partial().extend({
  name: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  instructions: z.string().trim().min(1).optional(),
  defaultModel: z.string().trim().min(1).optional(),
  capabilities: agentCapabilitySelectionSchema.optional(),
});

export const agentStatusSchema = z.enum(["active", "archived"]);

export const agentSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  instructions: z.string().min(1),
  defaultModel: z.string().min(1),
  iconPath: z.string().min(1).optional(),
  workspacePath: z.string().min(1),
  status: agentStatusSchema,
  capabilities: agentCapabilitySelectionSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});

export const builtInSkillListSchema = z.array(builtInSkillSchema);
export const agentListSchema = z.array(agentSchema);

export type Agent = z.infer<typeof agentSchema>;
export type AgentCatalog = z.infer<typeof agentCatalogSchema>;
export type AgentCapabilitySelection = z.infer<typeof agentCapabilitySelectionSchema>;
export type AgentPermissionRule = z.infer<typeof agentPermissionRuleSchema>;
export type AgentMcpServer = z.infer<typeof agentMcpServerSchema>;
export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type CreateAgentInput = z.input<typeof createAgentInputSchema>;
export type UpdateAgentInput = z.input<typeof updateAgentInputSchema>;
export type BuiltInSkill = z.infer<typeof builtInSkillSchema>;
