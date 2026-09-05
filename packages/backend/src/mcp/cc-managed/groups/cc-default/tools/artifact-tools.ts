import { addArtifactInputSchema, artifactSchema } from "@cc/shared/schemas";

import type { AppDb } from "../../../../../db/client.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import { createArtifactService } from "../../../../../services/artifact-service.js";

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

export function createArtifactToolDefinitions(options: ArtifactToolOptions) {
  const artifactService = createArtifactService({ db: options.db, config: options.config });

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
          const conversationId = await resolveCurrentChatConversationId(
            options.db,
            context.agentSlug,
          );

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
  ];
}

// Resolve the agent's active chat conversation. Artifacts registered from a
// chat attach to whichever conversation is currently open for the specialist.
async function resolveCurrentChatConversationId(db: AppDb, agentSlug: string): Promise<string> {
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
        operators.eq(table.is_current, true),
        operators.eq(table.status, "active"),
        operators.or(operators.eq(table.source, "chat"), operators.isNotNull(table.converted_at)),
      ),
    columns: { id: true },
  });

  if (!conversation) {
    throw new Error(
      "No active chat conversation was found to attach the artifact to. Artifacts can only be registered from within a chat.",
    );
  }

  return conversation.id;
}
