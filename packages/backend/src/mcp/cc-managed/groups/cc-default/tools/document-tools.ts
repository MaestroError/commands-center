import { z } from "zod";

import type { AppDb } from "../../../../../db/client.js";
import { ConflictError } from "../../../../../lib/api-error.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import { createDocumentService } from "../../../../../services/document-service.js";

const listProjectDocumentsOutputSchema = z.object({
  documents: z.array(
    z.object({
      relativePath: z.string(),
      fullPath: z.string(),
      title: z.string(),
      description: z.string().nullable(),
    }),
  ),
});

const registerProjectDocumentInputSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .describe("Path relative to the Documents/ folder, e.g. 'design/overview.md'."),
  title: z.string().trim().min(1).optional().describe("Human-readable title for the document."),
  description: z.string().trim().optional().describe("Short description of the document."),
  author: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Author name. Defaults to the calling specialist slug."),
});

const registerProjectDocumentOutputSchema = z.object({
  relativePath: z.string(),
  fullPath: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  author: z.string().nullable(),
  created: z.boolean(),
});

export const listProjectDocumentsToolMetadata = {
  name: "list_project_documents",
  description:
    "List all markdown documents in the project Documents/ folder with their relative path, full path, title, and short description.",
  context: "both",
} as const;

export const registerProjectDocumentToolMetadata = {
  name: "register_project_document",
  description:
    "Register or create a project document. Creates the markdown file if it does not exist. " +
    "Updates metadata for an existing file without overwriting its content. When running " +
    "inside a task, also attach the document to the run with add_task_artifact using type " +
    '"document" and the same Documents-relative path so the user can open it in the Documents module.',
  context: "both",
} as const;

// Appends the full structured result to the tool's text output so the UI's
// tool-call log (and any consumer reading content[].text) shows the exact
// data the specialist received, not just a short confirmation string.
function withData(message: string, structuredContent: Record<string, unknown>): string {
  return `${message}\n\n${JSON.stringify(structuredContent, null, 2)}`;
}

export function createDocumentToolDefinitions(options: { db: AppDb; config: RuntimeConfig }) {
  const service = createDocumentService({ db: options.db, config: options.config });

  return [
    {
      name: listProjectDocumentsToolMetadata.name,
      description: listProjectDocumentsToolMetadata.description,
      context: listProjectDocumentsToolMetadata.context,
      outputSchema: listProjectDocumentsOutputSchema,
      async execute() {
        try {
          const docs = await service.list();
          const structuredContent = listProjectDocumentsOutputSchema.parse({ documents: docs });

          const message =
            docs.length === 0
              ? "No documents found in Documents/."
              : `Found ${docs.length} document(s) in Documents/.`;

          return {
            structuredContent,
            content: [{ type: "text" as const, text: withData(message, structuredContent) }],
          };
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
      name: registerProjectDocumentToolMetadata.name,
      description: registerProjectDocumentToolMetadata.description,
      context: registerProjectDocumentToolMetadata.context,
      inputSchema: registerProjectDocumentInputSchema,
      outputSchema: registerProjectDocumentOutputSchema,
      async execute(args: unknown, context: { agentSlug: string }) {
        try {
          const parsed = registerProjectDocumentInputSchema.parse(args);
          const author = parsed.author ?? context.agentSlug;

          let created = false;
          let doc;

          try {
            doc = await service.create({
              path: parsed.path,
              title: parsed.title,
              description: parsed.description,
              author,
            });
            created = true;
          } catch (error) {
            if (error instanceof ConflictError) {
              doc = await service.updateMetadata({
                path: parsed.path,
                title: parsed.title,
                description: parsed.description,
                author,
              });
            } else {
              throw error;
            }
          }

          const structuredContent = registerProjectDocumentOutputSchema.parse({
            ...doc,
            created,
          });

          const message = created
            ? `Created document '${parsed.path}'.`
            : `Updated metadata for existing document '${parsed.path}'.`;

          return {
            structuredContent,
            content: [{ type: "text" as const, text: withData(message, structuredContent) }],
          };
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
