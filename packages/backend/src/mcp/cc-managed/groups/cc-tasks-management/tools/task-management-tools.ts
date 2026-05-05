import { z } from "zod";

import {
  createTaskInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  taskListSchema,
  taskRunListSchema,
  taskRunSchema,
  taskSchema,
  triggerTaskInputSchema,
  type CreateTaskInput,
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

const getTaskRunInputSchema = taskIdInputSchema.extend({
  runId: z.string().trim().min(1),
});

const createManagedTaskInputSchema = createTaskInputSchema
  .omit({ agentId: true, triggerMode: true, schedule: true })
  .extend({
    agentId: z.string().trim().min(1).optional(),
  });

const scheduleOneTimeTaskInputSchema = createManagedTaskInputSchema.extend({
  runAt: z.string().datetime(),
  timezone: z.string().trim().min(1).optional(),
});

const recurringHistoryInputSchema = taskIdInputSchema.extend({
  limit: z.number().int().min(1).max(50).optional(),
});

const listTasksOutputSchema = z.object({
  tasks: taskListSchema,
});

const listTaskRunsOutputSchema = z.object({
  runs: taskRunListSchema,
});

const recurringHistoryOutputSchema = z.object({
  task: taskSchema,
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

export const triggerTaskToolMetadata = {
  name: "trigger_task",
  description: "Manually trigger an existing CommandsCenter task after operator confirmation.",
  context: "chat",
} as const;

export const scheduleOneTimeTaskToolMetadata = {
  name: "schedule_one_time_task",
  description: "Create a one-time scheduled CommandsCenter task after operator confirmation.",
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

export const listRecurringTaskHistoryToolMetadata = {
  name: "list_recurring_task_history",
  description: "Inspect recent run history for a recurring CommandsCenter task.",
  context: "chat",
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
      name: triggerTaskToolMetadata.name,
      description: triggerTaskToolMetadata.description,
      context: triggerTaskToolMetadata.context,
      inputSchema: taskIdInputSchema,
      outputSchema: taskRunSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = taskIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);

          await confirmMutation(options, {
            agentId,
            title: "Trigger task",
            description: `Manually trigger task '${parsed.taskId}'.`,
            metadata: { taskId: parsed.taskId, triggerSource: "manual" },
          });

          const run = await options.taskExecutionService.trigger(
            parsed.taskId,
            triggerTaskInputSchema.parse({ triggerSource: "manual" }),
          );
          return success("Task triggered.", taskRunSchema.parse(run));
        }, "Failed to trigger task."),
    },
    {
      name: scheduleOneTimeTaskToolMetadata.name,
      description: scheduleOneTimeTaskToolMetadata.description,
      context: scheduleOneTimeTaskToolMetadata.context,
      inputSchema: scheduleOneTimeTaskInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = scheduleOneTimeTaskInputSchema.parse(args);
          const agentId =
            parsed.agentId ?? (await requireCallingAgentId(options.db, context.agentSlug));
          const input: CreateTaskInput = createTaskInputSchema.parse({
            ...parsed,
            agentId,
            triggerMode: "scheduled_once",
            schedule: {
              mode: "scheduled_once",
              runAt: parsed.runAt,
              timezone: parsed.timezone,
            },
          });

          await confirmMutation(options, {
            agentId,
            title: "Schedule one-time task",
            description: `Schedule task '${input.title}' for ${parsed.runAt}.`,
            metadata: {
              taskTitle: input.title,
              triggerMode: input.triggerMode,
              runAt: parsed.runAt,
            },
          });

          const task = await options.taskService.create(input);
          return success("One-time task scheduled.", taskSchema.parse(task));
        }, "Failed to schedule one-time task."),
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
      name: listRecurringTaskHistoryToolMetadata.name,
      description: listRecurringTaskHistoryToolMetadata.description,
      context: listRecurringTaskHistoryToolMetadata.context,
      inputSchema: recurringHistoryInputSchema,
      outputSchema: recurringHistoryOutputSchema,
      execute: async (args: unknown) =>
        executeTool(async () => {
          const parsed = recurringHistoryInputSchema.parse(args);
          const task = await options.taskService.get(parsed.taskId);

          if (!task) {
            throw new Error("Task not found.");
          }

          if (task.triggerMode !== "recurring") {
            throw new Error("Task is not recurring.");
          }

          const runs = (await options.taskService.listRuns(task.id, {})).slice(
            0,
            parsed.limit ?? 10,
          );
          return success(
            `Found ${String(runs.length)} recurring task run${runs.length === 1 ? "" : "s"}.`,
            {
              task,
              runs: taskRunListSchema.parse(runs),
            },
          );
        }, "Failed to list recurring task history."),
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
