import {
  addTaskRunArtifactInputSchema,
  markTaskRunNeedsReviewInputSchema,
  setTaskRunResultInputSchema,
  taskRunSchema,
} from "@cc/shared/schemas";

import type { AppDb } from "../../../../../db/client.js";
import type { TaskService } from "../../../../../services/task-service.js";

type TaskRunOutcomeToolOptions = {
  db: AppDb;
  taskService: TaskService;
};

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export const setTaskResultToolMetadata = {
  name: "set_task_result",
  description:
    "Set the explicit result text for the active task, which simply describes the final outcome.",
  context: "task_run",
} as const;

export const addTaskArtifactToolMetadata = {
  name: "add_task_artifact",
  description: "Attach a generated file, URL, or other artifact to the active task.",
  context: "task_run",
} as const;

export const markNeedsHumanReviewToolMetadata = {
  name: "mark_needs_human_review",
  description: "Mark the active task as requiring user review or follow-up.",
  context: "task_run",
} as const;

export function createTaskRunOutcomeToolDefinitions(options: TaskRunOutcomeToolOptions) {
  return [
    {
      name: setTaskResultToolMetadata.name,
      description: setTaskResultToolMetadata.description,
      context: setTaskResultToolMetadata.context,
      inputSchema: setTaskRunResultInputSchema,
      outputSchema: taskRunSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = setTaskRunResultInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const run = await options.taskService.setRunResultText(
            parsed.taskRunId,
            agentId,
            parsed.resultText,
          );

          return success("Task result updated.", taskRunSchema.parse(run));
        }, "Failed to set task result."),
    },
    {
      name: addTaskArtifactToolMetadata.name,
      description: addTaskArtifactToolMetadata.description,
      context: addTaskArtifactToolMetadata.context,
      inputSchema: addTaskRunArtifactInputSchema,
      outputSchema: taskRunSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = addTaskRunArtifactInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const run = await options.taskService.addRunArtifact(
            parsed.taskRunId,
            agentId,
            parsed.artifact,
          );

          return success("Task artifact added.", taskRunSchema.parse(run));
        }, "Failed to add task artifact."),
    },
    {
      name: markNeedsHumanReviewToolMetadata.name,
      description: markNeedsHumanReviewToolMetadata.description,
      context: markNeedsHumanReviewToolMetadata.context,
      inputSchema: markTaskRunNeedsReviewInputSchema,
      outputSchema: taskRunSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = markTaskRunNeedsReviewInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const run = await options.taskService.markRunNeedsHumanReview(
            parsed.taskRunId,
            agentId,
            parsed.reason,
          );

          return success("Task run marked for human review.", taskRunSchema.parse(run));
        }, "Failed to mark task run for human review."),
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
