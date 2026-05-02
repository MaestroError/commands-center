import { z } from "zod";

import type { ConversationService } from "../../../../../services/conversation-service.js";
import type {
  CustomToolActionService,
  CustomToolCopyConflict,
} from "../../../../../services/custom-tool-action-service.js";
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
  customToolActionService: CustomToolActionService;
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
        const firstAttempt = await options.customToolActionService.copyGlobalToolToAgent({
          slug: parsed.toolSlug,
          agentSlug: targetAgentSlug,
          overwrite: false,
        });

        if (firstAttempt.status === "copied") {
          return successResult({
            toolSlug: parsed.toolSlug,
            destinationSlug: firstAttempt.destinationSlug,
            agentSlug: targetAgentSlug,
            overwritten: firstAttempt.result.copied[0]?.overwritten ?? false,
          });
        }

        if (!options.liveRequestService || !options.conversationService) {
          throw new Error(firstAttempt.conflict.message);
        }

        const decision = await requestConflictDecision({
          conflict: firstAttempt.conflict,
          conversationService: options.conversationService,
          liveRequestService: options.liveRequestService,
        });
        const overwrite = decision.action === "rewrite";
        const destinationName = decision.destinationName?.trim() || firstAttempt.conflict.toolName;
        const finalAttempt = await options.customToolActionService.copyGlobalToolToAgent({
          slug: firstAttempt.conflict.toolSlug,
          agentSlug: firstAttempt.conflict.agentSlug,
          destinationName: overwrite ? undefined : destinationName,
          overwrite,
        });

        if (finalAttempt.status === "conflict") {
          throw new Error(finalAttempt.conflict.message);
        }

        return successResult({
          toolSlug: firstAttempt.conflict.toolSlug,
          destinationSlug: finalAttempt.destinationSlug,
          agentSlug: firstAttempt.conflict.agentSlug,
          overwritten: finalAttempt.result.copied[0]?.overwritten ?? overwrite,
        });
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

async function resolveConversationId(
  conversationService: ConversationService,
  agentId: string,
): Promise<string> {
  const snapshot = await conversationService.resolveCurrent(agentId);
  return snapshot.current.id;
}

async function requestConflictDecision(options: {
  conflict: CustomToolCopyConflict;
  conversationService: ConversationService;
  liveRequestService: LiveRequestService;
}) {
  const response = await options.liveRequestService.create({
    conversationId: await resolveConversationId(
      options.conversationService,
      options.conflict.agentId,
    ),
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
        defaultValue: options.conflict.toolName,
      },
    ],
    metadata: {
      toolName: options.conflict.toolName,
      toolSlug: options.conflict.toolSlug,
      agentSlug: options.conflict.agentSlug,
      conflictMessage: options.conflict.message,
      actions: [
        { id: "rewrite", label: "Rewrite" },
        { id: "rename", label: "Copy with new name" },
      ],
      currentName: options.conflict.currentName,
    },
  });

  return copyDecisionSchema.parse(response.values);
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
