import { z } from "zod";

import type { CustomToolService } from "../../../../../services/custom-tool-service.js";

export const createCustomToolInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(""),
});

export const createCustomToolOutputSchema = z.object({
  toolName: z.string().min(1),
  toolSlug: z.string().min(1),
  directoryPath: z.string().min(1),
  entryPath: z.string().min(1),
});

export const createCustomToolMetadata = {
  name: "create_custom_tool",
  description:
    "Create a blank CommandsCenter custom tool and return the folder path the agent should edit.",
  context: "chat",
} as const;

export function createCreateCustomToolDefinition(options: {
  customToolService: CustomToolService;
}) {
  return {
    name: createCustomToolMetadata.name,
    description: createCustomToolMetadata.description,
    context: createCustomToolMetadata.context,
    inputSchema: createCustomToolInputSchema,
    outputSchema: createCustomToolOutputSchema,
    async execute(args: unknown) {
      try {
        const created = await options.customToolService.create(
          createCustomToolInputSchema.parse(args),
        );
        const structuredContent = createCustomToolOutputSchema.parse({
          toolName: created.tool.name,
          toolSlug: created.tool.slug,
          directoryPath: created.tool.directoryPath,
          entryPath: created.tool.entryPath,
        });

        return {
          structuredContent,
          content: [
            {
              type: "text" as const,
              text: `Created custom tool '${structuredContent.toolSlug}' at ${structuredContent.directoryPath}. Edit ${structuredContent.entryPath} to implement it.`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create custom tool.";

        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  };
}

export type CreateCustomToolDefinition = ReturnType<typeof createCreateCustomToolDefinition>;
