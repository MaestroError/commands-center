import { z } from "zod";

import { documentScopeSchema } from "./documents.js";
import { fileManagerFileRevisionSchema } from "./file-manager.js";

export const PUBLIC_DOCUMENT_LIST_LIMIT_DEFAULT = 50;
export const PUBLIC_DOCUMENT_LIST_LIMIT_MAX = 200;
export const PUBLIC_DOCUMENT_SEARCH_SNIPPETS_DEFAULT = 3;
export const PUBLIC_DOCUMENT_SEARCH_SNIPPETS_MAX = 10;

const publicDocumentIdentityFields = {
  scope: documentScopeSchema,
  ownerSlug: z.string().min(1).nullable(),
  relativePath: z.string().min(1),
} as const;

export const publicDocumentIdentitySchema = z.object(publicDocumentIdentityFields);

export const publicDocumentSummarySchema = z.object({
  ...publicDocumentIdentityFields,
  title: z.string().min(1),
  description: z.string().nullable(),
  author: z.string().nullable(),
});

export const publicDocumentReadSchema = publicDocumentSummarySchema.extend({
  content: z.string(),
  revision: fileManagerFileRevisionSchema,
  createdAt: z.number().int().nonnegative().nullable(),
  updatedAt: z.number().int().nonnegative().nullable(),
});

export const publicDocumentSearchExcerptSchema = z.object({
  kind: z.enum(["metadata", "content"]),
  field: z.enum(["relativePath", "title", "description", "author", "content"]),
  lineNumber: z.number().int().positive().nullable(),
  excerpt: z.string(),
});

export const publicDocumentSearchMatchSchema = publicDocumentSummarySchema.extend({
  matches: z.array(publicDocumentSearchExcerptSchema),
});

const publicDocumentPagingFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(PUBLIC_DOCUMENT_LIST_LIMIT_MAX)
    .default(PUBLIC_DOCUMENT_LIST_LIMIT_DEFAULT),
  offset: z.number().int().min(0).default(0),
} as const;

export const publicDocumentListInputSchema = z.object({
  scope: documentScopeSchema.optional(),
  ownerSlug: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  ...publicDocumentPagingFields,
});

export const publicDocumentSearchInputSchema = z.object({
  query: z.string().trim().min(1),
  scope: documentScopeSchema.optional(),
  ownerSlug: z.string().trim().min(1).optional(),
  includeContent: z.boolean().default(true),
  maxSnippetsPerDocument: z
    .number()
    .int()
    .min(1)
    .max(PUBLIC_DOCUMENT_SEARCH_SNIPPETS_MAX)
    .default(PUBLIC_DOCUMENT_SEARCH_SNIPPETS_DEFAULT),
  ...publicDocumentPagingFields,
});

export const publicDocumentReadInputSchema = z
  .object({
    scope: documentScopeSchema,
    ownerSlug: z.string().trim().min(1).optional(),
    path: z.string().trim().min(1),
  })
  .superRefine((input, context) => {
    if (input.scope === "private" && !input.ownerSlug) {
      context.addIssue({
        code: "custom",
        path: ["ownerSlug"],
        message: "Private documents require an ownerSlug",
      });
    }
    if (input.scope === "global" && input.ownerSlug) {
      context.addIssue({
        code: "custom",
        path: ["ownerSlug"],
        message: "Global documents must not specify an ownerSlug",
      });
    }
  });

export const publicDocumentListResponseSchema = z.object({
  documents: z.array(publicDocumentSummarySchema),
  totalMatches: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
});

export const publicDocumentSearchResponseSchema = z.object({
  documents: z.array(publicDocumentSearchMatchSchema),
  totalMatches: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
});

export type PublicDocumentIdentity = z.infer<typeof publicDocumentIdentitySchema>;
export type PublicDocumentSummary = z.infer<typeof publicDocumentSummarySchema>;
export type PublicDocumentRead = z.infer<typeof publicDocumentReadSchema>;
export type PublicDocumentSearchExcerpt = z.infer<typeof publicDocumentSearchExcerptSchema>;
export type PublicDocumentSearchMatch = z.infer<typeof publicDocumentSearchMatchSchema>;
export type PublicDocumentListInput = z.input<typeof publicDocumentListInputSchema>;
export type PublicDocumentSearchInput = z.input<typeof publicDocumentSearchInputSchema>;
export type PublicDocumentReadInput = z.input<typeof publicDocumentReadInputSchema>;
export type PublicDocumentListResponse = z.infer<typeof publicDocumentListResponseSchema>;
export type PublicDocumentSearchResponse = z.infer<typeof publicDocumentSearchResponseSchema>;
