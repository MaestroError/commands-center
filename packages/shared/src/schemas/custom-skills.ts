import { z } from "zod";

import { fileManagerUploadEntryInputSchema } from "./file-manager.js";
import { workspaceSkillSchema } from "./specialists.js";

export const createWorkspaceSkillInputSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().optional(),
  description: z.string().trim().min(1),
});

export const workspaceSkillMutationResultSchema = z.object({
  skill: workspaceSkillSchema,
  overwritten: z.boolean().default(false),
});

export const workspaceSkillUploadInputSchema = z.object({
  entries: z.array(fileManagerUploadEntryInputSchema).min(1),
  overwrite: z.boolean().default(false),
});

export const updateWorkspaceSkillCategoryInputSchema = z.object({
  category: z.string().trim().min(1),
});

export type CreateWorkspaceSkillInput = z.infer<typeof createWorkspaceSkillInputSchema>;
export type WorkspaceSkillMutationResult = z.infer<typeof workspaceSkillMutationResultSchema>;
export type WorkspaceSkillUploadInput = z.infer<typeof workspaceSkillUploadInputSchema>;
export type UpdateWorkspaceSkillCategoryInput = z.infer<
  typeof updateWorkspaceSkillCategoryInputSchema
>;
