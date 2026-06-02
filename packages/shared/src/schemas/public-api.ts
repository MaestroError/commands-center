import { z } from "zod";

import {
  taskRunOutcomeSchema,
  taskRunStatusSchema,
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
