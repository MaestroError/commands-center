import { z } from "zod";

import {
  specialistSchema,
  createSpecialistInputSchema,
  updateSpecialistInputSchema,
} from "../../../../../schemas/specialists.js";
import type { SpecialistService } from "../../../../../services/specialist-service.js";
import type { ConversationService } from "../../../../../services/conversation-service.js";
import type { LiveRequestService } from "../../../../../services/live-request-service.js";

type SpecialistManagementToolOptions = {
  agentService: SpecialistService;
  conversationService?: ConversationService;
  liveRequestService?: LiveRequestService;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type ReviewField = {
  type: "text" | "textarea";
  name: string;
  label: string;
  required: boolean;
  defaultValue?: string;
};

const listSpecialistsInputSchema = z.object({
  includeArchived: z.boolean().default(false),
});

const listSpecialistsOutputSchema = z.object({
  specialists: z.array(specialistSchema),
});

const listModelsInputSchema = z.object({
  search: z
    .string()
    .trim()
    .optional()
    .describe("Optional case-insensitive keyword to filter the returned model IDs."),
});

const listModelsOutputSchema = z.object({
  models: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })),
});

// `capabilities` (skills/custom tools/MCP selections) is intentionally omitted from the
// MCP tools: the specialist has no reliable way to discover valid slugs yet, so specialists are
// created with empty capabilities and configured later in the editor UI.
const createSpecialistToolInputSchema = createSpecialistInputSchema.omit({ capabilities: true });

const updateSpecialistToolInputSchema = z.object({
  id: z.string().trim().min(1),
  input: updateSpecialistInputSchema.omit({ capabilities: true }),
});

// Draft tools accept partial input so the specialist can pre-fill whatever it knows and
// let the operator complete the rest in the form.
const draftSpecialistToolInputSchema = createSpecialistToolInputSchema.partial();

const draftSpecialistUpdateToolInputSchema = z.object({
  id: z.string().trim().min(1),
  input: updateSpecialistToolInputSchema.shape.input.optional(),
});

const removeSpecialistInputSchema = z.object({
  id: z.string().trim().min(1),
});

const confirmationDecisionSchema = z.object({
  action: z.literal("confirm"),
  values: z.record(z.string(), z.unknown()).optional(),
});

const reviewDecisionSchema = z.object({
  action: z.literal("submit"),
  values: z.record(z.string(), z.string()),
});

export const listSpecialistsToolMetadata = {
  name: "list_specialists",
  description: "List CommandsCenter specialists available in this workspace.",
  context: "both",
} as const;

export const listModelsToolMetadata = {
  name: "list_models",
  description:
    "List the model IDs available from connected providers. Use one of these IDs as defaultModel when creating or updating a specialist.",
  context: "both",
} as const;

export const createSpecialistToolMetadata = {
  name: "create_specialist",
  description:
    "Create a CommandsCenter specialist directly, without an operator review form. In chat, prefer draft_specialist so the operator can review and edit first.",
  context: "both",
} as const;

export const updateSpecialistToolMetadata = {
  name: "update_specialist",
  description:
    "Update an existing CommandsCenter specialist by id directly, without an operator review form. In chat, prefer draft_specialist_update.",
  context: "both",
} as const;

export const draftSpecialistToolMetadata = {
  name: "draft_specialist",
  description:
    "Open a prefilled specialist form in chat for the operator to review, edit, and confirm before the specialist is created. Pass whatever details you know (all optional) to pre-fill the form. Chat only.",
  context: "chat",
} as const;

export const draftSpecialistUpdateToolMetadata = {
  name: "draft_specialist_update",
  description:
    "Open a prefilled form in chat with an existing specialist's current details for the operator to review, edit, and confirm before the update is saved. Provide the specialist id and optionally any suggested changes to pre-fill. Chat only.",
  context: "chat",
} as const;

export const removeSpecialistToolMetadata = {
  name: "remove_specialist",
  description:
    "Remove a specialist from active use after operator confirmation by archiving its portable workspace state.",
  context: "chat",
} as const;

