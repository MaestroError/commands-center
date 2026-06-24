import { z } from "zod";

/**
 * Activity kinds. `task_run_approval` is included now (produced by the task-run
 * approval feature) so adding it later needs no schema change. Phase 1 ships the
 * store + shell; producers for each kind arrive in later phases.
 */
export const activityKindSchema = z.enum([
  "secret_request",
  "task_completed",
  "task_needs_review",
  "feedback_resolved",
  "subtask_needs_review",
  "task_run_failed",
  "task_run_approval",
]);

export const activityLevelSchema = z.enum(["action_required", "info"]);

export const activityStatusSchema = z.enum(["pending", "archived"]);

export const activitySchema = z.object({
  id: z.string().min(1),
  kind: activityKindSchema,
  level: activityLevelSchema,
  status: activityStatusSchema,
  title: z.string().min(1),
  body: z.string().nullable().default(null),
  // Kind-specific payload (e.g. { secretKey } | { taskId, taskRunId }).
  // Validated by producers; opaque at the API boundary.
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable().default(null),
});

export const activityListResponseSchema = z.object({
  activities: z.array(activitySchema),
  actionRequiredCount: z.number().int().nonnegative(),
});

export type ActivityKind = z.infer<typeof activityKindSchema>;
export type ActivityLevel = z.infer<typeof activityLevelSchema>;
export type ActivityStatus = z.infer<typeof activityStatusSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type ActivityListResponse = z.infer<typeof activityListResponseSchema>;
