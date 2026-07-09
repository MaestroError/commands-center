import { z } from "zod";

import { artifactTypeSchema } from "./artifacts.js";
import { taskRunOutcomeSchema, taskRunStatusSchema } from "./tasks.js";

// Public MCP tool result shapes. These are the leak-free projections returned by
// the public MCP server's run tools — no agent ids, rendered prompts, permission
// profiles, storage keys, or file paths.

// Artifact summary for a run result. Phase 6 enriches file/document artifacts
// with a displayable and downloadable URL plus mime/size; `url` artifacts expose
// the external link as `displayUrl`.
export const mcpArtifactSummarySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: artifactTypeSchema,
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  // Absent when the template disabled that URL (or the artifact can't be served).
  displayUrl: z.string().nullish(),
  downloadUrl: z.string().nullish(),
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

// Operator-tunable public MCP settings.
export const PUBLIC_MCP_SYNC_WAIT_CAP_MAX_SECONDS = 600;
export const PUBLIC_MCP_SYNC_WAIT_CAP_DEFAULT_SECONDS = 120;

export const publicMcpSettingsSchema = z.object({
  // How long a sync run tool holds its response waiting for a terminal run
  // before returning the id for async polling. 0 = return the id immediately.
  syncToolWaitCapSeconds: z
    .number()
    .int()
    .min(0)
    .max(PUBLIC_MCP_SYNC_WAIT_CAP_MAX_SECONDS)
    .default(PUBLIC_MCP_SYNC_WAIT_CAP_DEFAULT_SECONDS),
});

export type PublicMcpSettings = z.infer<typeof publicMcpSettingsSchema>;