export function createListSpecialistsToolDefinition(options: { agentService: SpecialistService }) {
  return {
    name: listSpecialistsToolMetadata.name,
    description: listSpecialistsToolMetadata.description,
    context: listSpecialistsToolMetadata.context,
    inputSchema: listSpecialistsInputSchema,
    outputSchema: listSpecialistsOutputSchema,
    execute: async (args: unknown) =>
      executeTool(async () => {
        const parsed = listSpecialistsInputSchema.parse(args);
        const specialists = await options.agentService.list(parsed.includeArchived);
        const header = `Found ${String(specialists.length)} specialist${specialists.length === 1 ? "" : "s"}.`;
        const lines = specialists.map(
          (specialist) =>
            `- ${specialist.name} (id: ${specialist.id}, slug: ${specialist.slug}) — ${specialist.role} [${specialist.status}, model: ${specialist.defaultModel}]`,
        );
        const text = lines.length > 0 ? `${header}\n${lines.join("\n")}` : header;

        return success(text, {
          specialists: z.array(specialistSchema).parse(specialists),
        });
      }, "Failed to list specialists."),
  };
}

export function createListModelsToolDefinition(options: { agentService: SpecialistService }) {
  return {
    name: listModelsToolMetadata.name,
    description: listModelsToolMetadata.description,
    context: listModelsToolMetadata.context,
    inputSchema: listModelsInputSchema,
    outputSchema: listModelsOutputSchema,
    execute: async (args: unknown) =>
      executeTool(async () => {
        const parsed = listModelsInputSchema.parse(args);
        const search = parsed.search?.toLowerCase();
        const catalog = await options.agentService.getCatalog();
        const models = search
          ? catalog.providerModels.filter((model) =>
              `${model.label} ${model.id}`.toLowerCase().includes(search),
            )
          : catalog.providerModels;
        const header = `Found ${String(models.length)} model${models.length === 1 ? "" : "s"} from connected providers.`;
        const lines = models.map((model) => `- ${model.id}`);
        const text = lines.length > 0 ? `${header}\n${lines.join("\n")}` : header;

        return success(text, {
          models: listModelsOutputSchema.shape.models.parse(models),
        });
      }, "Failed to list models."),
  };
}

export function createSpecialistManagementToolDefinitions(
  options: SpecialistManagementToolOptions,
) {
  return [
    createListSpecialistsToolDefinition({ agentService: options.agentService }),
    createListModelsToolDefinition({ agentService: options.agentService }),
    {
      name: createSpecialistToolMetadata.name,
      description: createSpecialistToolMetadata.description,
      context: createSpecialistToolMetadata.context,
      inputSchema: createSpecialistToolInputSchema,
      outputSchema: specialistSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const input = createSpecialistToolInputSchema.parse(args);
          const specialist = await options.agentService.create({ ...input, capabilities: {} });

          return success("Specialist created.", specialistSchema.parse(specialist));
        }, "Failed to create specialist."),
    },
    {
      name: updateSpecialistToolMetadata.name,
      description: updateSpecialistToolMetadata.description,
      context: updateSpecialistToolMetadata.context,
      inputSchema: updateSpecialistToolInputSchema,
      outputSchema: specialistSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = updateSpecialistToolInputSchema.parse(args);
          const specialist = await options.agentService.update(parsed.id, parsed.input);

          if (!specialist) {
            throw new Error("Specialist not found.");
          }

          return success("Specialist updated.", specialistSchema.parse(specialist));
        }, "Failed to update specialist."),
    },
  ] as const;
}

