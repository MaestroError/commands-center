import { z } from "zod";

export const fileManagerRootKindSchema = z.enum(["workspace", "all-agents", "host-filesystem"]);

export const fileManagerEntryTypeSchema = z.enum(["file", "directory"]);

export const fileManagerNodeSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  absolutePath: z.string().min(1),
  type: fileManagerEntryTypeSchema,
  sizeBytes: z.number().int().nonnegative().optional(),
  lineCount: z.number().int().nonnegative().optional(),
  isCritical: z.boolean().default(false),
  criticalReason: z.string().min(1).optional(),
});

export const fileManagerListQuerySchema = z.object({
  root: fileManagerRootKindSchema,
  path: z.string().min(1).optional(),
});

export const fileManagerListResponseSchema = z.object({
  root: fileManagerRootKindSchema,
  currentPath: z.string().min(1),
  absolutePath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  lineCount: z.number().int().nonnegative().optional(),
  nodes: z.array(fileManagerNodeSchema),
});

export const fileManagerCreateEntryInputSchema = z.object({
  root: fileManagerRootKindSchema,
  parentPath: z.string().min(1).optional(),
  name: z.string().trim().min(1),
  type: fileManagerEntryTypeSchema,
});

export const fileManagerCreateEntryResponseSchema = z.object({
  path: z.string().min(1),
});

export const fileManagerRenameEntryInputSchema = z.object({
  root: fileManagerRootKindSchema,
  path: z.string().min(1),
  name: z.string().trim().min(1),
});

export const fileManagerRenameEntryResponseSchema = z.object({
  path: z.string().min(1),
});

export const fileManagerDeleteEntryQuerySchema = z.object({
  root: fileManagerRootKindSchema,
  path: z.string().min(1),
});

export type FileManagerRootKind = z.infer<typeof fileManagerRootKindSchema>;
export type FileManagerEntryType = z.infer<typeof fileManagerEntryTypeSchema>;
export type FileManagerNode = z.infer<typeof fileManagerNodeSchema>;
export type FileManagerListQuery = z.infer<typeof fileManagerListQuerySchema>;
export type FileManagerListResponse = z.infer<typeof fileManagerListResponseSchema>;
export type FileManagerCreateEntryInput = z.infer<typeof fileManagerCreateEntryInputSchema>;
export type FileManagerCreateEntryResponse = z.infer<typeof fileManagerCreateEntryResponseSchema>;
export type FileManagerRenameEntryInput = z.infer<typeof fileManagerRenameEntryInputSchema>;
export type FileManagerRenameEntryResponse = z.infer<typeof fileManagerRenameEntryResponseSchema>;
export type FileManagerDeleteEntryQuery = z.infer<typeof fileManagerDeleteEntryQuerySchema>;
