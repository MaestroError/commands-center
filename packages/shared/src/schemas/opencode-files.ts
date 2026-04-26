import { z } from "zod";

export const opencodeTextSearchQuerySchema = z.object({
  pattern: z.string(),
});

export const opencodeTextSearchSubmatchSchema = z.object({
  match: z.object({
    text: z.string(),
  }),
  start: z.number(),
  end: z.number(),
});

export const opencodeTextSearchMatchSchema = z.object({
  path: z.object({
    text: z.string(),
  }),
  lines: z.object({
    text: z.string(),
  }),
  line_number: z.number(),
  absolute_offset: z.number(),
  submatches: z.array(opencodeTextSearchSubmatchSchema),
});

export const opencodeTextSearchResultSchema = z.array(opencodeTextSearchMatchSchema);

export const opencodeFileSearchQuerySchema = z.object({
  query: z.string(),
  dirs: z.enum(["true", "false"]).optional(),
  type: z.enum(["file", "directory"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const opencodeFileSearchResultSchema = z.array(z.string());

export const opencodeFileListQuerySchema = z.object({
  path: z.string().default("."),
});

export const opencodeFileNodeSchema = z.object({
  name: z.string(),
  path: z.string(),
  absolute: z.string(),
  type: z.enum(["file", "directory"]),
  ignored: z.boolean(),
});

export const opencodeFileListResultSchema = z.array(opencodeFileNodeSchema);

export const opencodeFileContentQuerySchema = z.object({
  path: z.string(),
});

export const opencodeFileContentPatchSchema = z.object({
  oldFileName: z.string(),
  newFileName: z.string(),
  oldHeader: z.string().optional(),
  newHeader: z.string().optional(),
  hunks: z.array(
    z.object({
      oldStart: z.number(),
      oldLines: z.number(),
      newStart: z.number(),
      newLines: z.number(),
      lines: z.array(z.string()),
    }),
  ),
  index: z.string().optional(),
});

export const opencodeFileContentSchema = z.object({
  type: z.enum(["text", "binary"]),
  content: z.string(),
  diff: z.string().optional(),
  patch: opencodeFileContentPatchSchema.optional(),
  encoding: z.literal("base64").optional(),
  mimeType: z.string().optional(),
});

export const opencodeFileStatusSchema = z.object({
  path: z.string(),
  added: z.number().int(),
  removed: z.number().int(),
  status: z.enum(["added", "deleted", "modified"]),
});

export const opencodeFileStatusResultSchema = z.array(opencodeFileStatusSchema);

export type OpencodeTextSearchQuery = z.infer<typeof opencodeTextSearchQuerySchema>;
export type OpencodeTextSearchSubmatch = z.infer<typeof opencodeTextSearchSubmatchSchema>;
export type OpencodeTextSearchMatch = z.infer<typeof opencodeTextSearchMatchSchema>;
export type OpencodeFileSearchQuery = z.infer<typeof opencodeFileSearchQuerySchema>;
export type OpencodeFileListQuery = z.infer<typeof opencodeFileListQuerySchema>;
export type OpencodeFileNode = z.infer<typeof opencodeFileNodeSchema>;
export type OpencodeFileContentQuery = z.infer<typeof opencodeFileContentQuerySchema>;
export type OpencodeFileContent = z.infer<typeof opencodeFileContentSchema>;
export type OpencodeFileStatus = z.infer<typeof opencodeFileStatusSchema>;
