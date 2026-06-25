import { z } from "zod";

import {
  appendTaskContextInputSchema,
  createTaskInputSchema,
  createTaskTemplateInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  taskContextSchema,
  taskListSchema,
  taskRunListSchema,
  taskRunSchema,
  taskSchema,
  taskTemplateRunNowInputSchema,
  taskTemplateSchema,
  updateTaskInputSchema,
} from "@cc/shared/schemas";

import type { AppDb } from "../../../../../db/client.js";
import type { ConversationService } from "../../../../../services/conversation-service.js";
import type { LiveRequestService } from "../../../../../services/live-request-service.js";
import type { TaskExecutionService } from "../../../../../services/task-execution-service.js";
import type { TaskService } from "../../../../../services/task-service.js";

type TaskManagementToolOptions = {
  db: AppDb;
  taskService: TaskService;
  taskExecutionService: TaskExecutionService;
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

const taskIdInputSchema = z.object({
  taskId: z.string().trim().min(1),
});

const queueTaskToolInputSchema = taskIdInputSchema.extend({
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const runTaskTemplateNowToolInputSchema = taskIdInputSchema.merge(taskTemplateRunNowInputSchema);

// Accepts `templateId` (preferred) or `taskId` as an alias, so callers that
// reuse the `run_task_template_now` shape (which keys the template id as
// `taskId`) still work. Resolve with resolveTemplateId().
const templateIdInputSchema = z.object({
  templateId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
});

function resolveTemplateId(input: z.infer<typeof templateIdInputSchema>): string {
  const templateId = input.templateId ?? input.taskId;

  if (!templateId) {
    throw new Error("templateId is required.");
  }

  return templateId;
}

const appendTaskContextToolInputSchema = taskIdInputSchema.merge(appendTaskContextInputSchema);

const scheduleTaskToolInputSchema = taskIdInputSchema.extend({
  scheduledAt: z.string().datetime(),
  dueAt: z.string().datetime().optional(),
});

const getTaskRunInputSchema = taskIdInputSchema.extend({
  runId: z.string().trim().min(1),
});

const createManagedTaskInputSchema = createTaskInputSchema.omit({ agentId: true }).extend({
  agentId: z.string().trim().min(1).optional(),
});

const updateTaskToolInputSchema = taskIdInputSchema.extend({
  input: updateTaskInputSchema,
});

const createManagedTaskTemplateInputSchema = createTaskTemplateInputSchema.extend({
  defaultAgentId: z.string().trim().min(1).optional(),
});

// Draft tools accept partial input so the specialist can pre-fill what it knows and let
// the operator complete the rest in the form.
const draftTaskInputSchema = createManagedTaskInputSchema.partial();

const draftTaskUpdateInputSchema = taskIdInputSchema.extend({
  input: updateTaskInputSchema.optional(),
});

const listTasksOutputSchema = z.object({
  tasks: taskListSchema,
});

const listTaskRunsOutputSchema = z.object({
  runs: taskRunListSchema,
});

const reviewDecisionSchema = z.object({
  action: z.literal("submit"),
  values: z.record(z.string(), z.string()),
});

export const createTaskToolMetadata = {
  name: "create_task",
  description:
    "Create a CommandsCenter task directly, without an operator review form. In chat, prefer draft_task so the operator can review and edit first.",
  context: "both",
} as const;

export const updateTaskToolMetadata = {
  name: "update_task",
  description:
    "Update an existing CommandsCenter task by id directly, without an operator review form. In chat, prefer draft_task_update.",
  context: "both",
} as const;

export const listTasksToolMetadata = {
  name: "list_tasks",
  description: "List CommandsCenter tasks visible in this workspace.",
  context: "both",
} as const;

export const getTaskToolMetadata = {
  name: "get_task",
  description: "Read a CommandsCenter task by id.",
  context: "both",
} as const;

export const queueTaskToolMetadata = {
  name: "queue_task",
  description: "Queue an existing CommandsCenter task.",
  context: "both",
} as const;

export const scheduleTaskToolMetadata = {
  name: "schedule_task",
  description: "Schedule an existing CommandsCenter task for later execution.",
  context: "both",
} as const;

export const listTaskRunsToolMetadata = {
  name: "list_task_runs",
  description: "List recent runs for a CommandsCenter task.",
  context: "both",
} as const;

export const getTaskRunToolMetadata = {
  name: "get_task_run",
  description: "Read a CommandsCenter task run by task id and run id.",
  context: "both",
} as const;

export const createTaskTemplateToolMetadata = {
  name: "create_task_template",
  description: "Create a recurring CommandsCenter task template.",
  context: "both",
} as const;

export const getTaskTemplateToolMetadata = {
  name: "get_task_template",
  description: "Read a CommandsCenter task template by id.",
  context: "both",
} as const;

export const runTaskTemplateNowToolMetadata = {
  name: "run_task_template_now",
  description: "Generate and queue a run from a recurring CommandsCenter task template.",
  context: "both",
} as const;

export const enableTaskTemplateToolMetadata = {
  name: "enable_task_template",
  description:
    "Enable (activate) a CommandsCenter task template. An active template resumes its recurring schedule and can be triggered by automation again. The schedule and all other settings are left unchanged.",
  context: "both",
} as const;

export const disableTaskTemplateToolMetadata = {
  name: "disable_task_template",
  description:
    "Disable (deactivate) a CommandsCenter task template without changing its schedule or any other setting. A disabled template stops generating scheduled runs and cannot be triggered by automation or the API, but is kept for future reference and can be re-enabled later.",
  context: "both",
} as const;

export const draftTaskToolMetadata = {
  name: "draft_task",
  description:
    "Open a prefilled task form in chat for the operator to review, edit, and confirm before the task is created. Pass whatever details you know (all optional) to pre-fill the form. Chat only.",
  context: "chat",
} as const;

export const draftTaskUpdateToolMetadata = {
  name: "draft_task_update",
  description:
    "Open a prefilled form in chat with an existing task's current details for the operator to review, edit, and confirm before the update is saved. Provide the task id and optionally any suggested changes to pre-fill. Chat only.",
  context: "chat",
} as const;

export const readTaskContextToolMetadata = {
  name: "read_task_context",
  description: "Read persistent context for the current CommandsCenter task.",
  context: "task_run",
} as const;

export const appendTaskContextToolMetadata = {
  name: "append_task_context",
  description: "Append text to persistent context for the current CommandsCenter task.",
  context: "task_run",
} as const;

export function createTasksManagementToolDefinitions(options: TaskManagementToolOptions) {
  return [
    {
      name: createTaskToolMetadata.name,
      description: createTaskToolMetadata.description,
      context: createTaskToolMetadata.context,
      inputSchema: createManagedTaskInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = createManagedTaskInputSchema.parse(args);
          const agentId =
            parsed.agentId ?? (await requireCallingAgentId(options.db, context.agentSlug));
          const task = await options.taskService.create(
            createTaskInputSchema.parse({ ...parsed, agentId }),
          );

          return success("Task created.", taskSchema.parse(task));
        }, "Failed to create task."),
    },
    {
      name: updateTaskToolMetadata.name,
      description: updateTaskToolMetadata.description,
      context: updateTaskToolMetadata.context,
      inputSchema: updateTaskToolInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = updateTaskToolInputSchema.parse(args);
          const task = await options.taskService.update(parsed.taskId, parsed.input);

          if (!task) {
            throw new Error("Task not found.");
          }

          return success("Task updated.", taskSchema.parse(task));
        }, "Failed to update task."),
    },
    {
      name: listTasksToolMetadata.name,
      description: listTasksToolMetadata.description,
      context: listTasksToolMetadata.context,
      inputSchema: listTasksQuerySchema.partial(),
      outputSchema: listTasksOutputSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const tasks = await options.taskService.list(listTasksQuerySchema.partial().parse(args));
          return success(`Found ${String(tasks.length)} task${tasks.length === 1 ? "" : "s"}.`, {
            tasks: taskListSchema.parse(tasks),
          });
        }, "Failed to list tasks."),
    },
    {
      name: getTaskToolMetadata.name,
      description: getTaskToolMetadata.description,
      context: getTaskToolMetadata.context,
      inputSchema: taskIdInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = taskIdInputSchema.parse(args);
          const task = await options.taskService.get(parsed.taskId);

          if (!task) {
            throw new Error("Task not found.");
          }

          return success("Task loaded.", taskSchema.parse(task));
        }, "Failed to get task."),
    },
    {
      name: queueTaskToolMetadata.name,
      description: queueTaskToolMetadata.description,
      context: queueTaskToolMetadata.context,
      inputSchema: queueTaskToolInputSchema,
      outputSchema: taskRunSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = queueTaskToolInputSchema.parse(args);
          const run = await options.taskExecutionService.queue(parsed.taskId, {
            triggerSource: "manual",
            metadata: parsed.metadata,
          });

          return success("Task queued.", taskRunSchema.parse(run));
        }, "Failed to queue task."),
    },
    {
      name: scheduleTaskToolMetadata.name,
      description: scheduleTaskToolMetadata.description,
      context: scheduleTaskToolMetadata.context,
      inputSchema: scheduleTaskToolInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = scheduleTaskToolInputSchema.parse(args);
          const task = await options.taskService.update(parsed.taskId, {
            status: "scheduled",
            scheduledAt: parsed.scheduledAt,
            dueAt: parsed.dueAt,
          });

          if (!task) {
            throw new Error("Task not found.");
          }

          return success("Task scheduled.", taskSchema.parse(task));
        }, "Failed to schedule task."),
    },
    {
      name: listTaskRunsToolMetadata.name,
      description: listTaskRunsToolMetadata.description,
      context: listTaskRunsToolMetadata.context,
      inputSchema: taskIdInputSchema.extend({
        query: listTaskRunsQuerySchema.partial().optional(),
      }),
      outputSchema: listTaskRunsOutputSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = taskIdInputSchema
            .extend({ query: listTaskRunsQuerySchema.partial().optional() })
            .parse(args);
          const runs = await options.taskService.listRuns(parsed.taskId, parsed.query ?? {});
          return success(`Found ${String(runs.length)} task run${runs.length === 1 ? "" : "s"}.`, {
            runs: taskRunListSchema.parse(runs),
          });
        }, "Failed to list task runs."),
    },
    {
      name: getTaskRunToolMetadata.name,
      description: getTaskRunToolMetadata.description,
      context: getTaskRunToolMetadata.context,
      inputSchema: getTaskRunInputSchema,
      outputSchema: taskRunSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = getTaskRunInputSchema.parse(args);
          const run = await options.taskService.getRun(parsed.taskId, parsed.runId);

          if (!run) {
            throw new Error("Task run not found.");
          }

          return success("Task run loaded.", taskRunSchema.parse(run));
        }, "Failed to get task run."),
    },
    {
      name: createTaskTemplateToolMetadata.name,
      description: createTaskTemplateToolMetadata.description,
      context: createTaskTemplateToolMetadata.context,
      inputSchema: createManagedTaskTemplateInputSchema,
      outputSchema: taskTemplateSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = createManagedTaskTemplateInputSchema.parse(args);
          const defaultAgentId =
            parsed.defaultAgentId ?? (await requireCallingAgentId(options.db, context.agentSlug));
          const template = await options.taskService.createTemplate({
            ...parsed,
            defaultAgentId,
          });

          return success("Task template created.", taskTemplateSchema.parse(template));
        }, "Failed to create task template."),
    },
    {
      name: getTaskTemplateToolMetadata.name,
      description: getTaskTemplateToolMetadata.description,
      context: getTaskTemplateToolMetadata.context,
      inputSchema: templateIdInputSchema,
      outputSchema: taskTemplateSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const templateId = resolveTemplateId(templateIdInputSchema.parse(args));
          const template = await options.taskService.getTemplate(templateId);

          if (!template) {
            throw new Error("Task template not found.");
          }

          return success("Task template loaded.", taskTemplateSchema.parse(template));
        }, "Failed to get task template."),
    },
    {
      name: runTaskTemplateNowToolMetadata.name,
      description: runTaskTemplateNowToolMetadata.description,
      context: runTaskTemplateNowToolMetadata.context,
      inputSchema: runTaskTemplateNowToolInputSchema,
      outputSchema: taskRunSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = runTaskTemplateNowToolInputSchema.parse(args);
          const callingAgentId = await requireCallingAgentId(options.db, context.agentSlug);
          const task = await options.taskService.createTaskFromTemplate(parsed.taskId, {
            triggerSource: "agent",
            generatedByAgentId: callingAgentId,
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

          return success("Task template queued.", taskRunSchema.parse(run));
        }, "Failed to run task template."),
    },
    {
      name: enableTaskTemplateToolMetadata.name,
      description: enableTaskTemplateToolMetadata.description,
      context: enableTaskTemplateToolMetadata.context,
      inputSchema: templateIdInputSchema,
      outputSchema: taskTemplateSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const templateId = resolveTemplateId(templateIdInputSchema.parse(args));
          const template = await options.taskService.enableTemplate(templateId);

          if (!template) {
            throw new Error("Task template not found.");
          }

          return success("Task template enabled.", taskTemplateSchema.parse(template));
        }, "Failed to enable task template."),
    },
    {
      name: disableTaskTemplateToolMetadata.name,
      description: disableTaskTemplateToolMetadata.description,
      context: disableTaskTemplateToolMetadata.context,
      inputSchema: templateIdInputSchema,
      outputSchema: taskTemplateSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const templateId = resolveTemplateId(templateIdInputSchema.parse(args));
          const template = await options.taskService.disableTemplate(templateId);

          if (!template) {
            throw new Error("Task template not found.");
          }

          return success("Task template disabled.", taskTemplateSchema.parse(template));
        }, "Failed to disable task template."),
    },
  ] as const;
}

