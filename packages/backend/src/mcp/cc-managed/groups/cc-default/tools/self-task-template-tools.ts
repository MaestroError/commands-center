import { z } from "zod";

import {
  createTaskTemplateInputSchema,
  taskContextInputSchema,
  taskRunSchema,
  taskSchema,
  taskTemplateSchema,
  updateTaskTemplateInputSchema,
  type TaskTemplate,
} from "@cc/shared/schemas";

import type { AppDb } from "../../../../../db/client.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import type { TaskExecutionService } from "../../../../../services/task-execution-service.js";
import type { TaskService } from "../../../../../services/task-service.js";
import {
  withTaskBoardUrl,
  withTaskRunBoardUrl,
  withTaskTemplateBoardUrl,
} from "../../../task-board-urls.js";

type SelfTaskTemplateToolOptions = {
  db: AppDb;
  config: RuntimeConfig;
  taskService: TaskService;
  taskExecutionService: TaskExecutionService;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

// Input: all createTaskTemplateInputSchema fields except defaultAgentId, which is
// always resolved from the calling specialist. .strict() prevents passing defaultAgentId.
export const createSelfTaskTemplateInputSchema = createTaskTemplateInputSchema
  .omit({ defaultAgentId: true })
  .strict();

export const updateSelfTaskTemplateInputSchema = updateTaskTemplateInputSchema
  .omit({ defaultAgentId: true })
  .strict();

// Strict so unexpected fields (including any defaultAgentId/specialist id) surface
// as explicit validation errors rather than being silently ignored.
const templateIdInputSchema = z
  .object({
    templateId: z.string().trim().min(1),
  })
  .strict();

const runSelfTaskTemplateNowInputSchema = templateIdInputSchema
  .extend({
    // context lets the caller seed task-run context for this one-off run.
    context: taskContextInputSchema.optional(),
    // metadata is attached to the task run trigger for observability.
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const updateSelfTaskTemplateToolInputSchema = z
  .object({
    templateId: z.string().trim().min(1),
    input: updateSelfTaskTemplateInputSchema,
  })
  .strict();

const mcpTaskSchema = taskSchema.extend({
  url: z.string().url(),
});

const mcpTaskRunSchema = taskRunSchema.extend({
  taskUrl: z.string().url(),
});

const mcpTaskTemplateSchema = taskTemplateSchema.extend({
  url: z.string().url(),
});

const listSelfTaskTemplatesOutputSchema = z.object({
  templates: z.array(mcpTaskTemplateSchema),
});

export const listSelfTaskTemplatesToolMetadata = {
  name: "list_self_task_templates",
  description:
    "List CommandsCenter task templates whose default specialist is you. A task template defines a reusable task configuration — title, description, acceptance criteria, and optionally a recurrence schedule — that can be run on demand or triggered automatically on a cron-like schedule. Only returns templates assigned to you; templates assigned to other specialists are never visible.",
  context: "both",
} as const;

export const getSelfTaskTemplateToolMetadata = {
  name: "get_self_task_template",
  description:
    "Read one of your own CommandsCenter task templates by id. A task template is a saved task configuration that can be instantiated into a runnable task on demand or on a schedule. Will fail if the template is assigned to a different specialist.",
  context: "both",
} as const;

export const createSelfTaskTemplateToolMetadata = {
  name: "create_self_task_template",
  description:
    "Create a reusable CommandsCenter task template assigned to you as the default specialist. A template captures a task title, description, acceptance criteria, and optionally a recurrence schedule — making it suitable as a cron job for work that repeats on a fixed interval (daily, weekly, and so on). Use `todos` to propose acceptance criteria (the operator's definition of done): each is shown to the running agent as a criterion to satisfy, but only the operator can check them off during review. The template is always assigned to you; do not attempt to pass a defaultAgentId. Only available in task-run context.",
  context: "task_run",
} as const;

export const runSelfTaskTemplateNowToolMetadata = {
  name: "run_self_task_template_now",
  description:
    "Generate a task from one of your own CommandsCenter task templates and queue it for immediate execution. Use this for a one-off or out-of-schedule run of a template that belongs to you. Will fail if the template is assigned to a different specialist.",
  context: "both",
} as const;

export const updateSelfTaskTemplateToolMetadata = {
  name: "update_self_task_template",
  description:
    "Update one of your own CommandsCenter task templates without reassigning it to another specialist. Existing generated tasks keep their copied content. Only available in task-run context.",
  context: "task_run",
} as const;

export const createSelfTaskFromTemplateToolMetadata = {
  name: "create_self_task_from_template",
  description:
    "Generate a new task from one of your own CommandsCenter task templates without queuing it. The task is created in backlog status, ready for manual scheduling or a separate queue call. Use this when you want to instantiate your template but not run it immediately. Will fail if the template is assigned to a different specialist.",
  context: "both",
} as const;

export const enableSelfTaskTemplateToolMetadata = {
  name: "enable_self_task_template",
  description:
    "Enable (activate) one of your own CommandsCenter task templates. An active template resumes its recurring schedule and can be triggered by automation again. The recurrence schedule and all other settings are left unchanged. Will fail if the template is assigned to a different specialist.",
  context: "both",
} as const;

export const disableSelfTaskTemplateToolMetadata = {
  name: "disable_self_task_template",
  description:
    "Disable (deactivate) one of your own CommandsCenter task templates without changing its schedule or any other setting. A disabled template stops generating scheduled runs and cannot be triggered by automation or the API, but is kept for future reference and can be re-enabled later. Will fail if the template is assigned to a different specialist.",
  context: "both",
} as const;

// Phase 4: self task template tools (direct, non-interactive). draft_self_task_template
// lives in self-task-live-tools.ts with the other operator-blocking tools.
export function createSelfTaskTemplateToolDefinitions(options: SelfTaskTemplateToolOptions) {
  return [
    {
      name: listSelfTaskTemplatesToolMetadata.name,
      description: listSelfTaskTemplatesToolMetadata.description,
      context: listSelfTaskTemplatesToolMetadata.context,
      inputSchema: z.object({}).strict(),
      outputSchema: listSelfTaskTemplatesOutputSchema,
      execute: async (_args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const templates = await options.taskService.listTemplates({ defaultAgentId: agentId });

          return success(
            `Found ${String(templates.length)} template${templates.length === 1 ? "" : "s"}.`,
            {
              templates: z
                .array(mcpTaskTemplateSchema)
                .parse(
                  templates.map((template) => withTaskTemplateBoardUrl(options.config, template)),
                ),
            },
          );
        }, "Failed to list task templates."),
    },
    {
      name: getSelfTaskTemplateToolMetadata.name,
      description: getSelfTaskTemplateToolMetadata.description,
      context: getSelfTaskTemplateToolMetadata.context,
      inputSchema: templateIdInputSchema,
      outputSchema: mcpTaskTemplateSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = templateIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const template = await requireSelfTemplate(
            options.taskService,
            parsed.templateId,
            agentId,
          );

          return success(
            "Template loaded.",
            mcpTaskTemplateSchema.parse(withTaskTemplateBoardUrl(options.config, template)),
          );
        }, "Failed to get task template."),
    },
    {
      name: createSelfTaskTemplateToolMetadata.name,
      description: createSelfTaskTemplateToolMetadata.description,
      context: createSelfTaskTemplateToolMetadata.context,
      inputSchema: createSelfTaskTemplateInputSchema,
      outputSchema: mcpTaskTemplateSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = createSelfTaskTemplateInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const template = await options.taskService.createTemplate({
            ...parsed,
            defaultAgentId: agentId,
          });

          return success(
            "Task template created.",
            mcpTaskTemplateSchema.parse(withTaskTemplateBoardUrl(options.config, template)),
          );
        }, "Failed to create task template."),
    },
    {
      name: updateSelfTaskTemplateToolMetadata.name,
      description: updateSelfTaskTemplateToolMetadata.description,
      context: updateSelfTaskTemplateToolMetadata.context,
      inputSchema: updateSelfTaskTemplateToolInputSchema,
      outputSchema: mcpTaskTemplateSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = updateSelfTaskTemplateToolInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTemplate(options.taskService, parsed.templateId, agentId);

          const template = await options.taskService.updateTemplate(
            parsed.templateId,
            parsed.input,
          );

          if (!template) {
            throw new Error("Task template not found.");
          }

          return success(
            "Task template updated.",
            mcpTaskTemplateSchema.parse(withTaskTemplateBoardUrl(options.config, template)),
          );
        }, "Failed to update task template."),
    },
    {
      name: runSelfTaskTemplateNowToolMetadata.name,
      description: runSelfTaskTemplateNowToolMetadata.description,
      context: runSelfTaskTemplateNowToolMetadata.context,
      inputSchema: runSelfTaskTemplateNowInputSchema,
      outputSchema: mcpTaskRunSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = runSelfTaskTemplateNowInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTemplate(options.taskService, parsed.templateId, agentId);

          const task = await options.taskService.createTaskFromTemplate(parsed.templateId, {
            triggerSource: "agent",
            generatedByAgentId: agentId,
            context: parsed.context,
          });

          if (!task) {
            throw new Error("Task template not found.");
          }

          const run = await options.taskExecutionService.queue(task.id, {
            triggerSource: "agent",
            context: parsed.context,
            metadata: parsed.metadata,
          });

          return success(
            "Task template queued.",
            mcpTaskRunSchema.parse(withTaskRunBoardUrl(options.config, run)),
          );
        }, "Failed to run task template."),
    },
    {
      name: createSelfTaskFromTemplateToolMetadata.name,
      description: createSelfTaskFromTemplateToolMetadata.description,
      context: createSelfTaskFromTemplateToolMetadata.context,
      inputSchema: templateIdInputSchema,
      outputSchema: mcpTaskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = templateIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTemplate(options.taskService, parsed.templateId, agentId);

          const task = await options.taskService.createTaskFromTemplate(parsed.templateId, {
            triggerSource: "agent",
            generatedByAgentId: agentId,
          });

          if (!task) {
            throw new Error("Task template not found.");
          }

          return success(
            "Task created from template.",
            mcpTaskSchema.parse(withTaskBoardUrl(options.config, task)),
          );
        }, "Failed to create task from template."),
    },
    {
      name: enableSelfTaskTemplateToolMetadata.name,
      description: enableSelfTaskTemplateToolMetadata.description,
      context: enableSelfTaskTemplateToolMetadata.context,
      inputSchema: templateIdInputSchema,
      outputSchema: mcpTaskTemplateSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = templateIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTemplate(options.taskService, parsed.templateId, agentId);

          const template = await options.taskService.enableTemplate(parsed.templateId);

          if (!template) {
            throw new Error("Task template not found.");
          }

          return success(
            "Task template enabled.",
            mcpTaskTemplateSchema.parse(withTaskTemplateBoardUrl(options.config, template)),
          );
        }, "Failed to enable task template."),
    },
    {
      name: disableSelfTaskTemplateToolMetadata.name,
      description: disableSelfTaskTemplateToolMetadata.description,
      context: disableSelfTaskTemplateToolMetadata.context,
      inputSchema: templateIdInputSchema,
      outputSchema: mcpTaskTemplateSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = templateIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTemplate(options.taskService, parsed.templateId, agentId);

          const template = await options.taskService.disableTemplate(parsed.templateId);

          if (!template) {
            throw new Error("Task template not found.");
          }

          return success(
            "Task template disabled.",
            mcpTaskTemplateSchema.parse(withTaskTemplateBoardUrl(options.config, template)),
          );
        }, "Failed to disable task template."),
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

