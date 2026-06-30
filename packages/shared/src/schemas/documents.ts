import { z } from "zod";

import { fileManagerFileRevisionSchema } from "./file-manager.js";

const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;

// Treat both POSIX (`/`) and Windows (`\`) separators when validating, so a
// backslash path cannot smuggle a hidden segment past the per-segment checks.
const PATH_SEPARATORS = /[\\/]/;
// Windows drive-letter prefix (e.g. `C:` in `C:\notes.md` or `C:/notes.md`),
// which is absolute on Windows even without a leading separator.
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;

// A document path must be relative to Documents/: no leading separator and no
// Windows drive-letter prefix, otherwise `path.resolve` would ignore the root.
function isRelativeDocumentPath(p: string): boolean {
  return !PATH_SEPARATORS.test(p[0] ?? "") && !WINDOWS_DRIVE_PREFIX.test(p);
}

const documentRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isRelativeDocumentPath, { message: "Path must be relative" })
  .refine((p) => !p.includes(".."), { message: "Path must not contain .." })
  .refine((p) => !p.split(PATH_SEPARATORS).some((s) => s === "" || s.startsWith(".")), {
    message: "Path must not contain empty or hidden segments",
  })
  .refine((p) => MARKDOWN_EXTENSIONS.some((ext) => p.toLowerCase().endsWith(ext)), {
    message: "Path must end with .md or .markdown",
  });

const documentFolderPathSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isRelativeDocumentPath, { message: "Path must be relative" })
  .refine((p) => !p.includes(".."), { message: "Path must not contain .." })
  .refine((p) => !p.split(PATH_SEPARATORS).some((s) => s === "" || s.startsWith(".")), {
    message: "Path must not contain empty or hidden segments",
  });

export const documentMetadataSchema = z.object({
  id: z.string().min(1),
  relativePath: z.string().min(1),
  title: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative(),
});

export const documentTreeNodeSchema: z.ZodType<DocumentTreeNode> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    relativePath: z.string().min(1),
    type: z.enum(["file", "directory"]),
    title: z.string().nullable().default(null),
    children: z.array(documentTreeNodeSchema).optional(),
  }),
);

export const documentListItemSchema = z.object({
  relativePath: z.string().min(1),
  fullPath: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
});

export const documentListResponseSchema = z.object({
  documents: z.array(documentListItemSchema),
});

export const documentTreeResponseSchema = z.object({
  tree: z.array(documentTreeNodeSchema),
});

export const documentReadResponseSchema = z.object({
  relativePath: z.string().min(1),
  fullPath: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  content: z.string(),
  revision: fileManagerFileRevisionSchema,
  createdAt: z.number().int().nonnegative().nullable().default(null),
  updatedAt: z.number().int().nonnegative().nullable().default(null),
});

export const createDocumentInputSchema = z.object({
  path: documentRelativePathSchema,
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  author: z.string().trim().min(1).optional(),
  content: z.string().optional(),
});

export const createDocumentFolderInputSchema = z.object({
  path: documentFolderPathSchema,
});

export const updateDocumentMetadataInputSchema = z.object({
  path: documentRelativePathSchema,
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  author: z.string().trim().min(1).optional(),
});

export const saveDocumentContentInputSchema = z.object({
  path: documentRelativePathSchema,
  content: z.string(),
  expectedRevision: fileManagerFileRevisionSchema,
});

export const saveDocumentContentResponseSchema = z.object({
  revision: fileManagerFileRevisionSchema,
});

export const searchDocumentsQuerySchema = z.object({
  query: z.string().trim().min(1),
});

export const searchDocumentsResponseSchema = z.object({
  documents: z.array(documentListItemSchema),
});

export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;
export type DocumentTreeNode = {
  name: string;
  relativePath: string;
  type: "file" | "directory";
  title: string | null;
  children?: DocumentTreeNode[];
};
export type DocumentListItem = z.infer<typeof documentListItemSchema>;
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
export type DocumentTreeResponse = z.infer<typeof documentTreeResponseSchema>;
export type DocumentReadResponse = z.infer<typeof documentReadResponseSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentInputSchema>;
export type CreateDocumentFolderInput = z.infer<typeof createDocumentFolderInputSchema>;
export type UpdateDocumentMetadataInput = z.infer<typeof updateDocumentMetadataInputSchema>;
export type SaveDocumentContentInput = z.infer<typeof saveDocumentContentInputSchema>;
export type SaveDocumentContentResponse = z.infer<typeof saveDocumentContentResponseSchema>;
export type SearchDocumentsQuery = z.infer<typeof searchDocumentsQuerySchema>;
export type SearchDocumentsResponse = z.infer<typeof searchDocumentsResponseSchema>;
