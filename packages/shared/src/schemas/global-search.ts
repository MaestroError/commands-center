import { z } from "zod";

export const globalSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export const globalSearchFileNameMatchSchema = z.object({
  path: z.string().min(1),
});

export const globalSearchFileContentMatchSchema = z.object({
  path: z.string().min(1),
  lineNumber: z.number().int().nonnegative(),
  lineText: z.string(),
});

export const globalSearchWorkspaceFilesResponseSchema = z.object({
  nameMatches: z.array(globalSearchFileNameMatchSchema),
  contentMatches: z.array(globalSearchFileContentMatchSchema),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;
export type GlobalSearchFileNameMatch = z.infer<typeof globalSearchFileNameMatchSchema>;
export type GlobalSearchFileContentMatch = z.infer<typeof globalSearchFileContentMatchSchema>;
export type GlobalSearchWorkspaceFilesResponse = z.infer<
  typeof globalSearchWorkspaceFilesResponseSchema
>;
