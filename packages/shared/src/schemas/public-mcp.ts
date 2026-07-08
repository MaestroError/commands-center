import { z } from "zod";

import { artifactTypeSchema } from "./artifacts.js";
import { taskRunOutcomeSchema, taskRunStatusSchema } from "./tasks.js";

// Public MCP tool result shapes. These are the leak-free projections returned by
// the public MCP server's run tools — no agent ids, rendered prompts, permission
// profiles, storage keys, or file paths.

// Artifact summary for a run result. Phase 2 exposes titles/types only; the
// displayable/downloadable URLs are added in Phase 6.
export const mcpArtifactSummarySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: artifactTypeSchema,
});

export const mcpTaskRunResultSchema = z.object({
  taskId: z.string().min(1),
  runId: z.string().min(1),
  status: taskRunStatusSchema,
  outcome: taskRunOutcomeSchema.nullable(),
  finalMessage: z.string().nullable(),
  resultText: z.string().nullable(),
  needsHumanReview: z.boolean(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  artifacts: z.array(mcpArtifactSummarySchema),
  // True when a sync run tool returned before the run reached a terminal state
  // (hit the wait cap); the client should poll get_task_result with the runId.
  timedOut: z.boolean(),
});

export type McpArtifactSummary = z.infer<typeof mcpArtifactSummarySchema>;
export type McpTaskRunResult = z.infer<typeof mcpTaskRunResultSchema>;
