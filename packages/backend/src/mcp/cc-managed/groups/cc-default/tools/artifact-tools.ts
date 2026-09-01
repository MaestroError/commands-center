import { addArtifactInputSchema, artifactSchema } from "@cc/shared/schemas";
import { z } from "zod";

import type { AppDb } from "../../../../../db/client.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import { createArtifactService } from "../../../../../services/artifact-service.js";
import { createChatUploadService } from "../../../../../services/chat-upload-service.js";

type ArtifactToolOptions = {
  db: AppDb;
  config: RuntimeConfig;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export const addArtifactToolMetadata = {
  name: "add_artifact",
  description:
    "Register a result artifact produced during this conversation so the user can find it " +
    "later in the chat's Results section. Use this for any file, link, or document you " +
    'produce as an outcome. Set `type` to "document" for a markdown file in the Documents ' +
    'module (set `link` to the path relative to Documents/), "file" for any other workspace ' +
    'file (set `link` to the workspace-relative path), or "url" for an external link.',
  context: "chat",
} as const;

export const listUploadedFilesToolMetadata = {
  name: "list_uploaded_files",
  description:
    "List files uploaded by the operator in the calling specialist's current direct chat. " +
    "Returns validated metadata and absolute local paths readable with filesystem tools; " +
    "never returns file contents or uploads from tasks or older chats.",
  context: "chat",
} as const;

const listUploadedFilesInputSchema = z.object({}).strict();
const uploadedFileSchema = z
  .object({
    id: z.string().min(1),
    filename: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    storageKey: z.string().min(1),
    createdAt: z.string().datetime(),
    absolutePath: z.string().min(1),
  })
  .strict();
const listUploadedFilesOutputSchema = z.object({ files: z.array(uploadedFileSchema) }).strict();

export function createArtifactToolDefinitions(options: ArtifactToolOptions) {
  const artifactService = createArtifactService({ db: options.db, config: options.config });
  const chatUploadService = createChatUploadService({ config: options.config });

  return [
    {
      name: addArtifactToolMetadata.name,
      description: addArtifactToolMetadata.description,
      context: addArtifactToolMetadata.context,
      inputSchema: addArtifactInputSchema,
      outputSchema: artifactSchema,
      execute: async (args: unknown, context: { agentSlug: string }): Promise<ToolResult> => {
        try {
          const parsed = addArtifactInputSchema.parse(args);
          const { conversationId } = await resolveCurrentChatOwner(options.db, context.agentSlug);

          const artifact = await artifactService.create({
            conversationId,
            title: parsed.title,
            description: parsed.description,
            type: parsed.type,
            link: parsed.link,
          });

          const structuredContent = artifactSchema.parse(artifact);

          return {
            structuredContent,
            content: [
              {
                type: "text" as const,
                text: `Registered artifact '${parsed.title}'.\n\n${JSON.stringify(
                  structuredContent,
                  null,
                  2,
                )}`,
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to register artifact.";
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    },
    {
      name: listUploadedFilesToolMetadata.name,
      description: listUploadedFilesToolMetadata.description,
      context: listUploadedFilesToolMetadata.context,
      inputSchema: listUploadedFilesInputSchema,
      outputSchema: listUploadedFilesOutputSchema,
      execute: async (args: unknown, context: { agentSlug: string }): Promise<ToolResult> => {
        try {
          listUploadedFilesInputSchema.parse(args);
          const owner = await resolveCurrentChatOwner(options.db, context.agentSlug);
          const structuredContent = listUploadedFilesOutputSchema.parse({
            files: await chatUploadService.list(owner),
          });

          return {
            structuredContent,
            content: [
              {
                type: "text" as const,
                text:
                  structuredContent.files.length === 0
                    ? "No operator-uploaded files are stored for the current chat."
                    : JSON.stringify(structuredContent, null, 2),
              },
            ],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to list uploaded files.";
          return {
            isError: true,
            content: [{ type: "text" as const, text: message }],
          };
        }
      },
    },
  ];
}

// Resolve whichever direct chat is currently open for the calling specialist.
async function resolveCurrentChatOwner(
  db: AppDb,
  agentSlug: string,
): Promise<{ agentId: string; conversationId: string }> {
  const agent = await db.query.agents.findFirst({
    where: (table, operators) => operators.eq(table.slug, agentSlug),
    columns: { id: true },
  });

  if (!agent) {
    throw new Error(`Specialist '${agentSlug}' not found.`);
  }

  const conversation = await db.query.conversations.findFirst({
    where: (table, operators) =>
      operators.and(
        operators.eq(table.agent_id, agent.id),
        operators.eq(table.source, "chat"),
        operators.eq(table.is_current, true),
      ),
    columns: { id: true },
  });

  if (!conversation) {
    throw new Error(
      "No active chat conversation was found. This tool can only be used from within a direct chat.",
    );
  }

  return { agentId: agent.id, conversationId: conversation.id };
}
