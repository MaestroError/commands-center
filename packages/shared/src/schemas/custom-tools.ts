import { z } from "zod";

export const customToolDriftStatusSchema = z.enum([
  "global_only",
  "agent_only",
  "matching",
  "outdated",
  "modified",
  "unknown",
]);

export const customToolWarningSchema = z.object({
  code: z.enum(["built_in_collision", "existing_copy", "existing_global"]),
  message: z.string().min(1),
});

export const customToolUsageSchema = z.object({
  agentId: z.string().min(1),
  agentSlug: z.string().min(1),
  agentName: z.string().min(1),
  status: customToolDriftStatusSchema,
  copiedAt: z.string().datetime().optional(),
  entryFile: z.string().min(1),
});

export const customToolSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  entryFile: z.string().min(1),
  entryPath: z.string().min(1),
  directoryPath: z.string().min(1),
  fingerprint: z.string().min(1),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  warnings: z.array(customToolWarningSchema).default([]),
  usage: z.array(customToolUsageSchema).default([]),
});

export const customToolListSchema = z.array(customToolSchema);

export const createCustomToolInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
});

export const copyCustomToolToAgentsInputSchema = z.object({
  agentIds: z.array(z.string().min(1)).min(1),
  destinationName: z.string().trim().min(1).optional(),
  overwrite: z.boolean().default(false),
});

export const customToolMutationResultSchema = z.object({
  tool: customToolSchema,
  overwritten: z.boolean(),
  warnings: z.array(customToolWarningSchema).default([]),
});

export const customToolBulkCopyResultSchema = z.object({
  copied: z.array(
    z.object({
      agentId: z.string().min(1),
      agentSlug: z.string().min(1),
      overwritten: z.boolean(),
    }),
  ),
  warnings: z.array(customToolWarningSchema).default([]),
});

export const customToolAgentCopySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  entryFile: z.string().min(1),
  entryPath: z.string().min(1),
  supportDirectoryPath: z.string().min(1).optional(),
  fingerprint: z.string().min(1),
  status: customToolDriftStatusSchema,
  isManaged: z.boolean(),
  sourceToolSlug: z.string().min(1).optional(),
  sourceFingerprint: z.string().min(1).optional(),
  copiedAt: z.string().datetime().optional(),
  warnings: z.array(customToolWarningSchema).default([]),
});

export const customToolAgentCopyListSchema = z.array(customToolAgentCopySchema);

export const importAgentCustomToolInputSchema = z.object({
  destinationName: z.string().trim().min(1).optional(),
  overwrite: z.boolean().default(false),
});

export type CreateCustomToolInput = z.infer<typeof createCustomToolInputSchema>;
export type CopyCustomToolToAgentsInput = z.infer<typeof copyCustomToolToAgentsInputSchema>;
export type CustomTool = z.infer<typeof customToolSchema>;
export type CustomToolAgentCopy = z.infer<typeof customToolAgentCopySchema>;
export type CustomToolBulkCopyResult = z.infer<typeof customToolBulkCopyResultSchema>;
export type CustomToolDriftStatus = z.infer<typeof customToolDriftStatusSchema>;
export type CustomToolMutationResult = z.infer<typeof customToolMutationResultSchema>;
export type CustomToolUsage = z.infer<typeof customToolUsageSchema>;
export type CustomToolWarning = z.infer<typeof customToolWarningSchema>;
export type ImportAgentCustomToolInput = z.infer<typeof importAgentCustomToolInputSchema>;
