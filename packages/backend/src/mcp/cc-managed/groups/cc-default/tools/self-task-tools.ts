import { z } from "zod";

import {
  appendTaskContextInputSchema,
  createTaskInputSchema,
  listTaskRunsQuerySchema,
  listTasksQuerySchema,
  taskContextSchema,
  taskRunSchema,
  taskSchema,
  type Task,
} from "@cc/shared/schemas";

import type { AppDb } from "../../../../../db/client.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import type { TaskService } from "../../../../../services/task-service.js";
import { withTaskBoardUrl, withTaskRunBoardUrl } from "../../../task-board-urls.js";

type SelfTaskToolOptions = {
  db: AppDb;
  config: RuntimeConfig;
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

// Strict everywhere: unexpected fields (including any agent/specialist id) become
// explicit validation errors instead of being silently dropped, matching the
// self-tool safety boundary.
const taskIdInputSchema = z
  .object({
    taskId: z.string().trim().min(1),
  })
  .strict();

const taskRunIdInputSchema = taskIdInputSchema
  .extend({
    runId: z.string().trim().min(1),
  })
  .strict();

const scheduleSelfTaskInputSchema = taskIdInputSchema
  .extend({
    scheduledAt: z.string().datetime(),
    dueAt: z.string().datetime().optional(),
  })
  .strict();

const listSelfTaskRunsInputSchema = taskIdInputSchema
  .extend({
    query: listTaskRunsQuerySchema.partial().optional(),
  })
  .strict();

const appendSelfTaskContextInputSchema = taskIdInputSchema
  .merge(appendTaskContextInputSchema)
  .strict();

const mcpTaskSchema = taskSchema.extend({
  url: z.string().url(),
});

const mcpTaskRunSchema = taskRunSchema.extend({
  taskUrl: z.string().url(),
});

const listSelfTasksOutputSchema = z.object({
  tasks: z.array(mcpTaskSchema),
});

const listSelfTaskRunsOutputSchema = z.object({
  runs: z.array(mcpTaskRunSchema),
});

const selfTaskArtifactEntrySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  type: z.union([z.literal("url"), z.literal("file")]),
  link: z.string().min(1),
  sourceRunId: z.string(),
});

const listSelfTaskArtifactsOutputSchema = z.object({
  taskId: z.string(),
  artifacts: z.array(selfTaskArtifactEntrySchema),
});

const listSelfTaskRunArtifactsOutputSchema = z.object({
  taskId: z.string(),
  runId: z.string(),
  artifacts: z.array(selfTaskArtifactEntrySchema),
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

export const listSelfTaskArtifactsToolMetadata = {
  name: "list_self_task_artifacts",
  description:
    "List all file and URL artifacts produced across every run of one of your own CommandsCenter tasks. Each entry includes the artifact title, description, path or URL, and the id of the run that produced it. Returns an empty list when no runs have produced artifacts yet. Will fail if the task belongs to a different specialist.",
  context: "both",
} as const;

export const listSelfTaskRunArtifactsToolMetadata = {
  name: "list_self_task_run_artifacts",
  description:
    "List the file and URL artifacts produced by a single run of one of your own CommandsCenter tasks. Each entry includes the artifact title, description, and path or URL. Returns an empty list when the run produced no artifacts. Will fail if the task belongs to a different specialist.",
  context: "both",
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
      outputSchema: mcpTaskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = createSelfTaskInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const task = await options.taskService.create(
            createTaskInputSchema.parse({ ...parsed, agentId }),
          );

          return success(
            "Task created.",
            mcpTaskSchema.parse(withTaskBoardUrl(options.config, task)),
          );
        }, "Failed to create task."),
    },
    {
      name: scheduleSelfTaskToolMetadata.name,
      description: scheduleSelfTaskToolMetadata.description,
      context: scheduleSelfTaskToolMetadata.context,
      inputSchema: scheduleSelfTaskInputSchema,
      outputSchema: mcpTaskSchema,
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

          return success(
            "Task scheduled.",
            mcpTaskSchema.parse(withTaskBoardUrl(options.config, task)),
          );
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
            tasks: z
              .array(mcpTaskSchema)
              .parse(tasks.map((task) => withTaskBoardUrl(options.config, task))),
          });
        }, "Failed to list tasks."),
    },
    {
      name: getSelfTaskToolMetadata.name,
      description: getSelfTaskToolMetadata.description,
      context: getSelfTaskToolMetadata.context,
      inputSchema: taskIdInputSchema,
      outputSchema: mcpTaskSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = taskIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const task = await requireSelfTask(options.taskService, parsed.taskId, agentId);

          return success(
            "Task loaded.",
            mcpTaskSchema.parse(withTaskBoardUrl(options.config, task)),
          );
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
            runs: z
              .array(mcpTaskRunSchema)
              .parse(runs.map((run) => withTaskRunBoardUrl(options.config, run))),
          });
        }, "Failed to list task runs."),
    },
    {
      name: getSelfTaskRunToolMetadata.name,
      description: getSelfTaskRunToolMetadata.description,
      context: getSelfTaskRunToolMetadata.context,
      inputSchema: taskRunIdInputSchema,
      outputSchema: mcpTaskRunSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = taskRunIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTask(options.taskService, parsed.taskId, agentId);
          const run = await options.taskService.getRun(parsed.taskId, parsed.runId);

          if (!run) {
            throw new Error("Task run not found.");
          }

          return success(
            "Task run loaded.",
            mcpTaskRunSchema.parse(withTaskRunBoardUrl(options.config, run)),
          );
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

// Phase 5: self artifact read tools. Use the artifacts already stored on each
// TaskRun object; no filesystem or TaskArtifactService access required.
export function createSelfTaskArtifactToolDefinitions(options: SelfTaskToolOptions) {
  return [
    {
      name: listSelfTaskArtifactsToolMetadata.name,
      description: listSelfTaskArtifactsToolMetadata.description,
      context: listSelfTaskArtifactsToolMetadata.context,
      inputSchema: taskIdInputSchema,
      outputSchema: listSelfTaskArtifactsOutputSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = taskIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTask(options.taskService, parsed.taskId, agentId);
          const runs = await options.taskService.listRuns(parsed.taskId, {});
          const artifacts = runs.flatMap((run) =>
            run.artifacts.map((a) => ({ ...a, sourceRunId: run.id })),
          );

          return success(
            `Found ${String(artifacts.length)} artifact${artifacts.length === 1 ? "" : "s"}.`,
            listSelfTaskArtifactsOutputSchema.parse({ taskId: parsed.taskId, artifacts }),
          );
        }, "Failed to list task artifacts."),
    },
    {
      name: listSelfTaskRunArtifactsToolMetadata.name,
      description: listSelfTaskRunArtifactsToolMetadata.description,
      context: listSelfTaskRunArtifactsToolMetadata.context,
      inputSchema: taskRunIdInputSchema,
      outputSchema: listSelfTaskRunArtifactsOutputSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = taskRunIdInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          await requireSelfTask(options.taskService, parsed.taskId, agentId);
          const run = await options.taskService.getRun(parsed.taskId, parsed.runId);

          if (!run) {
            throw new Error("Task run not found.");
          }

          const artifacts = run.artifacts.map((a) => ({ ...a, sourceRunId: run.id }));

          return success(
            `Found ${String(artifacts.length)} artifact${artifacts.length === 1 ? "" : "s"}.`,
            listSelfTaskRunArtifactsOutputSchema.parse({
              taskId: parsed.taskId,
              runId: parsed.runId,
              artifacts,
            }),
          );
        }, "Failed to list task run artifacts."),
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
