import { z } from "zod";

import {
  addTaskRunArtifactInputSchema,
  artifactSchema,
  markTaskRunNeedsReviewInputSchema,
  reviewQuestionSchema,
  setTaskRunResultInputSchema,
  taskRunOutcomeSchema,
  taskRunStatusSchema,
  type TaskRun,
} from "@cc/shared/schemas";

import type { AppDb } from "../../../../../db/client.js";
import type { RuntimeConfig } from "../../../../../lib/runtime-config.js";
import type { TaskService } from "../../../../../services/task-service.js";
import { withTaskRunBoardUrl } from "../../../task-board-urls.js";

type TaskRunOutcomeToolOptions = {
  db: AppDb;
  config: RuntimeConfig;
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
  description:
    "Attach a generated artifact to the active task. Set `artifact.type` to one of: " +
    '"document" for a markdown file in the Documents module (set `link` to the path ' +
    'relative to Documents/, e.g. "design/overview.md"; the UI opens it in the Documents ' +
    'editor), "file" for any other workspace file (set `link` to the workspace-relative ' +
    'path; opens in the File Manager), or "url" for an external link. When a task creates ' +
    "or updates a global document (e.g. via register_global_document), attach it here " +
    'with type "document" so the user can open it directly in the Documents module.',
  context: "task_run",
} as const;

export const markNeedsHumanReviewToolMetadata = {
  name: "mark_needs_human_review",
  description:
    "Mark the active task as requiring user review or follow-up, optionally asking a specific question with suggested replies.",
  context: "task_run",
} as const;

// Compact outcome projection for the task-run outcome tools. The full task-run
// record carries the rendered prompt, rendered context, permission profile and
// diagnostics — none of which the calling specialist needs back after setting a
// result. Return only the run's headline metadata plus its artifacts so the
// tool result stays small.
const mcpTaskRunOutcomeResultSchema = z.object({
  taskId: z.string().min(1),
  runId: z.string().min(1),
  status: taskRunStatusSchema,
  outcome: taskRunOutcomeSchema.optional(),
  resultText: z.string().optional(),
  finalMessage: z.string().optional(),
  needsHumanReview: z.boolean(),
  humanReviewReason: z.string().optional(),
  reviewQuestion: reviewQuestionSchema.optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  artifacts: z.array(artifactSchema).default([]),
  taskUrl: z.string().url(),
});

function toOutcomeResult(
  config: RuntimeConfig,
  run: TaskRun,
): z.infer<typeof mcpTaskRunOutcomeResultSchema> {
  const { taskUrl } = withTaskRunBoardUrl(config, run);
  return mcpTaskRunOutcomeResultSchema.parse({
    taskId: run.taskId,
    runId: run.id,
    status: run.status,
    outcome: run.outcome,
    resultText: run.resultText,
    finalMessage: run.finalMessage,
    needsHumanReview: run.needsHumanReview,
    humanReviewReason: run.humanReviewReason,
    reviewQuestion: run.reviewQuestion,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    artifacts: run.artifacts,
    taskUrl,
  });
}

export function createTaskRunOutcomeToolDefinitions(options: TaskRunOutcomeToolOptions) {
  return [
    {
      name: setTaskResultToolMetadata.name,
      description: setTaskResultToolMetadata.description,
      context: setTaskResultToolMetadata.context,
      inputSchema: setTaskRunResultInputSchema,
      outputSchema: mcpTaskRunOutcomeResultSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = setTaskRunResultInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const run = await options.taskService.setRunResultText(
            parsed.taskRunId,
            agentId,
            parsed.resultText,
          );

          return success("Task result updated.", toOutcomeResult(options.config, run));
        }, "Failed to set task result."),
    },
    {
      name: addTaskArtifactToolMetadata.name,
      description: addTaskArtifactToolMetadata.description,
      context: addTaskArtifactToolMetadata.context,
      inputSchema: addTaskRunArtifactInputSchema,
      outputSchema: mcpTaskRunOutcomeResultSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = addTaskRunArtifactInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const run = await options.taskService.addRunArtifact(
            parsed.taskRunId,
            agentId,
            parsed.artifact,
          );

          return success("Task artifact added.", toOutcomeResult(options.config, run));
        }, "Failed to add task artifact."),
    },
    {
      name: markNeedsHumanReviewToolMetadata.name,
      description: markNeedsHumanReviewToolMetadata.description,
      context: markNeedsHumanReviewToolMetadata.context,
      inputSchema: markTaskRunNeedsReviewInputSchema,
      outputSchema: mcpTaskRunOutcomeResultSchema,
      execute: async (args: unknown, context: { agentSlug: string }) =>
        executeTool(async () => {
          const parsed = markTaskRunNeedsReviewInputSchema.parse(args);
          const agentId = await requireCallingAgentId(options.db, context.agentSlug);
          const run = await options.taskService.markRunNeedsHumanReview(
            parsed.taskRunId,
            agentId,
            parsed.reason,
            parsed.question,
            parsed.suggestedReplies,
          );

          return success("Task run marked for human review.", toOutcomeResult(options.config, run));
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