// Persistent task-context tools for the current task run. These live in the cc_default
// group so every task-run specialist gets them by default.
export function createTaskContextToolDefinitions(options: { taskService: TaskService }) {
  return [
    {
      name: readTaskContextToolMetadata.name,
      description: readTaskContextToolMetadata.description,
      context: readTaskContextToolMetadata.context,
      inputSchema: taskIdInputSchema,
      outputSchema: taskContextSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = taskIdInputSchema.parse(args);
          const task = await options.taskService.get(parsed.taskId);

          if (!task) {
            throw new Error("Task not found.");
          }

          return success("Task context loaded.", taskContextSchema.parse(task.context));
        }, "Failed to read task context."),
    },
    {
      name: appendTaskContextToolMetadata.name,
      description: appendTaskContextToolMetadata.description,
      context: appendTaskContextToolMetadata.context,
      inputSchema: appendTaskContextToolInputSchema,
      outputSchema: taskContextSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = appendTaskContextToolInputSchema.parse(args);
          const task = await options.taskService.appendContext(parsed.taskId, {
            text: parsed.text,
          });

          if (!task) {
            throw new Error("Task not found.");
          }

          return success("Task context appended.", taskContextSchema.parse(task.context));
        }, "Failed to append task context."),
    },
  ] as const;
}

