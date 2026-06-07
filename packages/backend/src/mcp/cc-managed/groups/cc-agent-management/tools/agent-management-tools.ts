import { z } from "zod";

import {
  agentSchema,
  createAgentInputSchema,
  updateAgentInputSchema,
} from "../../../../../schemas/agents.js";
import type { AgentService } from "../../../../../services/agent-service.js";
import type { ConversationService } from "../../../../../services/conversation-service.js";
import type { LiveRequestService } from "../../../../../services/live-request-service.js";

type AgentManagementToolOptions = {
  agentService: AgentService;
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

const listAgentsInputSchema = z.object({
  includeArchived: z.boolean().default(false),
});

const listAgentsOutputSchema = z.object({
  agents: z.array(agentSchema),
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
// MCP tools: the agent has no reliable way to discover valid slugs yet, so agents are
// created with empty capabilities and configured later in the editor UI.
const createAgentToolInputSchema = createAgentInputSchema.omit({ capabilities: true });

const updateAgentToolInputSchema = z.object({
  id: z.string().trim().min(1),
  input: updateAgentInputSchema.omit({ capabilities: true }),
});

// Draft tools accept partial input so the agent can pre-fill whatever it knows and
// let the operator complete the rest in the form.
const draftAgentToolInputSchema = createAgentToolInputSchema.partial();

const draftAgentUpdateToolInputSchema = z.object({
  id: z.string().trim().min(1),
  input: updateAgentToolInputSchema.shape.input.optional(),
});

const removeAgentInputSchema = z.object({
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

export const listAgentsToolMetadata = {
  name: "list_agents",
  description: "List CommandsCenter agents available in this workspace.",
  context: "both",
} as const;

export const listModelsToolMetadata = {
  name: "list_models",
  description:
    "List the model IDs available from connected providers. Use one of these IDs as defaultModel when creating or updating an agent.",
  context: "both",
} as const;

export const createAgentToolMetadata = {
  name: "create_agent",
  description:
    "Create a CommandsCenter agent directly, without an operator review form. In chat, prefer draft_agent so the operator can review and edit first.",
  context: "both",
} as const;

export const updateAgentToolMetadata = {
  name: "update_agent",
  description:
    "Update an existing CommandsCenter agent by id directly, without an operator review form. In chat, prefer draft_agent_update.",
  context: "both",
} as const;

export const draftAgentToolMetadata = {
  name: "draft_agent",
  description:
    "Open a prefilled agent form in chat for the operator to review, edit, and confirm before the agent is created. Pass whatever details you know (all optional) to pre-fill the form. Chat only.",
  context: "chat",
} as const;

export const draftAgentUpdateToolMetadata = {
  name: "draft_agent_update",
  description:
    "Open a prefilled form in chat with an existing agent's current details for the operator to review, edit, and confirm before the update is saved. Provide the agent id and optionally any suggested changes to pre-fill. Chat only.",
  context: "chat",
} as const;

export const removeAgentToolMetadata = {
  name: "remove_agent",
  description:
    "Remove an agent from active use after operator confirmation by archiving its portable workspace state.",
  context: "chat",
} as const;

export function createListAgentsToolDefinition(options: { agentService: AgentService }) {
  return {
    name: listAgentsToolMetadata.name,
    description: listAgentsToolMetadata.description,
    context: listAgentsToolMetadata.context,
    inputSchema: listAgentsInputSchema,
    outputSchema: listAgentsOutputSchema,
    execute: async (args: unknown) =>
      executeTool(async () => {
        const parsed = listAgentsInputSchema.parse(args);
        const agents = await options.agentService.list(parsed.includeArchived);
        const header = `Found ${String(agents.length)} agent${agents.length === 1 ? "" : "s"}.`;
        const lines = agents.map(
          (agent) =>
            `- ${agent.name} (id: ${agent.id}, slug: ${agent.slug}) — ${agent.role} [${agent.status}, model: ${agent.defaultModel}]`,
        );
        const text = lines.length > 0 ? `${header}\n${lines.join("\n")}` : header;

        return success(text, {
          agents: z.array(agentSchema).parse(agents),
        });
      }, "Failed to list agents."),
  };
}

export function createListModelsToolDefinition(options: { agentService: AgentService }) {
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

export function createAgentManagementToolDefinitions(options: AgentManagementToolOptions) {
  return [
    createListAgentsToolDefinition({ agentService: options.agentService }),
    createListModelsToolDefinition({ agentService: options.agentService }),
    {
      name: createAgentToolMetadata.name,
      description: createAgentToolMetadata.description,
      context: createAgentToolMetadata.context,
      inputSchema: createAgentToolInputSchema,
      outputSchema: agentSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const input = createAgentToolInputSchema.parse(args);
          const agent = await options.agentService.create({ ...input, capabilities: {} });

          return success("Agent created.", agentSchema.parse(agent));
        }, "Failed to create agent."),
    },
    {
      name: updateAgentToolMetadata.name,
      description: updateAgentToolMetadata.description,
      context: updateAgentToolMetadata.context,
      inputSchema: updateAgentToolInputSchema,
      outputSchema: agentSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = updateAgentToolInputSchema.parse(args);
          const agent = await options.agentService.update(parsed.id, parsed.input);

          if (!agent) {
            throw new Error("Agent not found.");
          }

          return success("Agent updated.", agentSchema.parse(agent));
        }, "Failed to update agent."),
    },
  ] as const;
}

// Operator-blocking tools (open a live request and wait). These live in the cc_app
// group so only that MCP server needs the long client timeout.
export function createAgentLiveToolDefinitions(options: AgentManagementToolOptions) {
  return [
    {
      name: draftAgentToolMetadata.name,
      description: draftAgentToolMetadata.description,
      context: draftAgentToolMetadata.context,
      inputSchema: draftAgentToolInputSchema,
      outputSchema: agentSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const draft = draftAgentToolInputSchema.parse(args);
          const reviewed = await reviewAgentMutation(options, {
            callingAgentSlug: context.agentSlug,
            kind: "agent_create_review",
            title: "Review agent",
            description: "Review and edit the agent before CommandsCenter creates it.",
            fields: [
              textField("name", "Name", draft.name, true),
              textField("role", "Role", draft.role, true),
              textareaField("instructions", "Instructions", draft.instructions, true),
              textField("defaultModel", "Default model", draft.defaultModel, true),
              textField("iconPath", "Icon path", draft.iconPath),
            ],
            metadata: { agentName: draft.name, operation: "create_agent" },
          });

          const agent = await options.agentService.create(
            createAgentInputSchema.parse({
              name: reviewed["name"],
              role: reviewed["role"],
              instructions: reviewed["instructions"],
              defaultModel: reviewed["defaultModel"],
              iconPath: emptyToUndefined(reviewed["iconPath"]),
              capabilities: {},
            }),
          );

          return success("Agent created.", agentSchema.parse(agent));
        }, "Failed to draft agent."),
    },
    {
      name: draftAgentUpdateToolMetadata.name,
      description: draftAgentUpdateToolMetadata.description,
      context: draftAgentUpdateToolMetadata.context,
      inputSchema: draftAgentUpdateToolInputSchema,
      outputSchema: agentSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = draftAgentUpdateToolInputSchema.parse(args);
          const current = await options.agentService.get(parsed.id);

          if (!current) {
            throw new Error("Agent not found.");
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
            title: "Review agent update",
            description: "Review and edit the agent update before CommandsCenter saves it.",
            fields,
            metadata: {
              agentId: parsed.id,
              agentName: current.name,
              agentIconPath: current.iconPath ?? "",
              operation: "update_agent",
            },
          });

          const update: Record<string, unknown> = {};
          if ("name" in reviewed) update["name"] = reviewed["name"];
          if ("role" in reviewed) update["role"] = reviewed["role"];
          if ("instructions" in reviewed) update["instructions"] = reviewed["instructions"];
          if ("defaultModel" in reviewed) update["defaultModel"] = reviewed["defaultModel"];
          if ("iconPath" in reviewed) update["iconPath"] = emptyToUndefined(reviewed["iconPath"]);

          const agent = await options.agentService.update(
            parsed.id,
            updateAgentInputSchema.parse(update),
          );

          if (!agent) {
            throw new Error("Agent not found.");
          }

          return success("Agent updated.", agentSchema.parse(agent));
        }, "Failed to draft agent update."),
    },
    {
      name: removeAgentToolMetadata.name,
      description: removeAgentToolMetadata.description,
      context: removeAgentToolMetadata.context,
      inputSchema: removeAgentInputSchema,
      outputSchema: agentSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = removeAgentInputSchema.parse(args);
          const target = await options.agentService.get(parsed.id);

          if (!target) {
            throw new Error("Agent not found.");
          }

          await confirmRemove(options, {
            callingAgentSlug: context.agentSlug,
            targetAgentId: target.id,
            targetAgentName: target.name,
            targetAgentSlug: target.slug,
          });

          const archived = await options.agentService.archive(parsed.id);

          if (!archived) {
            throw new Error("Agent not found.");
          }

          return success("Agent removed from active use.", agentSchema.parse(archived));
        }, "Failed to remove agent."),
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
    AgentManagementToolOptions,
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
    throw new Error("Agent removal requires operator confirmation.");
  }

  const callingAgent = await options.agentService.getBySlug(input.callingAgentSlug);

  if (!callingAgent) {
    throw new Error(`Agent '${input.callingAgentSlug}' not found.`);
  }

  const snapshot = await options.conversationService.resolveCurrent(callingAgent.id);
  const decision = await options.liveRequestService.create({
    conversationId: snapshot.current.id,
    kind: "agent_management_confirmation",
    closable: false,
    presentation: {
      title: "Remove agent",
      description: `Archive agent '${input.targetAgentName}' and remove it from active use.`,
      submitLabel: "Confirm",
      cancelLabel: "Cancel",
    },
    fields: [],
    metadata: {
      agentId: input.targetAgentId,
      agentName: input.targetAgentName,
      agentSlug: input.targetAgentSlug,
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
    AgentManagementToolOptions,
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
    throw new Error("Drafting an agent requires chat live requests.");
  }

  const callingAgent = await options.agentService.getBySlug(input.callingAgentSlug);

  if (!callingAgent) {
    throw new Error(`Agent '${input.callingAgentSlug}' not found.`);
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
