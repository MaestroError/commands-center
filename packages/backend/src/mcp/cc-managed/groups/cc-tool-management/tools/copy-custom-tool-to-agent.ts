import { z } from "zod";

import { ConflictError, NotFoundError } from "../../../../../lib/api-error.js";
import type { AgentService } from "../../../../../services/agent-service.js";
import type { ConversationService } from "../../../../../services/conversation-service.js";
import type { CustomToolService } from "../../../../../services/custom-tool-service.js";
import type { LiveRequestService } from "../../../../../services/live-request-service.js";

const copyCustomToolToAgentInputSchema = z.object({
  toolSlug: z.string().trim().min(1),
  agentSlug: z.string().trim().min(1).optional(),
});

const copyCustomToolToAgentOutputSchema = z.object({
  toolSlug: z.string().min(1),
  destinationSlug: z.string().min(1),
  agentSlug: z.string().min(1),
  overwritten: z.boolean(),
});

const copyDecisionSchema = z.object({
  action: z.enum(["rewrite", "rename"]),
  destinationName: z.string().trim().min(1).optional(),
});

export function createCopyCustomToolToAgentDefinition(options: {
  customToolService: CustomToolService;
  agentService: AgentService;
  conversationService?: ConversationService;
  liveRequestService?: LiveRequestService;
}) {
  return {
    name: "copy_custom_tool_to_agent",
    description:
      "Copy a global CommandsCenter custom tool into an agent workspace, asking the operator when overwrite or rename is needed.",
    inputSchema: copyCustomToolToAgentInputSchema,
    outputSchema: copyCustomToolToAgentOutputSchema,
    async execute(args: unknown, context: { agentSlug: string }) {
      try {
        const parsed = copyCustomToolToAgentInputSchema.parse(args);
        const targetAgentSlug = parsed.agentSlug ?? context.agentSlug;
        const tool = await options.customToolService.getGlobal(parsed.toolSlug);
        const agent = await findAgentBySlug(options.agentService, targetAgentSlug);

        try {
          const result = await options.customToolService.copyGlobalToAgents({
            slug: tool.slug,
            agentIds: [agent.id],
            overwrite: false,
          });

          return successResult({
            toolSlug: tool.slug,
            destinationSlug: tool.slug,
            agentSlug: targetAgentSlug,
            overwritten: result.copied[0]?.overwritten ?? false,
          });
        } catch (error) {
          if (
            !(error instanceof ConflictError) ||
            !options.liveRequestService ||
            !options.conversationService
          ) {
            throw error;
          }

          const response = await options.liveRequestService.create({
            conversationId: await resolveConversationId(options.conversationService, agent.id),
            kind: "custom_tool_copy_conflict",
            closable: false,
            presentation: {
              title: "Tool name conflict",
              description:
                "A tool with this name already exists in the selected agent workspace. Rewrite it or copy a renamed variant.",
              submitLabel: "Continue",
              cancelLabel: "Cancel",
            },
            fields: [
              {
                type: "text" as const,
                name: "destinationName",
                label: "Name",
                required: true,
                defaultValue: tool.name,
              },
            ],
            metadata: {
              toolName: tool.name,
              toolSlug: tool.slug,
              agentSlug: targetAgentSlug,
              conflictMessage: error.message,
              actions: [
                { id: "rewrite", label: "Rewrite" },
                { id: "rename", label: "Copy with new name" },
              ],
              currentName: tool.name,
            },
          });
          const decision = copyDecisionSchema.parse(response.values);
          const destinationName = decision.destinationName?.trim() || tool.name;
          const overwrite = decision.action === "rewrite";
          const result = await options.customToolService.copyGlobalToAgents({
            slug: tool.slug,
            agentIds: [agent.id],
            destinationName: overwrite ? undefined : destinationName,
            overwrite,
          });

          return successResult({
            toolSlug: tool.slug,
            destinationSlug: slugify(overwrite ? tool.name : destinationName),
            agentSlug: targetAgentSlug,
            overwritten: result.copied[0]?.overwritten ?? overwrite,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to copy custom tool.";

        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  };
}

async function findAgentBySlug(agentService: AgentService, slug: string) {
  const agent = await agentService.getBySlug(slug);

  if (!agent) {
    throw new NotFoundError("Agent not found.");
  }

  return agent;
}

async function resolveConversationId(
  conversationService: ConversationService,
  agentId: string,
): Promise<string> {
  const snapshot = await conversationService.resolveCurrent(agentId);
  return snapshot.current.id;
}

function successResult(input: {
  toolSlug: string;
  destinationSlug: string;
  agentSlug: string;
  overwritten: boolean;
}) {
  const structuredContent = copyCustomToolToAgentOutputSchema.parse(input);

  return {
    structuredContent,
    content: [
      {
        type: "text" as const,
        text: `Copied '${input.toolSlug}' to agent '${input.agentSlug}' as '${input.destinationSlug}'.`,
      },
    ],
  };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "tool";
}