// Operator-blocking tools (open a live request and wait). These live in the cc_app
// group so only that MCP server needs the long client timeout.
export function createTaskLiveToolDefinitions(options: TaskManagementToolOptions) {
  return [
    {
      name: draftTaskToolMetadata.name,
      description: draftTaskToolMetadata.description,
      context: draftTaskToolMetadata.context,
      inputSchema: draftTaskInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const draft = draftTaskInputSchema.parse(args);
          const callingAgentId = await requireCallingAgentId(options.db, context.agentSlug);
          const reviewed = await reviewTaskMutation(options, {
            agentId: callingAgentId,
            kind: "task_create_review",
            title: "Review task",
            description: "Review and edit the task before CommandsCenter creates it.",
            fields: [
              textField("title", "Title", draft.title, true),
              textareaField("description", "Description", draft.description),
              textField("agentId", "Specialist ID", draft.agentId ?? callingAgentId, true),
              textField("defaultAgentId", "Default specialist ID", draft.defaultAgentId),
              textField("scheduledAt", "Scheduled at", draft.scheduledAt ?? undefined),
              textField("dueAt", "Due at", draft.dueAt ?? undefined),
              textareaField("contextText", "Context", draft.context?.text),
            ],
            metadata: { taskTitle: draft.title, operation: "create_task" },
          });

          const task = await options.taskService.create(
            createTaskInputSchema.parse({
              title: reviewed["title"],
              description: emptyToUndefined(reviewed["description"]),
              agentId: reviewed["agentId"],
              defaultAgentId: emptyToUndefined(reviewed["defaultAgentId"]),
              scheduledAt: emptyToUndefined(reviewed["scheduledAt"]),
              dueAt: emptyToUndefined(reviewed["dueAt"]),
              context:
                reviewed["contextText"] === undefined
                  ? undefined
                  : applyContextText(undefined, reviewed["contextText"]),
            }),
          );

          return success("Task created.", taskSchema.parse(task));
        }, "Failed to draft task."),
    },
    {
      name: draftTaskUpdateToolMetadata.name,
      description: draftTaskUpdateToolMetadata.description,
      context: draftTaskUpdateToolMetadata.context,
      inputSchema: draftTaskUpdateInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = draftTaskUpdateInputSchema.parse(args);
          const current = await options.taskService.get(parsed.taskId);

          if (!current) {
            throw new Error("Task not found.");
          }

          const callingAgentId = await requireCallingAgentId(options.db, context.agentSlug);
          // Only surface the fields the specialist proposed to change; fall back to the
          // full editable set when none were proposed.
          const suggested = parsed.input;
          const changed = suggested ? Object.keys(suggested) : [];
          const showAll = changed.length === 0;
          const includes = (key: string) => showAll || changed.includes(key);

          const fields: ReviewField[] = [];
          if (includes("title")) {
            fields.push(textField("title", "Title", suggested?.title ?? current.title, true));
          }
          if (includes("description")) {
            fields.push(
              textareaField(
                "description",
                "Description",
                suggested?.description ?? current.description,
              ),
            );
          }
          if (includes("agentId")) {
            fields.push(
              textField("agentId", "Specialist ID", suggested?.agentId ?? current.agentId, true),
            );
          }
          if (includes("scheduledAt")) {
            fields.push(
              textField(
                "scheduledAt",
                "Scheduled at",
                suggested?.scheduledAt ?? current.scheduledAt ?? undefined,
              ),
            );
          }
          if (includes("dueAt")) {
            fields.push(
              textField("dueAt", "Due at", suggested?.dueAt ?? current.dueAt ?? undefined),
            );
          }
          if (includes("context")) {
            fields.push(
              textareaField(
                "contextText",
                "Context",
                suggested?.context?.text ?? current.context?.text,
              ),
            );
          }

          const reviewed = await reviewTaskMutation(options, {
            agentId: callingAgentId,
            kind: "task_update_review",
            title: "Review task update",
            description: "Review and edit the task update before CommandsCenter saves it.",
            fields,
            metadata: { taskId: parsed.taskId, taskTitle: current.title, operation: "update_task" },
          });

          const update: Record<string, unknown> = {};
          if ("title" in reviewed) update["title"] = reviewed["title"];
          if ("description" in reviewed)
            update["description"] = emptyToUndefined(reviewed["description"]);
          if ("agentId" in reviewed) update["agentId"] = reviewed["agentId"];
          if ("scheduledAt" in reviewed)
            update["scheduledAt"] = emptyToUndefined(reviewed["scheduledAt"]);
          if ("dueAt" in reviewed) update["dueAt"] = emptyToUndefined(reviewed["dueAt"]);
          if ("contextText" in reviewed) {
            update["context"] = applyContextText(current.context, reviewed["contextText"]);
          }

          const task = await options.taskService.update(
            parsed.taskId,
            updateTaskInputSchema.parse(update),
          );

          if (!task) {
            throw new Error("Task not found.");
          }

          return success("Task updated.", taskSchema.parse(task));
        }, "Failed to draft task update."),
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

async function reviewTaskMutation(
  options: Pick<TaskManagementToolOptions, "conversationService" | "liveRequestService">,
  input: {
    agentId: string;
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
    throw new Error("Drafting a task requires chat live requests.");
  }

  const snapshot = await options.conversationService.resolveCurrent(input.agentId);
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

function applyContextText(
  context: { text?: string; attachments?: unknown[] } | undefined,
  text: string,
): z.infer<typeof taskContextSchema> {
  return taskContextSchema.parse({ ...context, text: emptyToUndefined(text) });
}
