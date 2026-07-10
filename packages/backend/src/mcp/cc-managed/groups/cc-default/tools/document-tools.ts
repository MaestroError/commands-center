import { z } from "zod";

import type { AppDb } from "../../../../../db/client.js";
import { ConflictError } from "../../../../../lib/api-error.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import { createDocumentService } from "../../../../../services/document-service.js";

const documentListFilterInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring matched against path, title, and description."),
  pathContains: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring matched against the Documents-relative path."),
  titleContains: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring matched against the document title."),
  descriptionContains: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring matched against the document description."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum number of documents to return. Defaults to 50; maximum is 200."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Zero-based offset for paging through filtered results. Defaults to 0."),
});

const listDocumentsOutputSchema = z.object({
  documents: z.array(
    z.object({
      scope: z.enum(["global", "private"]),
      ownerSlug: z.string().nullable(),
      relativePath: z.string(),
      fullPath: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      author: z.string().nullable(),
    }),
  ),
  totalMatches: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
});

const registerDocumentInputSchema = z.object({
  path: z.string().trim().min(1).describe("Path relative to the Documents/ folder."),
  title: z.string().trim().min(1).optional().describe("Human-readable title for the document."),
  description: z.string().trim().optional().describe("Short description of the document."),
  author: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Author name. Defaults to the calling specialist slug."),
});

const registerDocumentOutputSchema = z.object({
  scope: z.enum(["global", "private"]),
  ownerSlug: z.string().nullable(),
  relativePath: z.string(),
  fullPath: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  created: z.boolean(),
});

export const listGlobalDocumentsToolMetadata = {
  name: "list_global_documents",
  description:
    "List markdown documents in the shared global Documents/ folder. Supports simple filters for path, title, and description plus limit/offset paging.",
  context: "both",
} as const;

export const registerGlobalDocumentToolMetadata = {
  name: "register_global_document",
  description:
    "Register or create a shared global document in Documents/. Creates the markdown file if it does not exist and updates metadata for an existing file without overwriting content.",
  context: "both",
} as const;

export const listPrivateDocumentsToolMetadata = {
  name: "list_private_documents",
  description:
    "List markdown documents in your private specialist Documents/ folder. Supports simple filters for path, title, and description plus limit/offset paging.",
  context: "both",
} as const;

export const registerPrivateDocumentToolMetadata = {
  name: "register_private_document",
  description:
    "Register or create a markdown document in your private specialist Documents/ folder. Creates the private Documents/ folder lazily if needed and updates metadata for an existing file without overwriting content.",
  context: "both",
} as const;

function withData(message: string, structuredContent: Record<string, unknown>): string {
  return `${message}\n\n${JSON.stringify(structuredContent, null, 2)}`;
}

export function createDocumentToolDefinitions(options: { db: AppDb; config: RuntimeConfig }) {
  const service = createDocumentService({ db: options.db, config: options.config });

  async function listDocuments(args: unknown, scope: "global" | "private", agentSlug?: string) {
    const parsed = documentListFilterInputSchema.parse(args ?? {});
    const result = await service.list({
      scope,
      ownerSlug: scope === "private" ? agentSlug : undefined,
      filter: parsed,
    });
    const structuredContent = listDocumentsOutputSchema.parse(result);
    const label = scope === "private" ? "private Documents/" : "global Documents/";
    const message =
      structuredContent.documents.length === 0
        ? `No documents found in ${label}.`
        : `Found ${structuredContent.documents.length} of ${structuredContent.totalMatches} matching document(s) in ${label}.`;

    return {
      structuredContent,
      content: [{ type: "text" as const, text: withData(message, structuredContent) }],
    };
  }

  async function registerDocument(args: unknown, scope: "global" | "private", agentSlug: string) {
    const parsed = registerDocumentInputSchema.parse(args);
    const author = parsed.author ?? agentSlug;

    let created = false;
    let doc;

    try {
      doc = await service.create({
        scope,
        ownerSlug: scope === "private" ? agentSlug : undefined,
        path: parsed.path,
        title: parsed.title,
        description: parsed.description,
        author,
      });
      created = true;
    } catch (error) {
      if (error instanceof ConflictError) {
        doc = await service.updateMetadata({
          scope,
          ownerSlug: scope === "private" ? agentSlug : undefined,
          path: parsed.path,
          title: parsed.title,
          description: parsed.description,
          author,
        });
      } else {
        throw error;
      }
    }

    const structuredContent = registerDocumentOutputSchema.parse({
      ...doc,
      created,
    });
    const label = scope === "private" ? "private document" : "global document";
    const message = created
      ? `Created ${label} '${parsed.path}'.`
      : `Updated metadata for existing ${label} '${parsed.path}'.`;

    return {
      structuredContent,
      content: [{ type: "text" as const, text: withData(message, structuredContent) }],
    };
  }

  return [
    {
      name: listGlobalDocumentsToolMetadata.name,
      description: listGlobalDocumentsToolMetadata.description,
      context: listGlobalDocumentsToolMetadata.context,
      inputSchema: documentListFilterInputSchema,
      outputSchema: listDocumentsOutputSchema,
      async execute(args: unknown) {
        try {
          return await listDocuments(args, "global");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to list documents.";
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    },
    {
      name: registerGlobalDocumentToolMetadata.name,
      description: registerGlobalDocumentToolMetadata.description,
      context: registerGlobalDocumentToolMetadata.context,
      inputSchema: registerDocumentInputSchema,
      outputSchema: registerDocumentOutputSchema,
      async execute(args: unknown, context: { agentSlug: string }) {
        try {
          return await registerDocument(args, "global", context.agentSlug);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to register document.";
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    },
    {
      name: listPrivateDocumentsToolMetadata.name,
      description: listPrivateDocumentsToolMetadata.description,
      context: listPrivateDocumentsToolMetadata.context,
      inputSchema: documentListFilterInputSchema,
      outputSchema: listDocumentsOutputSchema,
      async execute(args: unknown, context: { agentSlug: string }) {
        try {
          return await listDocuments(args, "private", context.agentSlug);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to list documents.";
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    },
    {
      name: registerPrivateDocumentToolMetadata.name,
      description: registerPrivateDocumentToolMetadata.description,
      context: registerPrivateDocumentToolMetadata.context,
      inputSchema: registerDocumentInputSchema,
      outputSchema: registerDocumentOutputSchema,
      async execute(args: unknown, context: { agentSlug: string }) {
        try {
          return await registerDocument(args, "private", context.agentSlug);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to register document.";
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    },
  ];
}
