import { z } from "zod";

export const fileManagerRootKindSchema = z.enum([
  "workspace",
  "all-specialists",
  "host-filesystem",
]);

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

export const fileManagerMoveEntryInputSchema = z.object({
  root: fileManagerRootKindSchema,
  path: z.string().min(1),
  destinationPath: z.string().min(1),
});

export const fileManagerMoveEntryResponseSchema = z.object({
  path: z.string().min(1),
});

export const fileManagerDirectorySearchQuerySchema = z.object({
  root: fileManagerRootKindSchema,
  query: z.string().trim().optional(),
  excludePath: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export const fileManagerDirectorySearchResponseSchema = z.object({
  directories: z.array(z.string().min(1)),
});

export const fileManagerDeleteEntryQuerySchema = z.object({
  root: fileManagerRootKindSchema,
  path: z.string().min(1),
});

export const fileManagerUploadEntryInputSchema = z.object({
  name: z.string().trim().min(1),
  relativePath: z.string().trim().min(1),
  contentBase64: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export const fileManagerUploadInputSchema = z.object({
  root: fileManagerRootKindSchema,
  destinationPath: z.string().min(1).optional(),
  entries: z.array(fileManagerUploadEntryInputSchema).min(1),
});

export const fileManagerUploadedEntrySchema = z.object({
  name: z.string().min(1),
  relativePath: z.string().min(1),
  path: z.string().min(1),
});

export const fileManagerRejectedUploadEntrySchema = z.object({
  name: z.string().min(1),
  relativePath: z.string().min(1),
  reason: z.string().min(1),
});

export const fileManagerUploadResponseSchema = z.object({
  uploaded: z.array(fileManagerUploadedEntrySchema),
  rejected: z.array(fileManagerRejectedUploadEntrySchema),
});

export const fileManagerFileRevisionSchema = z.object({
  mtimeMs: z.number(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().min(1).optional(),
});

export const fileManagerFileContentKindSchema = z.enum(["text", "binary", "too-large"]);

export const fileManagerFileContentQuerySchema = z.object({
  root: fileManagerRootKindSchema,
  path: z.string().min(1),
});

export const fileManagerFileContentResponseSchema = z.object({
  root: fileManagerRootKindSchema,
  path: z.string().min(1),
  absolutePath: z.string().min(1),
  name: z.string().min(1),
  kind: fileManagerFileContentKindSchema,
  content: z.string(),
  encoding: z.literal("base64").optional(),
  mimeType: z.string().optional(),
  revision: fileManagerFileRevisionSchema,
  isWritable: z.boolean(),
});

export const fileManagerSaveFileInputSchema = z.object({
  root: fileManagerRootKindSchema,
  path: z.string().min(1),
  content: z.string(),
  encoding: z.literal("base64").optional(),
  expectedRevision: fileManagerFileRevisionSchema,
});

export const fileManagerSaveFileResponseSchema = z.object({
  path: z.string().min(1),
  revision: fileManagerFileRevisionSchema,
});

export const fileManagerConflictDetailsSchema = z.object({
  currentRevision: fileManagerFileRevisionSchema,
});

export const fileManagerPreferencesSchema = z.object({
  allowHostFilesystemEdits: z.boolean().default(false),
  fileUploads: z
    .object({
      maxUploadSizeBytes: z
        .number()
        .int()
        .positive()
        .default(50 * 1024 * 1024),
      allowDangerousFiles: z.boolean().default(false),
    })
    .default({
      maxUploadSizeBytes: 50 * 1024 * 1024,
      allowDangerousFiles: false,
    }),
});

export const fileManagerUpdatePreferencesInputSchema = fileManagerPreferencesSchema;

export const workspaceWatchEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heartbeat"),
    properties: z.object({}),
  }),
  z.object({
    type: z.literal("workspace.changed"),
    properties: z.object({
      version: z.number().int().nonnegative(),
    }),
  }),
]);

export type FileManagerRootKind = z.infer<typeof fileManagerRootKindSchema>;
export type FileManagerEntryType = z.infer<typeof fileManagerEntryTypeSchema>;
export type FileManagerNode = z.infer<typeof fileManagerNodeSchema>;
export type FileManagerListQuery = z.infer<typeof fileManagerListQuerySchema>;
export type FileManagerListResponse = z.infer<typeof fileManagerListResponseSchema>;
export type FileManagerCreateEntryInput = z.infer<typeof fileManagerCreateEntryInputSchema>;
export type FileManagerCreateEntryResponse = z.infer<typeof fileManagerCreateEntryResponseSchema>;
export type FileManagerRenameEntryInput = z.infer<typeof fileManagerRenameEntryInputSchema>;
export type FileManagerRenameEntryResponse = z.infer<typeof fileManagerRenameEntryResponseSchema>;
export type FileManagerMoveEntryInput = z.infer<typeof fileManagerMoveEntryInputSchema>;
export type FileManagerMoveEntryResponse = z.infer<typeof fileManagerMoveEntryResponseSchema>;
export type FileManagerDirectorySearchQuery = z.infer<typeof fileManagerDirectorySearchQuerySchema>;
export type FileManagerDirectorySearchResponse = z.infer<
  typeof fileManagerDirectorySearchResponseSchema
>;
export type FileManagerDeleteEntryQuery = z.infer<typeof fileManagerDeleteEntryQuerySchema>;
export type FileManagerUploadEntryInput = z.infer<typeof fileManagerUploadEntryInputSchema>;
export type FileManagerUploadInput = z.infer<typeof fileManagerUploadInputSchema>;
export type FileManagerUploadedEntry = z.infer<typeof fileManagerUploadedEntrySchema>;
export type FileManagerRejectedUploadEntry = z.infer<typeof fileManagerRejectedUploadEntrySchema>;
export type FileManagerUploadResponse = z.infer<typeof fileManagerUploadResponseSchema>;
export type FileManagerFileRevision = z.infer<typeof fileManagerFileRevisionSchema>;
export type FileManagerFileContentKind = z.infer<typeof fileManagerFileContentKindSchema>;
export type FileManagerFileContentQuery = z.infer<typeof fileManagerFileContentQuerySchema>;
export type FileManagerFileContentResponse = z.infer<typeof fileManagerFileContentResponseSchema>;
export type FileManagerSaveFileInput = z.infer<typeof fileManagerSaveFileInputSchema>;
export type FileManagerSaveFileResponse = z.infer<typeof fileManagerSaveFileResponseSchema>;
export type FileManagerConflictDetails = z.infer<typeof fileManagerConflictDetailsSchema>;
export type FileManagerPreferences = z.infer<typeof fileManagerPreferencesSchema>;
export type FileManagerUpdatePreferencesInput = z.infer<
  typeof fileManagerUpdatePreferencesInputSchema
>;
export type WorkspaceWatchEvent = z.infer<typeof workspaceWatchEventSchema>;
