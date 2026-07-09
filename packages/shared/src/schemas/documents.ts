import { z } from "zod";

import { fileManagerFileRevisionSchema } from "./file-manager.js";

const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;
const DEFAULT_DOCUMENT_LIST_LIMIT = 50;
const MAX_DOCUMENT_LIST_LIMIT = 200;

// Windows drive-letter prefix (e.g. `C:` in `C:\notes.md` or `C:/notes.md`),
// which is absolute on Windows even without a leading separator.
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:/;
const BACKSLASH_MESSAGE = "Path must use '/' separators, not backslashes";
export const NEW_DOCUMENT_SUBFOLDER_MESSAGE =
  "New documents must live in at least one folder under Documents/";

// A document path must be relative to Documents/: no leading separator and no
// Windows drive-letter prefix, otherwise `path.resolve` would ignore the root.
function isRelativeDocumentPath(p: string): boolean {
  return !p.startsWith("/") && !WINDOWS_DRIVE_PREFIX.test(p);
}

// Document paths are always `/`-separated for portability. Backslashes are
// rejected outright (rather than split as separators) so the same path means
// the same thing on every OS — on POSIX a `\` would otherwise become a literal
// filename character, on Windows a directory separator.
const documentRelativePathSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isRelativeDocumentPath, { message: "Path must be relative" })
  .refine((p) => !p.includes("\\"), { message: BACKSLASH_MESSAGE })
  .refine((p) => !p.includes(".."), { message: "Path must not contain .." })
  .refine((p) => !p.split("/").some((s) => s === "" || s.startsWith(".")), {
    message: "Path must not contain empty or hidden segments",
  })
  .refine((p) => MARKDOWN_EXTENSIONS.some((ext) => p.toLowerCase().endsWith(ext)), {
    message: "Path must end with .md or .markdown",
  });

const createDocumentPathSchema = documentRelativePathSchema.refine((p) => p.includes("/"), {
  message: NEW_DOCUMENT_SUBFOLDER_MESSAGE,
});

const documentFolderPathSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isRelativeDocumentPath, { message: "Path must be relative" })
  .refine((p) => !p.includes("\\"), { message: BACKSLASH_MESSAGE })
  .refine((p) => !p.includes(".."), { message: "Path must not contain .." })
  .refine((p) => !p.split("/").some((s) => s === "" || s.startsWith(".")), {
    message: "Path must not contain empty or hidden segments",
  });

export const documentScopeSchema = z.enum(["global", "private"]);

const scopedDocumentFields = {
  scope: documentScopeSchema.default("global"),
  ownerSlug: z.string().min(1).nullable().default(null),
  ownerSpecialistId: z.string().min(1).nullable().default(null),
} as const;

export const documentListFilterSchema = z.object({
  query: z.string().trim().min(1).optional(),
  pathContains: z.string().trim().min(1).optional(),
  titleContains: z.string().trim().min(1).optional(),
  descriptionContains: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_DOCUMENT_LIST_LIMIT).default(DEFAULT_DOCUMENT_LIST_LIMIT),
  offset: z.number().int().min(0).default(0),
});

export const documentMetadataSchema = z.object({
  id: z.string().min(1),
  ...scopedDocumentFields,
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
    ...scopedDocumentFields,
    name: z.string().min(1),
    relativePath: z.string().min(1),
    type: z.enum(["file", "directory"]),
    title: z.string().nullable().default(null),
    children: z.array(documentTreeNodeSchema).optional(),
  }),
);

export const privateDocumentTreeGroupSchema = z.object({
  ownerSlug: z.string().min(1),
  ownerSpecialistId: z.string().min(1),
  ownerName: z.string().min(1),
  tree: z.array(documentTreeNodeSchema),
});

export const documentListItemSchema = z.object({
  ...scopedDocumentFields,
  relativePath: z.string().min(1),
  fullPath: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
});

export const documentListResponseSchema = z.object({
  documents: z.array(documentListItemSchema),
  totalMatches: z.number().int().nonnegative().optional(),
  nextOffset: z.number().int().nonnegative().nullable().optional(),
});

export const documentTreeResponseSchema = z.object({
  tree: z.array(documentTreeNodeSchema),
  privateTrees: z.array(privateDocumentTreeGroupSchema).default([]),
});

export const documentReadResponseSchema = z.object({
  ...scopedDocumentFields,
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
  scope: documentScopeSchema.default("global"),
  ownerSlug: z.string().trim().min(1).optional(),
  path: createDocumentPathSchema,
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  author: z.string().trim().min(1).optional(),
  content: z.string().optional(),
});

export const createDocumentFolderInputSchema = z.object({
  scope: documentScopeSchema.default("global"),
  ownerSlug: z.string().trim().min(1).optional(),
  path: documentFolderPathSchema,
});

export const updateDocumentMetadataInputSchema = z.object({
  scope: documentScopeSchema.default("global"),
  ownerSlug: z.string().trim().min(1).optional(),
  path: documentRelativePathSchema,
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  author: z.string().trim().min(1).optional(),
});

export const saveDocumentContentInputSchema = z.object({
  scope: documentScopeSchema.default("global"),
  ownerSlug: z.string().trim().min(1).optional(),
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
export type DocumentScope = z.infer<typeof documentScopeSchema>;
export type DocumentListFilter = z.infer<typeof documentListFilterSchema>;
export type DocumentTreeNode = {
  scope: DocumentScope;
  ownerSlug: string | null;
  ownerSpecialistId: string | null;
  name: string;
  relativePath: string;
  type: "file" | "directory";
  title: string | null;
  children?: DocumentTreeNode[];
};
export type PrivateDocumentTreeGroup = z.infer<typeof privateDocumentTreeGroupSchema>;
export type DocumentListItem = z.infer<typeof documentListItemSchema>;
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
export type DocumentTreeResponse = z.infer<typeof documentTreeResponseSchema>;
export type DocumentReadResponse = z.infer<typeof documentReadResponseSchema>;
export type CreateDocumentInput = z.input<typeof createDocumentInputSchema>;
export type CreateDocumentFolderInput = z.input<typeof createDocumentFolderInputSchema>;
export type UpdateDocumentMetadataInput = z.input<typeof updateDocumentMetadataInputSchema>;
export type SaveDocumentContentInput = z.input<typeof saveDocumentContentInputSchema>;
export type SaveDocumentContentResponse = z.infer<typeof saveDocumentContentResponseSchema>;
export type SearchDocumentsQuery = z.infer<typeof searchDocumentsQuerySchema>;
export type SearchDocumentsResponse = z.infer<typeof searchDocumentsResponseSchema>;
