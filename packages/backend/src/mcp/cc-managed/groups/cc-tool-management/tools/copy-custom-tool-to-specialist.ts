import { z } from "zod";

import type { ConversationService } from "../../../../../services/conversation-service.js";
import type {
  CustomToolActionService,
  CustomToolCopyConflict,
} from "../../../../../services/custom-tool-action-service.js";
import type { LiveRequestService } from "../../../../../services/live-request-service.js";

const copyCustomToolToSpecialistInputSchema = z.object({
  toolSlug: z.string().trim().min(1),
  specialistSlug: z.string().trim().min(1).optional(),
});

const copyCustomToolToSpecialistOutputSchema = z.object({
  toolSlug: z.string().min(1),
  destinationSlug: z.string().min(1),
  specialistSlug: z.string().min(1),
  overwritten: z.boolean(),
});

export const copyCustomToolToSpecialistMetadata = {
  name: "copy_custom_tool_to_specialist",
  description:
    "Copy a global CommandsCenter custom tool into a specialist workspace, asking the operator when overwrite or rename is needed.",
  context: "chat",
} as const;

const copyDecisionSchema = z.object({
  action: z.enum(["rewrite", "rename"]),
  values: z.object({
    destinationName: z.string().trim().min(1),
  }),
});

export function createCopyCustomToolToSpecialistDefinition(options: {
  customToolActionService: CustomToolActionService;
  conversationService?: ConversationService;
  liveRequestService?: LiveRequestService;
}) {
  return {
    name: copyCustomToolToSpecialistMetadata.name,
    description: copyCustomToolToSpecialistMetadata.description,
    context: copyCustomToolToSpecialistMetadata.context,
    inputSchema: copyCustomToolToSpecialistInputSchema,
    outputSchema: copyCustomToolToSpecialistOutputSchema,
    async execute(args: unknown, context: { agentSlug: string }) {
      try {
        const parsed = copyCustomToolToSpecialistInputSchema.parse(args);
        const targetSpecialistSlug = parsed.specialistSlug ?? context.agentSlug;
        const firstAttempt = await options.customToolActionService.copyGlobalToolToAgent({
          slug: parsed.toolSlug,
          agentSlug: targetSpecialistSlug,
          overwrite: false,
        });

        if (firstAttempt.status === "copied") {
          return successResult({
            toolSlug: parsed.toolSlug,
            destinationSlug: firstAttempt.destinationSlug,
            specialistSlug: targetSpecialistSlug,
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
        const destinationName = decision.values.destinationName;
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
          specialistSlug: firstAttempt.conflict.agentSlug,
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
        "A tool with this name already exists in the selected specialist workspace. Rewrite it or copy a renamed variant.",
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
      specialistSlug: options.conflict.agentSlug,
      conflictMessage: options.conflict.message,
      currentName: options.conflict.currentName,
    },
    actions: [
      {
        id: "cancel",
        label: "Cancel",
        variant: "secondary" as const,
        kind: "cancel" as const,
        disabledWhen: [],
      },
      {
        id: "rewrite",
        label: "Rewrite",
        variant: "secondary" as const,
        kind: "submit" as const,
        disabledWhen: [
          {
            rule: "field_slug_differs" as const,
            field: "destinationName",
            value: options.conflict.currentName,
          },
        ],
      },
      {
        id: "rename",
        label: "Copy with new name",
        variant: "primary" as const,
        kind: "submit" as const,
        disabledWhen: [
          { rule: "field_empty" as const, field: "destinationName" },
          {
            rule: "field_slug_equals" as const,
            field: "destinationName",
            value: options.conflict.currentName,
          },
        ],
      },
    ],
  });

  return copyDecisionSchema.parse(response);
}

function successResult(input: {
  toolSlug: string;
  destinationSlug: string;
  specialistSlug: string;
  overwritten: boolean;
}) {
  const structuredContent = copyCustomToolToSpecialistOutputSchema.parse(input);

  return {
    structuredContent,
    content: [
      {
        type: "text" as const,
        text: `Copied '${input.toolSlug}' to specialist '${input.specialistSlug}' as '${input.destinationSlug}'.`,
      },
    ],
  };
}