// Appends the full structured result to the tool's text output so the UI's
// tool-call log (and any consumer reading content[].text) shows the exact
// data the specialist received, not just a short confirmation string.
function success(message: string, structuredContent: Record<string, unknown>): ToolResult {
  return {
    structuredContent,
    content: [
      { type: "text", text: `${message}\n\n${JSON.stringify(structuredContent, null, 2)}` },
    ],
  };
}

async function requireCallingAgentId(db: AppDb, agentSlug: string): Promise<string> {
  const row = await db.query.agents.findFirst({
    where: (table, operators) => operators.eq(table.slug, agentSlug),
    columns: { id: true },
  });

  if (!row) {
    throw new Error(`Specialist '${agentSlug}' not found.`);
  }

  return row.id;
}

// Load a template and verify the calling specialist owns it. Returns the same
// "Task template not found." error for missing and cross-owned templates so
// the caller cannot probe for template ids it does not own.
async function requireSelfTemplate(
  taskService: TaskService,
  templateId: string,
  agentId: string,
): Promise<TaskTemplate> {
  const template = await taskService.getTemplate(templateId);

  if (!template || template.defaultAgentId !== agentId) {
    throw new Error("Task template not found.");
  }

  return template;
}

// Exported for reuse by the draft template live tool.
export { requireSelfTemplate };