// Operator-blocking tools (open a live request and wait). These live in the cc_app
// group so only that MCP server needs the long client timeout.
export function createSpecialistLiveToolDefinitions(options: SpecialistManagementToolOptions) {
  return [
    {
      name: draftSpecialistToolMetadata.name,
      description: draftSpecialistToolMetadata.description,
      context: draftSpecialistToolMetadata.context,
      inputSchema: draftSpecialistToolInputSchema,
      outputSchema: specialistSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const draft = draftSpecialistToolInputSchema.parse(args);
          const reviewed = await reviewAgentMutation(options, {
            callingAgentSlug: context.agentSlug,
            kind: "agent_create_review",
            title: "Review specialist",
            description: "Review and edit the specialist before CommandsCenter creates it.",
            fields: [
              textField("name", "Name", draft.name, true),
              textField("role", "Role", draft.role, true),
              textareaField("instructions", "Instructions", draft.instructions, true),
              textField("defaultModel", "Default model", draft.defaultModel, true),
              textField("iconPath", "Icon path", draft.iconPath),
            ],
            metadata: { specialistName: draft.name, operation: "create_specialist" },
          });

          const specialist = await options.agentService.create(
            createSpecialistInputSchema.parse({
              name: reviewed["name"],
              role: reviewed["role"],
              instructions: reviewed["instructions"],
              defaultModel: reviewed["defaultModel"],
              iconPath: emptyToUndefined(reviewed["iconPath"]),
              capabilities: {},
            }),
          );

          return success("Specialist created.", specialistSchema.parse(specialist));
        }, "Failed to draft specialist."),
    },
    {
      name: draftSpecialistUpdateToolMetadata.name,
      description: draftSpecialistUpdateToolMetadata.description,
      context: draftSpecialistUpdateToolMetadata.context,
      inputSchema: draftSpecialistUpdateToolInputSchema,
      outputSchema: specialistSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = draftSpecialistUpdateToolInputSchema.parse(args);
          const current = await options.agentService.get(parsed.id);

          if (!current) {
            throw new Error("Specialist not found.");
          }

          // Only surface the fields the agent proposed to change so the operator
          // reviews a focused diff; fall back to the full editable set when none
          // were proposed.
          const suggested = parsed.input;
          const changed = suggested ? Object.keys(suggested) : [];
          const showAll = changed.length === 0;
          const includes = (key: string) => showAll || changed.includes(key);

          const fields: ReviewField[] = [];
          if (includes("name")) {
            fields.push(textField("name", "Name", suggested?.name ?? current.name, true));
          }
          if (includes("role")) {
            fields.push(textField("role", "Role", suggested?.role ?? current.role, true));
          }
          if (includes("instructions")) {
            fields.push(
              textareaField(
                "instructions",
                "Instructions",
                suggested?.instructions ?? current.instructions,
                true,
              ),
            );
          }
          if (includes("defaultModel")) {
            fields.push(
              textField(
                "defaultModel",
                "Default model",
                suggested?.defaultModel ?? current.defaultModel,
                true,
              ),
            );
          }
          if (includes("iconPath")) {
            fields.push(
              textField("iconPath", "Icon path", suggested?.iconPath ?? current.iconPath),
            );
          }

          const reviewed = await reviewAgentMutation(options, {
            callingAgentSlug: context.agentSlug,
            kind: "agent_update_review",
            title: "Review specialist update",
            description: "Review and edit the specialist update before CommandsCenter saves it.",
            fields,
            metadata: {
              agentId: parsed.id,
              specialistName: current.name,
              specialistIconPath: current.iconPath ?? "",
              operation: "update_specialist",
            },
          });

          const update: Record<string, unknown> = {};
          if ("name" in reviewed) update["name"] = reviewed["name"];
          if ("role" in reviewed) update["role"] = reviewed["role"];
          if ("instructions" in reviewed) update["instructions"] = reviewed["instructions"];
          if ("defaultModel" in reviewed) update["defaultModel"] = reviewed["defaultModel"];
          if ("iconPath" in reviewed) update["iconPath"] = emptyToUndefined(reviewed["iconPath"]);

          const specialist = await options.agentService.update(
            parsed.id,
            updateSpecialistInputSchema.parse(update),
          );

          if (!specialist) {
            throw new Error("Specialist not found.");
          }

          return success("Specialist updated.", specialistSchema.parse(specialist));
        }, "Failed to draft specialist update."),
    },
    {
      name: removeSpecialistToolMetadata.name,
      description: removeSpecialistToolMetadata.description,
      context: removeSpecialistToolMetadata.context,
      inputSchema: removeSpecialistInputSchema,
      outputSchema: specialistSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = removeSpecialistInputSchema.parse(args);
          const target = await options.agentService.get(parsed.id);

          if (!target) {
            throw new Error("Specialist not found.");
          }

          await confirmRemove(options, {
            callingAgentSlug: context.agentSlug,
            targetAgentId: target.id,
            targetAgentName: target.name,
            targetAgentSlug: target.slug,
          });

          const archived = await options.agentService.archive(parsed.id);

          if (!archived) {
            throw new Error("Specialist not found.");
          }

          return success("Specialist removed from active use.", specialistSchema.parse(archived));
        }, "Failed to remove specialist."),
    },
  ] as const;
}

