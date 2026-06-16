import { z } from "zod";

import {
  appendTaskContextInputSchema,
  createTaskInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  taskContextSchema,
  taskListSchema,
  taskRunListSchema,
  taskRunSchema,
  taskSchema,
  type Task,
} from "@cc/shared/schemas";

import type { AppDb } from "../../../../../db/client.js";
import type { TaskService } from "../../../../../services/task-service.js";

type SelfTaskToolOptions = {
  db: AppDb;
  taskService: TaskService;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

// Self tools never accept an agent/specialist id: the calling specialist is
// resolved from the MCP token/route. `.strict()` turns any attempt to pass one
// (e.g. `agentId`, `defaultAgentId`) into an explicit validation error instead
// of a silently ignored field, keeping the safety boundary obvious.
const createSelfTaskInputSchema = createTaskInputSchema
  .omit({ agentId: true, defaultAgentId: true })
  .strict();

const listSelfTasksInputSchema = listTasksQuerySchema.omit({ agentId: true }).partial().strict();

const taskIdInputSchema = z.object({
  taskId: z.string().trim().min(1),
});

const scheduleSelfTaskInputSchema = taskIdInputSchema.extend({
  scheduledAt: z.string().datetime(),
  dueAt: z.string().datetime().optional(),
});

const listSelfTaskRunsInputSchema = taskIdInputSchema.extend({
  query: listTaskRunsQuerySchema.partial().optional(),
});

const getSelfTaskRunInputSchema = taskIdInputSchema.extend({
  runId: z.string().trim().min(1),
});

const appendSelfTaskContextInputSchema = taskIdInputSchema.merge(appendTaskContextInputSchema);

const listSelfTasksOutputSchema = z.object({
  tasks: taskListSchema,
});

const listSelfTaskRunsOutputSchema = z.object({
  runs: taskRunListSchema,
});

export const createSelfTaskToolMetadata = {
  name: "create_self_task",
  description:
    "Create a CommandsCenter task assigned to the calling specialist. The task is always owned by you; you cannot assign it to another specialist.",
  context: "task_run",
} as const;

export const scheduleSelfTaskToolMetadata = {
  name: "schedule_self_task",
  description: "Schedule one of your own CommandsCenter tasks for later execution.",
  context: "both",
} as const;

export const listSelfTasksToolMetadata = {
  name: "list_self_tasks",
  description: "List CommandsCenter tasks assigned to the calling specialist.",
  context: "both",
} as const;

export const getSelfTaskToolMetadata = {
  name: "get_self_task",
  description: "Read one of your own CommandsCenter tasks by id.",
  context: "both",
} as const;

export const listSelfTaskRunsToolMetadata = {
  name: "list_self_task_runs",
  description: "List runs for one of your own CommandsCenter tasks.",
  context: "both",
} as const;

export const getSelfTaskRunToolMetadata = {
  name: "get_self_task_run",
  description: "Read one run for one of your own CommandsCenter tasks.",
  context: "both",
} as const;

export const readSelfTaskContextToolMetadata = {
  name: "read_self_task_context",
  description: "Read persistent context for one of your own CommandsCenter tasks.",
  context: "task_run",
} as const;

export const appendSelfTaskContextToolMetadata = {
  name: "append_self_task_context",
  description: "Append text to persistent context for one of your own CommandsCenter tasks.",
  context: "task_run",
} as const;

// Phase 1: self task reads and direct self task creation. These live in the
// cc_default group so every specialist can manage its own tasks by default,
// scoped strictly to the calling specialist.
export function createSelfTaskToolDefinitions(options: SelfTaskToolOptions) {
  return [
    {
      name: createSelfTaskToolMetadata.name,
      description: createSelfTaskToolMetadata.description,
      context: createSelfTaskToolMetadata.context,
      inputSchema: createSelfTaskInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = createSelfTaskInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const task = await options.taskService.create(
            createTaskInputSchema.parse({ ...parsed, agentId }),
          );

          return success("Task created.", taskSchema.parse(task));
        }, "Failed to create task."),
    },
    {
      name: scheduleSelfTaskToolMetadata.name,
      description: scheduleSelfTaskToolMetadata.description,
      context: scheduleSelfTaskToolMetadata.context,
      inputSchema: scheduleSelfTaskInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = scheduleSelfTaskInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTask(options.taskService, parsed.taskId, agentId);
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
      name: listSelfTasksToolMetadata.name,
      description: listSelfTasksToolMetadata.description,
      context: listSelfTasksToolMetadata.context,
      inputSchema: listSelfTasksInputSchema,
      outputSchema: listSelfTasksOutputSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const query = listSelfTasksInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const tasks = await options.taskService.list({ ...query, agentId });

          return success(`Found ${String(tasks.length)} task${tasks.length === 1 ? "" : "s"}.`, {
            tasks: taskListSchema.parse(tasks),
          });
        }, "Failed to list tasks."),
    },
    {
      name: getSelfTaskToolMetadata.name,
      description: getSelfTaskToolMetadata.description,
      context: getSelfTaskToolMetadata.context,
      inputSchema: taskIdInputSchema,
      outputSchema: taskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = taskIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const task = await requireSelfTask(options.taskService, parsed.taskId, agentId);

          return success("Task loaded.", taskSchema.parse(task));
        }, "Failed to get task."),
    },
    {
      name: listSelfTaskRunsToolMetadata.name,
      description: listSelfTaskRunsToolMetadata.description,
      context: listSelfTaskRunsToolMetadata.context,
      inputSchema: listSelfTaskRunsInputSchema,
      outputSchema: listSelfTaskRunsOutputSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = listSelfTaskRunsInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTask(options.taskService, parsed.taskId, agentId);
          const runs = await options.taskService.listRuns(parsed.taskId, parsed.query ?? {});

          return success(`Found ${String(runs.length)} task run${runs.length === 1 ? "" : "s"}.`, {
            runs: taskRunListSchema.parse(runs),
          });
        }, "Failed to list task runs."),
    },
    {
      name: getSelfTaskRunToolMetadata.name,
      description: getSelfTaskRunToolMetadata.description,
      context: getSelfTaskRunToolMetadata.context,
      inputSchema: getSelfTaskRunInputSchema,
      outputSchema: taskRunSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = getSelfTaskRunInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTask(options.taskService, parsed.taskId, agentId);
          const run = await options.taskService.getRun(parsed.taskId, parsed.runId);

          if (!run) {
            throw new Error("Task run not found.");
          }

          return success("Task run loaded.", taskRunSchema.parse(run));
        }, "Failed to get task run."),
    },
  ] as const;
}

