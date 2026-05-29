import { z } from "zod";

import {
  createTaskTemplateInputSchema,
  createTaskInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  taskCommentSchema,
  appendTaskContextInputSchema,
  taskContextSchema,
  taskListSchema,
  taskRunListSchema,
  taskRunSchema,
  taskSchema,
  taskTemplateSchema,
  taskTemplateRunNowInputSchema,
  updateTaskContextInputSchema,
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

const taskIdInputSchema = z.object({
  taskId: z.string().trim().min(1),
});

const queueTaskToolInputSchema = taskIdInputSchema.extend({
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const runTaskTemplateNowToolInputSchema = taskIdInputSchema.merge(taskTemplateRunNowInputSchema);

const updateTaskContextToolInputSchema = taskIdInputSchema.extend({
  context: updateTaskContextInputSchema,
});

const appendTaskContextToolInputSchema = taskIdInputSchema.merge(appendTaskContextInputSchema);

const scheduleTaskToolInputSchema = taskIdInputSchema.extend({
  scheduledAt: z.string().datetime(),
  dueAt: z.string().datetime().optional(),
});

const addTaskCommentToolInputSchema = taskIdInputSchema.extend({
  body: z.string().trim().min(1),
});

const getTaskRunInputSchema = taskIdInputSchema.extend({
  runId: z.string().trim().min(1),
});

const createManagedTaskInputSchema = createTaskInputSchema
  .omit({ agentId: true, triggerMode: true, schedule: true })
  .extend({
    agentId: z.string().trim().min(1).optional(),
  });

const createManagedTaskTemplateInputSchema = createTaskTemplateInputSchema.extend({
  defaultAgentId: z.string().trim().min(1).optional(),
});

const listTasksOutputSchema = z.object({
  tasks: taskListSchema,
});

const listTaskRunsOutputSchema = z.object({
  runs: taskRunListSchema,
});

const confirmationDecisionSchema = z.object({
  action: z.literal("confirm"),
  values: z.record(z.string(), z.unknown()).optional(),
});

export const createTaskToolMetadata = {
  name: "create_task",
  description: "Create a CommandsCenter task for the calling agent after operator confirmation.",
  context: "chat",
} as const;

export const listTasksToolMetadata = {
  name: "list_tasks",
  description: "List CommandsCenter tasks visible in this workspace.",
  context: "chat",
} as const;

export const getTaskToolMetadata = {
  name: "get_task",
  description: "Read a CommandsCenter task by id.",
  context: "chat",
} as const;

export const queueTaskToolMetadata = {
  name: "queue_task",
  description: "Queue an existing CommandsCenter task after operator confirmation.",
  context: "chat",
} as const;

export const scheduleTaskToolMetadata = {
  name: "schedule_task",
  description: "Schedule an existing CommandsCenter task for later execution.",
  context: "chat",
} as const;

export const addTaskCommentToolMetadata = {
  name: "add_task_comment",
  description: "Add an operator-visible comment or follow-up note to a CommandsCenter task.",
  context: "chat",
} as const;

export const listTaskRunsToolMetadata = {
  name: "list_task_runs",
  description: "List recent runs for a CommandsCenter task.",
  context: "chat",
} as const;

export const getTaskRunToolMetadata = {
  name: "get_task_run",
  description: "Read a CommandsCenter task run by task id and run id.",
  context: "chat",
} as const;

export const createTaskTemplateToolMetadata = {
  name: "create_task_template",
  description: "Create a recurring CommandsCenter task template after operator confirmation.",
  context: "chat",
} as const;

export const runTaskTemplateNowToolMetadata = {
  name: "run_task_template_now",
  description: "Generate and queue a run from a recurring CommandsCenter task template.",
  context: "chat",
} as const;

export const updateTaskContextToolMetadata = {
  name: "update_task_context",
  description: "Update persistent context for the current CommandsCenter task.",
  context: "task_run",
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
          const input = createTaskInputSchema.parse({ ...parsed, agentId, triggerMode: "manual" });

          await confirmMutation(options, {
            agentId,
            title: "Create task",
            description: `Create task '${input.title}' for this workspace.`,
            metadata: { taskTitle: input.title, triggerMode: input.triggerMode },
          });

          const task = await options.taskService.create(input);
          return success("Task created.", taskSchema.parse(task));
        }, "Failed to create task."),
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
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = queueTaskToolInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);

          await confirmMutation(options, {
            agentId,
            title: "Queue task",
            description: `Queue task '${parsed.taskId}'.`,
            metadata: {
              taskId: parsed.taskId,
              triggerSource: "manual",
              runMetadata: parsed.metadata,
            },
          });

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
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = scheduleTaskToolInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);

          await confirmMutation(options, {
            agentId,
            title: "Schedule task",
            description: `Schedule task '${parsed.taskId}' for ${parsed.scheduledAt}.`,
            metadata: {
              taskId: parsed.taskId,
              scheduledAt: parsed.scheduledAt,
              dueAt: parsed.dueAt,
            },
          });

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
      name: addTaskCommentToolMetadata.name,
      description: addTaskCommentToolMetadata.description,
      context: addTaskCommentToolMetadata.context,
      inputSchema: addTaskCommentToolInputSchema,
      outputSchema: taskCommentSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = addTaskCommentToolInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);

          await confirmMutation(options, {
            agentId,
            title: "Add task comment",
            description: `Add a comment to task '${parsed.taskId}'.`,
            metadata: { taskId: parsed.taskId },
          });

          const comment = await options.taskService.createComment(parsed.taskId, {
            body: parsed.body,
          });
          return success("Task comment added.", comment);
        }, "Failed to add task comment."),
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

          await confirmMutation(options, {
            agentId: defaultAgentId,
            title: "Create task template",
            description: `Create recurring task template '${parsed.title}'.`,
            metadata: { taskTitle: parsed.title, recurrence: parsed.recurrence },
          });

          const template = await options.taskService.createTemplate({ ...parsed, defaultAgentId });
          return success("Task template created.", taskTemplateSchema.parse(template));
        }, "Failed to create task template."),
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
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);

          await confirmMutation(options, {
            agentId,
            title: "Run task template now",
            description: `Run template '${parsed.taskId}' now.`,
            metadata: {
              taskId: parsed.taskId,
              context: parsed.context,
              runMetadata: parsed.metadata,
            },
          });

          const run = await options.taskExecutionService.queue(parsed.taskId, {
            triggerSource: "template",
            context: parsed.context,
            metadata: parsed.metadata,
          });
          return success("Task template queued.", taskRunSchema.parse(run));
        }, "Failed to run task template."),
    },
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
    {
      name: updateTaskContextToolMetadata.name,
      description: updateTaskContextToolMetadata.description,
      context: updateTaskContextToolMetadata.context,
      inputSchema: updateTaskContextToolInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = updateTaskContextToolInputSchema.parse(args);
          const task = await options.taskService.updateContext(parsed.taskId, parsed.context);

          if (!task) {
            throw new Error("Task not found.");
          }

          return success("Task context updated.", taskSchema.parse(task));
        }, "Failed to update task context."),
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
    throw new Error(`Agent '${agentSlug}' not found.`);
  }

  return row.id;
}

async function confirmMutation(
  options: Pick<TaskManagementToolOptions, "conversationService" | "liveRequestService">,
  input: { agentId: string; title: string; description: string; metadata: Record<string, unknown> },
): Promise<void> {
  if (!options.conversationService || !options.liveRequestService) {
    return;
  }

  const snapshot = await options.conversationService.resolveCurrent(input.agentId);
  const decision = await options.liveRequestService.create({
    conversationId: snapshot.current.id,
    kind: "task_management_confirmation",
    closable: false,
    presentation: {
      title: input.title,
      description: input.description,
      submitLabel: "Confirm",
      cancelLabel: "Cancel",
    },
    fields: [],
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
