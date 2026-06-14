import { z } from "zod";

export const permissionActionSchema = z.enum(["allow", "ask", "deny"]);
export const specialistMcpOverrideSchema = z.enum(["none", "allow", "ask", "disabled"]);
export const appMcpToolContextSchema = z.enum(["chat", "task_run", "both"]);

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

export const workspaceSkillSchema = builtInSkillSchema;

export const specialistCatalogSchema = z.object({
  builtInSkills: z.array(builtInSkillSchema),
  workspaceSkills: z.array(workspaceSkillSchema),
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
  appMcpServers: z.array(
    z.object({
      name: z.string().min(1),
      enabledByDefault: z.boolean().default(false),
      description: z.string().min(1),
      tools: z
        .array(
          z.object({
            name: z.string().min(1),
            description: z.string().min(1),
            context: appMcpToolContextSchema,
          }),
        )
        .default([]),
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

export const specialistPermissionRuleSchema = z.object({
  pattern: z.string().min(1),
  action: permissionActionSchema,
});

export const specialistMcpServerSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  action: permissionActionSchema,
});

export const specialistAppMcpServerSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  action: permissionActionSchema,
});

export const specialistCapabilitySelectionSchema = z.object({
  builtInSkills: z.array(z.string().min(1)).default([]),
  workspaceSkills: z.array(z.string().min(1)).default([]),
  customTools: z.array(z.string().min(1)).default([]),
  mcpServers: z.array(specialistMcpServerSchema).default([]),
  toolPermissions: z.array(specialistPermissionRuleSchema).default([]),
  appMcpServers: z.array(specialistAppMcpServerSchema).default([]),
  appToolPermissions: z.array(specialistPermissionRuleSchema).default([]),
});

export const createSpecialistInputSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  defaultModel: z.string().trim().min(1),
  iconPath: z.string().trim().min(1).optional(),
  customToolOverwriteSlugs: z.array(z.string().min(1)).default([]),
  capabilities: specialistCapabilitySelectionSchema,
});

export const updateSpecialistInputSchema = createSpecialistInputSchema.partial().extend({
  name: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  instructions: z.string().trim().min(1).optional(),
  defaultModel: z.string().trim().min(1).optional(),
  capabilities: specialistCapabilitySelectionSchema.optional(),
  // When false (default), AGENTS.md is preserved on update so hand-edited rules
  // survive. opencode.jsonc and skills always re-render from capabilities.
  rewriteAgentsMd: z.boolean().default(false),
});

export const specialistStatusSchema = z.enum(["active", "archived"]);

export const specialistSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  instructions: z.string().min(1),
  defaultModel: z.string().min(1),
  iconPath: z.string().min(1).optional(),
  workspacePath: z.string().min(1),
  status: specialistStatusSchema,
  capabilities: specialistCapabilitySelectionSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});

export const builtInSkillListSchema = z.array(builtInSkillSchema);
export const workspaceSkillListSchema = z.array(workspaceSkillSchema);

export type Specialist = z.infer<typeof specialistSchema>;
export type SpecialistCatalog = z.infer<typeof specialistCatalogSchema>;
export type SpecialistMcpOverride = z.infer<typeof specialistMcpOverrideSchema>;
export type SpecialistCapabilitySelection = z.input<typeof specialistCapabilitySelectionSchema>;
export type BuiltInSkill = z.infer<typeof builtInSkillSchema>;
export type WorkspaceSkill = z.infer<typeof workspaceSkillSchema>;
export type CreateSpecialistInput = z.input<typeof createSpecialistInputSchema>;
export type UpdateSpecialistInput = z.input<typeof updateSpecialistInputSchema>;
