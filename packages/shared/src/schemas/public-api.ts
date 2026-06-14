import { z } from "zod";

import {
  taskRunOutcomeSchema,
  taskRunStatusSchema,
  taskRunTriggerSourceSchema,
  taskStatusSchema,
  taskSubtaskDerivedStatusSchema,
  taskTodoStatusSchema,
  uploadTaskContextAttachmentInputSchema,
} from "./tasks.js";

const looseRecordSchema = z.record(z.string(), z.unknown());

/**
 * Minimal, public-safe projection of a task template. Never exposes internal
 * agent IDs, permission profiles, or rendered prompts.
 */
export const publicTaskTemplateSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
});

export const publicTaskTemplateListResponseSchema = z.object({
  templates: z.array(publicTaskTemplateSummarySchema),
});

export const publicTriggerScheduleSchema = z.object({
  runAt: z
    .string()
    .datetime()
    .refine((value) => new Date(value).getTime() > Date.now(), {
      message: "schedule.runAt must be in the future.",
    }),
  timezone: z.string().trim().min(1).optional(),
});

export const publicTriggerTemplateBodySchema = z.object({
  context: z
    .object({
      text: z.string().trim().min(1).optional(),
    })
    .optional(),
  // Reuses the internal upload shape verbatim (base64 `dataUrl` + `sizeBytes`).
  // The 10 MB cap and MIME allow-list are enforced downstream by `storeForTask`,
  // not duplicated here.
  attachments: z.array(uploadTaskContextAttachmentInputSchema).optional(),
  schedule: publicTriggerScheduleSchema.optional(),
  metadata: looseRecordSchema.optional(),
});

export const publicTriggerTemplateResponseSchema = z.object({
  taskId: z.string().min(1),
  runId: z.string().min(1).nullable(),
  status: z.enum(["queued", "scheduled"]),
  scheduledFor: z.string().datetime().nullable(),
});

/**
 * Public-safe projection of a task run. Deliberately omits artifacts, local
 * paths, storage keys, and file download URLs (see Epic 10 for safe sharing).
 */
export const publicTaskRunStatusSchema = z.object({
  runId: z.string().min(1),
  taskId: z.string().min(1),
  status: taskRunStatusSchema,
  outcome: taskRunOutcomeSchema.nullable(),
  finalMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});

export type PublicTaskTemplateSummary = z.infer<typeof publicTaskTemplateSummarySchema>;
export type PublicTaskTemplateListResponse = z.infer<typeof publicTaskTemplateListResponseSchema>;
export type PublicTriggerTemplateBody = z.input<typeof publicTriggerTemplateBodySchema>;
export type PublicTriggerTemplateResponse = z.infer<typeof publicTriggerTemplateResponseSchema>;
export type PublicTaskRunStatus = z.infer<typeof publicTaskRunStatusSchema>;

// ---------------------------------------------------------------------------
// Epic 09 — direct task operations (create / trigger / schedule / inspect)
// ---------------------------------------------------------------------------

export const publicTaskTodoSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  status: taskTodoStatusSchema,
});

/**
 * Public-safe projection of a task run. Richer than {@link publicTaskRunStatusSchema}
 * (adds trigger source, result text, review/error fields) but still omits every
 * engine-internal field (rendered prompt, permissions, session id, trigger
 * metadata) and all artifacts / local paths / storage keys.
 */
export const publicTaskRunSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  status: taskRunStatusSchema,
  triggerSource: taskRunTriggerSourceSchema,
  outcome: taskRunOutcomeSchema.nullable(),
  finalMessage: z.string().nullable(),
  resultText: z.string().nullable(),
  needsHumanReview: z.boolean(),
  humanReviewReason: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const publicFeedbackSubtaskSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  status: taskSubtaskDerivedStatusSchema,
  latestRun: publicTaskRunSchema.nullable(),
  replies: z.array(publicTaskRunSchema),
});

export const publicFeedbackThreadSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  body: z.string(),
  createdAt: z.string().datetime(),
  subtasks: z.array(publicFeedbackSubtaskSchema),
});

/** Public-safe projection of a task. Never exposes the permission profile. */
export const publicTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  agentId: z.string().min(1),
  todos: z.array(publicTaskTodoSchema),
  scheduledAt: z.string().datetime().nullable(),
  dueAt: z.string().datetime().nullable(),
  doneAt: z.string().datetime().nullable(),
  latestRunId: z.string().nullable(),
  latestFinalMessage: z.string().nullable(),
  sourceTemplateId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // Present only when requested via ?expand=runs,feedback.
  runs: z.array(publicTaskRunSchema).optional(),
  feedback: z.array(publicFeedbackThreadSchema).optional(),
});

export const publicSpecialistSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  slug: z.string(),
});

export const publicCreateTaskBodySchema = z.object({
  agentId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  todos: z.array(z.object({ content: z.string().trim().min(1) })).optional(),
  context: z
    .object({
      text: z.string().trim().min(1).optional(),
    })
    .optional(),
  attachments: z.array(uploadTaskContextAttachmentInputSchema).optional(),
  scheduledAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
});

export const publicTriggerTaskBodySchema = z.object({
  metadata: looseRecordSchema.optional(),
});

export const publicTriggerTaskResponseSchema = z.object({
  taskId: z.string().min(1),
  runId: z.string().min(1),
  status: taskRunStatusSchema,
});

export const publicScheduleTaskBodySchema = z
  .object({
    // `null` clears the schedule (unschedule); a value must be in the future.
    runAt: z.string().datetime().nullable(),
    timezone: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.runAt === null || new Date(value.runAt).getTime() > Date.now(), {
    message: "runAt must be in the future.",
    path: ["runAt"],
  });

export const listPublicTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  agentId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1).optional(),
});

export const publicGetTaskQuerySchema = z.object({
  // Comma-separated list, e.g. "runs,feedback".
  expand: z.string().optional(),
});

export const publicTaskListResponseSchema = z.object({
  tasks: z.array(publicTaskSchema),
});

export const publicTaskRunListResponseSchema = z.object({
  runs: z.array(publicTaskRunSchema),
});

export const publicFeedbackListResponseSchema = z.object({
  feedback: z.array(publicFeedbackThreadSchema),
});

export const publicSpecialistListResponseSchema = z.object({
  specialists: z.array(publicSpecialistSummarySchema),
});

export type PublicTaskTodo = z.infer<typeof publicTaskTodoSchema>;
export type PublicTaskRun = z.infer<typeof publicTaskRunSchema>;
export type PublicFeedbackThread = z.infer<typeof publicFeedbackThreadSchema>;
export type PublicTask = z.infer<typeof publicTaskSchema>;
export type PublicSpecialistSummary = z.infer<typeof publicSpecialistSummarySchema>;
export type PublicCreateTaskBody = z.input<typeof publicCreateTaskBodySchema>;
export type PublicTriggerTaskBody = z.input<typeof publicTriggerTaskBodySchema>;
export type PublicTriggerTaskResponse = z.infer<typeof publicTriggerTaskResponseSchema>;
export type PublicScheduleTaskBody = z.input<typeof publicScheduleTaskBodySchema>;
export type ListPublicTasksQuery = z.infer<typeof listPublicTasksQuerySchema>;