// Phase 3: self task context. Mirrors read_task_context / append_task_context
// but enforces self ownership so knowing a task id is never enough to read or
// mutate another specialist's task context.
export function createSelfTaskContextToolDefinitions(options: {
  db: AppDb;
  taskService: TaskService;
}) {
  return [
    {
      name: readSelfTaskContextToolMetadata.name,
      description: readSelfTaskContextToolMetadata.description,
      context: readSelfTaskContextToolMetadata.context,
      inputSchema: taskIdInputSchema,
      outputSchema: taskContextSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = taskIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const task = await requireSelfTask(options.taskService, parsed.taskId, agentId);

          return success("Task context loaded.", taskContextSchema.parse(task.context));
        }, "Failed to read task context."),
    },
    {
      name: appendSelfTaskContextToolMetadata.name,
      description: appendSelfTaskContextToolMetadata.description,
      context: appendSelfTaskContextToolMetadata.context,
      inputSchema: appendSelfTaskContextInputSchema,
      outputSchema: taskContextSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = appendSelfTaskContextInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTask(options.taskService, parsed.taskId, agentId);
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

// Load a task and require that the calling specialist owns it. A missing task
// and a task owned by another specialist return the same "Task not found."
// error so a specialist cannot probe for task ids it does not own.
async function requireSelfTask(
  taskService: TaskService,
  taskId: string,
  agentId: string,
): Promise<Task> {
  const task = await taskService.get(taskId);

  if (!task || task.agentId !== agentId) {
    throw new Error("Task not found.");
  }

  return task;
}