async function executeTool(
  action: () => Promise<ToolResult>,
  fallbackMessage: string,
): Promise<ToolResult> {
  try {
    return await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : fallbackMessage;

    return {
      isError: true,
      structuredContent: { error: { message } },
      content: [{ type: "text", text: message }],
    };
  }
}

function success(message: string, structuredContent: Record<string, unknown>): ToolResult {
  return {
    structuredContent,
    content: [{ type: "text", text: message }],
  };
}

async function confirmRemove(
  options: Pick<
    SpecialistManagementToolOptions,
    "agentService" | "conversationService" | "liveRequestService"
  >,
  input: {
    callingAgentSlug: string;
    targetAgentId: string;
    targetAgentName: string;
    targetAgentSlug: string;
  },
): Promise<void> {
  if (!options.conversationService || !options.liveRequestService) {
    throw new Error("Specialist removal requires operator confirmation.");
  }

  const callingAgent = await options.agentService.getBySlug(input.callingAgentSlug);

  if (!callingAgent) {
    throw new Error(`Specialist '${input.callingAgentSlug}' not found.`);
  }

  const snapshot = await options.conversationService.resolveCurrent(callingAgent.id);
  const decision = await options.liveRequestService.create({
    conversationId: snapshot.current.id,
    kind: "agent_management_confirmation",
    closable: false,
    presentation: {
      title: "Remove specialist",
      description: `Archive specialist '${input.targetAgentName}' and remove it from active use.`,
      submitLabel: "Confirm",
      cancelLabel: "Cancel",
    },
    fields: [],
    metadata: {
      specialistId: input.targetAgentId,
      specialistName: input.targetAgentName,
      specialistSlug: input.targetAgentSlug,
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
        id: "confirm",
        label: "Confirm",
        variant: "primary" as const,
        kind: "submit" as const,
        disabledWhen: [],
      },
    ],
  });

  confirmationDecisionSchema.parse(decision);
}

async function reviewAgentMutation(
  options: Pick<
    SpecialistManagementToolOptions,
    "agentService" | "conversationService" | "liveRequestService"
  >,
  input: {
    callingAgentSlug: string;
    kind: string;
    title: string;
    description: string;
    fields: Array<{
      type: "text" | "textarea";
      name: string;
      label: string;
      required: boolean;
      defaultValue?: string;
    }>;
    metadata: Record<string, unknown>;
  },
): Promise<Record<string, string>> {
  if (!options.conversationService || !options.liveRequestService) {
    throw new Error("Drafting a specialist requires chat live requests.");
  }

  const callingAgent = await options.agentService.getBySlug(input.callingAgentSlug);

  if (!callingAgent) {
    throw new Error(`Specialist '${input.callingAgentSlug}' not found.`);
  }

  const snapshot = await options.conversationService.resolveCurrent(callingAgent.id);
  const decision = await options.liveRequestService.create({
    conversationId: snapshot.current.id,
    kind: input.kind,
    closable: false,
    presentation: {
      title: input.title,
      description: input.description,
      submitLabel: "Apply",
      cancelLabel: "Cancel",
    },
    fields: input.fields,
    metadata: input.metadata,
    actions: [
      {
        id: "cancel",
        label: "Cancel",
        variant: "secondary" as const,
        kind: "cancel" as const,
        disabledWhen: [],
      },
      {
        id: "submit",
        label: "Apply",
        variant: "primary" as const,
        kind: "submit" as const,
        disabledWhen: input.fields
          .filter((field) => field.required)
          .map((field) => ({ rule: "field_empty" as const, field: field.name })),
      },
    ],
  });

  return reviewDecisionSchema.parse(decision).values;
}

function textField(
  name: string,
  label: string,
  defaultValue: string | undefined,
  required = false,
): {
  type: "text";
  name: string;
  label: string;
  required: boolean;
  defaultValue?: string;
} {
  return { type: "text", name, label, required, defaultValue };
}

function textareaField(
  name: string,
  label: string,
  defaultValue: string | undefined,
  required = false,
): {
  type: "textarea";
  name: string;
  label: string;
  required: boolean;
  defaultValue?: string;
} {
  return { type: "textarea", name, label, required, defaultValue };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}
