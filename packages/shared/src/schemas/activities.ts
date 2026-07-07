import { z } from "zod";

import { recurringTaskScheduleSchema, taskRunArtifactSchema } from "./tasks.js";

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
  // Specialist-authored notifications (cc_notifications MCP group). Info/warning
  // carry markdown in `body`; the `*_proposal` kinds carry a typed payload the
  // operator confirms from the activity feed.
  "specialist_info",
  "specialist_warning",
  "task_proposal",
  "task_template_proposal",
  "run_template_proposal",
  "run_command_proposal",
]);

export const activityLevelSchema = z.enum(["action_required", "info"]);

export const activityStatusSchema = z.enum(["pending", "archived"]);

const reviewSuggestedRepliesSchema = z.array(z.string().trim().min(1).max(200)).max(6);

/**
 * Shared payload helper for `task_needs_review` and `subtask_needs_review`.
 * `activitySchema.payload` stays opaque at the API boundary, but producers and
 * consumers can use this helper when they need typed access to review-question
 * fields on those activity kinds.
 */
export const reviewActivityPayloadSchema = z
  .object({
    taskId: z.string().min(1),
    taskRunId: z.string().min(1),
    subtaskId: z.string().min(1).optional(),
    question: z.string().trim().min(1).optional(),
    suggestedReplies: reviewSuggestedRepliesSchema.optional(),
    artifacts: z.array(taskRunArtifactSchema).optional(),
  })
  .refine(
    (value) =>
      value.question !== undefined ||
      value.suggestedReplies === undefined ||
      value.suggestedReplies.length === 0,
    {
      message: "Question is required when suggested replies are provided.",
      path: ["question"],
    },
  );

/**
 * Payload helpers for specialist-authored notification activities. Like
 * `reviewActivityPayloadSchema`, the activity's `payload` stays opaque at the
 * API boundary; producers (the cc_notifications tools) and consumers (the
 * activity feed action cards) use these when they need typed access.
 */
const specialistSlugField = z.string().trim().min(1).max(200);

export const taskProposalPayloadSchema = z.object({
  title: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1),
  assigneeSlug: specialistSlugField.optional(),
  taskDescription: z.string().trim().min(1).optional(),
  proposedBySlug: specialistSlugField.optional(),
});

export const taskTemplateProposalPayloadSchema = z.object({
  title: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1),
  assigneeSlug: specialistSlugField.optional(),
  taskDescription: z.string().trim().min(1).optional(),
  recurrence: recurringTaskScheduleSchema.optional(),
  proposedBySlug: specialistSlugField.optional(),
});

export const runTemplateProposalPayloadSchema = z.object({
  templateId: z.string().min(1),
  templateTitle: z.string().trim().min(1).max(500).optional(),
  reason: z.string().trim().min(1),
  proposedBySlug: specialistSlugField.optional(),
});

export const runCommandProposalPayloadSchema = z.object({
  command: z.string().trim().min(1).max(4000),
  reason: z.string().trim().min(1).optional(),
  cwd: z.string().trim().min(1).optional(),
  proposedBySlug: specialistSlugField.optional(),
});

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
export type ReviewActivityPayload = z.infer<typeof reviewActivityPayloadSchema>;
