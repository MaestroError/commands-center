import { z } from "zod";

import {
  specialistAppMcpServerSchema,
  specialistMcpServerSchema,
  specialistPermissionRuleSchema,
  permissionActionSchema,
} from "./specialists.js";
import { conversationDetailSchema } from "./conversations.js";

const looseRecordSchema = z.record(z.string(), z.unknown());

export const boardTaskStatusSchema = z.enum([
  "backlog",
  "scheduled",
  "queued",
  "ready_to_check",
  "review",
  "done",
  "archived",
]);

const legacyTaskStatusSchema = z.enum([
  "draft",
  "enabled",
  "disabled",
  "running",
  "in_progress",
  "failed",
  "completed",
]);

export const taskStatusSchema = z.union([boardTaskStatusSchema, legacyTaskStatusSchema]);

export const taskRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "error",
  "cancelled",
  "skipped",
]);

export const taskRunOutcomeSchema = z.enum(["success", "needs_human_review", "failed"]);

/**
 * Sub-state of a `running` task run. `waiting_for_opencode` means CommandsCenter
 * has accepted the OpenCode prompt asynchronously and is monitoring the session
 * until it settles, rather than actively holding a request open. Derived from run
 * state at read time, so it is only present while the run is `running`.
 */
export const taskRunRuntimeStateSchema = z.enum(["waiting_for_opencode"]);

export const MAX_FALLBACK_MODELS = 5;
// Each fallback entry must be a qualified `provider/model` id (a non-empty
// provider, a slash, then a non-empty model). Downstream code calls
// `parseModel()` on these, which throws on unqualified values, so the format is
// validated at the schema boundary to keep invalid chains out of the DB.
const qualifiedModelSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[^/]+\/.+$/, "Fallback model must be a qualified 'provider/model' id.");
const fallbackModelsBaseSchema = z.array(qualifiedModelSchema).max(MAX_FALLBACK_MODELS);
export const fallbackModelsSchema = fallbackModelsBaseSchema.default([]);

export const taskSubtaskDerivedStatusSchema = z.enum([
  "backlog",
  "queued",
  "running",
  "ready_to_check",
  "review",
  "done",
]);

export const taskRunTriggerSourceSchema = z.enum([
  "manual",
  "scheduled",
  "api",
  "template",
  "system",
]);

export const taskTodoStatusSchema = z.enum(["pending", "in_progress", "completed"]);

export const taskTodoInputSchema = z.object({
  id: z.string().min(1).optional(),
  content: z.string().trim().min(1),
  status: taskTodoStatusSchema.default("pending"),
  createdAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
});

export const taskTodoSchema = taskTodoInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const taskContextAttachmentSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  storageKey: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const taskContextSchema = z.object({
  text: z.string().trim().optional(),
  attachments: z.array(taskContextAttachmentSchema).default([]),
});

export const taskContextInputSchema = z.object({
  text: z.string().trim().optional(),
  attachments: z.array(taskContextAttachmentSchema).default([]),
});

export const updateTaskContextInputSchema = taskContextInputSchema;

export const appendTaskContextInputSchema = z.object({
  text: z.string().trim().min(1),
});

export const uploadTaskContextAttachmentInputSchema = z.object({
  filename: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  dataUrl: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export const manualTaskScheduleSchema = z.object({
  mode: z.literal("manual"),
});

export const scheduledOnceTaskScheduleSchema = z.object({
  mode: z.literal("scheduled_once"),
  runAt: z.string().datetime(),
  timezone: z.string().trim().min(1).optional(),
});

export const taskRepeatFrequencySchema = z.enum(["hour", "day", "week", "month", "year"]);

export const taskWeekdaySchema = z.number().int().min(0).max(6);

export const taskRepeatRuleSchema = z.object({
  frequency: taskRepeatFrequencySchema,
  interval: z.number().int().min(1).default(1),
  weekdays: z.array(taskWeekdaySchema).optional(),
});

export const recurringTaskScheduleSchema = z.object({
  mode: z.literal("recurring"),
  anchorAt: z.string().datetime(),
  timezone: z.string().trim().min(1),
  repeatRule: taskRepeatRuleSchema,
});

export const taskScheduleSchema = z.discriminatedUnion("mode", [
  manualTaskScheduleSchema,
  scheduledOnceTaskScheduleSchema,
  recurringTaskScheduleSchema,
]);

const nullableDateTimeSchema = z.union([z.string().datetime(), z.null()]);

export const taskPermissionProfileSchema = z.object({
  customTools: z.array(z.string().min(1)).optional(),
  mcpServers: z.array(specialistMcpServerSchema).optional(),
  appMcpServers: z.array(specialistAppMcpServerSchema).optional(),
  toolPermissions: z.array(specialistPermissionRuleSchema).optional(),
  appToolPermissions: z.array(specialistPermissionRuleSchema).optional(),
  approvalPolicy: z.enum(["inherit", "auto_approve", "deny"]).optional(),
  diagnostics: z
    .array(
      z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        details: looseRecordSchema.optional(),
      }),
    )
    .optional(),
});

export const queueTaskInputSchema = z.object({
  taskId: z.string().trim().min(1),
  subtaskId: z.string().trim().min(1).optional(),
  agentId: z.string().trim().min(1).optional(),
  triggerSource: taskRunTriggerSourceSchema.default("manual"),
  metadata: looseRecordSchema.optional(),
});

export const taskSubtaskInputSchema = z.object({
  description: z.string().trim().default(""),
  agentId: z.string().trim().min(1),
});

export const createTaskFeedbackInputSchema = z.object({
  body: z.string().trim().min(1),
  mentionedAgentIds: z.array(z.string().trim().min(1)).max(1).default([]),
});

export const updateTaskSubtaskInputSchema = z.object({
  description: z.string().trim().optional(),
  agentId: z.string().trim().min(1).optional(),
});

export const taskSubtaskSchema = taskSubtaskInputSchema.extend({
  id: z.string().min(1),
  taskId: z.string().min(1),
  feedbackId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createTaskInputSchema = z.object({
  agentId: z.string().trim().min(1),
  defaultAgentId: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).nullish(),
  fallbackModels: fallbackModelsSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  todos: z.array(taskTodoInputSchema).default([]),
  status: taskStatusSchema.optional(),
  triggerSource: taskRunTriggerSourceSchema.optional(),
  scheduledAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  context: taskContextInputSchema.optional(),
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean().optional(),
});

export const updateTaskInputSchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  defaultAgentId: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).nullish(),
  fallbackModels: fallbackModelsBaseSchema.optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  todos: z.array(taskTodoInputSchema).optional(),
  status: taskStatusSchema.optional(),
  scheduledAt: nullableDateTimeSchema.optional(),
  dueAt: nullableDateTimeSchema.optional(),
  context: taskContextInputSchema.optional(),
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean().optional(),
});

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  agentId: z.string().trim().min(1).optional(),
  sourceTemplateId: z.string().trim().min(1).optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
});

export const listTaskRunsQuerySchema = z.object({
  status: taskRunStatusSchema.optional(),
  triggerSource: taskRunTriggerSourceSchema.optional(),
});

export const triggerTaskInputSchema = z.object({
  triggerSource: taskRunTriggerSourceSchema.default("manual"),
  metadata: looseRecordSchema.optional(),
});

export const cancelTaskRunInputSchema = z.object({
  reason: z.string().trim().min(1).optional(),
});

export const taskRunArtifactSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    url: z.string().trim().url().optional(),
    path: z.string().trim().min(1).optional(),
  })
  .refine((artifact) => (artifact.url ? 1 : 0) + (artifact.path ? 1 : 0) === 1, {
    message: "Exactly one of url or path is required.",
    path: ["url"],
  });

export const setTaskRunResultInputSchema = z.object({
  taskRunId: z.string().trim().min(1),
  resultText: z.string().trim().min(1),
});

export const addTaskRunArtifactInputSchema = z.object({
  taskRunId: z.string().trim().min(1),
  artifact: taskRunArtifactSchema,
});

export const taskArtifactShareLinkSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  downloadCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const taskRegisteredArtifactSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  runId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  storageKey: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  shareLinks: z.array(taskArtifactShareLinkSchema).default([]),
});

export const taskArtifactListResponseSchema = z.object({
  artifacts: z.array(taskRegisteredArtifactSchema),
});

export const createTaskArtifactShareLinkInputSchema = z.object({
  expiresInMinutes: z.number().int().min(0).max(10080).optional(),
});

export const createTaskArtifactShareLinkResponseSchema = z.object({
  shareId: z.string().min(1),
  url: z.string().url(),
  expiresAt: z.string().datetime().nullable(),
});

export const revokeTaskArtifactShareLinkResponseSchema = z.object({
  revoked: z.literal(true),
});

export const taskArtifactSharingPreferencesSchema = z.object({
  taskArtifactSignedUrlExpiresInMinutes: z.number().int().min(0).max(10080),
});

export const updateTaskArtifactSharingPreferencesInputSchema = taskArtifactSharingPreferencesSchema;

export const markTaskRunNeedsReviewInputSchema = z.object({
  taskRunId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

export const taskSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1).optional(),
  agentId: z.string().min(1),
  defaultAgentId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  fallbackModels: fallbackModelsSchema,
  title: z.string().min(1),
  description: z.string(),
  context: taskContextSchema.default({ attachments: [] }),
  todos: z.array(taskTodoSchema),
  status: taskStatusSchema,
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean(),
  archived: z.boolean(),
  latestFinalMessage: z.string().optional(),
  latestResultText: z.string().optional(),
  latestRunId: z.string().min(1).optional(),
  sourceTemplateId: z.string().min(1).optional(),
  sourceOccurrenceAt: z.string().datetime().optional(),
  scheduledAt: z.string().datetime().optional(),
  scheduledFor: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  doneAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});

export const taskListSchema = z.array(taskSchema);

export const taskTemplateSchema = z.object({
  id: z.string().min(1),
  defaultAgentId: z.string().min(1),
  model: z.string().min(1).optional(),
  fallbackModels: fallbackModelsSchema,
  title: z.string().min(1),
  description: z.string(),
  todos: z.array(taskTodoSchema),
  recurrence: recurringTaskScheduleSchema.optional(),
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean(),
  latestFinalMessage: z.string().optional(),
  latestTaskId: z.string().min(1).optional(),
  nextOccurrenceAt: z.string().datetime().optional(),
  lastGeneratedOccurrenceAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const taskTemplateListSchema = z.array(taskTemplateSchema);

export const taskTemplateRunNowInputSchema = z.object({
  context: taskContextInputSchema.optional(),
  contextAttachmentUploads: z.array(uploadTaskContextAttachmentInputSchema).default([]),
  metadata: looseRecordSchema.optional(),
});

export const createTaskTemplateInputSchema = z.object({
  defaultAgentId: z.string().trim().min(1),
  model: z.string().trim().min(1).nullish(),
  fallbackModels: fallbackModelsSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  todos: z.array(taskTodoInputSchema).default([]),
  recurrence: recurringTaskScheduleSchema.optional(),
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean().optional(),
});

export const updateTaskTemplateInputSchema = createTaskTemplateInputSchema.partial().extend({
  recurrence: recurringTaskScheduleSchema.nullish(),
  model: z.string().trim().min(1).nullish(),
  fallbackModels: fallbackModelsBaseSchema.optional(),
});

export const createTaskRunInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1),
  subtaskId: z.string().trim().min(1).optional(),
  agentId: z.string().trim().min(1),
  model: z.string().trim().min(1).optional(),
  fallbackModels: fallbackModelsSchema,
  retryOfRunId: z.string().trim().min(1).optional(),
  status: taskRunStatusSchema.default("queued"),
  triggerSource: taskRunTriggerSourceSchema,
  outcome: taskRunOutcomeSchema.optional(),
  opencodeSessionId: z.string().trim().min(1).optional(),
  context: looseRecordSchema.optional(),
  triggerMetadata: looseRecordSchema.optional(),
  renderedPrompt: z.string().default(""),
  renderedContext: looseRecordSchema.optional(),
  effectivePermissions: taskPermissionProfileSchema.optional(),
  finalMessage: z.string().optional(),
  resultText: z.string().optional(),
  artifacts: z.array(taskRunArtifactSchema).default([]),
  needsHumanReview: z.boolean().default(false),
  humanReviewReason: z.string().optional(),
  result: looseRecordSchema.optional(),
  errorMessage: z.string().optional(),
  errorDetails: looseRecordSchema.optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  cancellationReason: z.string().optional(),
});

export const updateTaskRunInputSchema = z.object({
  status: taskRunStatusSchema.optional(),
  subtaskId: z.string().trim().min(1).optional(),
  outcome: taskRunOutcomeSchema.optional(),
  opencodeSessionId: z.string().trim().min(1).optional(),
  fallbackModels: fallbackModelsBaseSchema.optional(),
  retryOfRunId: z.string().trim().min(1).optional(),
  renderedPrompt: z.string().optional(),
  context: looseRecordSchema.optional(),
  triggerMetadata: looseRecordSchema.optional(),
  renderedContext: looseRecordSchema.optional(),
  effectivePermissions: taskPermissionProfileSchema.optional(),
  finalMessage: z.string().optional(),
  resultText: z.string().optional(),
  artifacts: z.array(taskRunArtifactSchema).optional(),
  needsHumanReview: z.boolean().optional(),
  humanReviewReason: z.string().optional(),
  result: looseRecordSchema.optional(),
  errorMessage: z.string().optional(),
  errorDetails: looseRecordSchema.optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  cancellationReason: z.string().optional(),
});

export const taskRunSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  subtaskId: z.string().min(1).optional(),
  agentId: z.string().min(1),
  model: z.string().min(1).optional(),
  opencodeSessionId: z.string().min(1).optional(),
  fallbackModels: fallbackModelsSchema,
  retryOfRunId: z.string().min(1).optional(),
  status: taskRunStatusSchema,
  runtimeState: taskRunRuntimeStateSchema.optional(),
  triggerSource: taskRunTriggerSourceSchema,
  outcome: taskRunOutcomeSchema.optional(),
  renderedPrompt: z.string(),
  context: looseRecordSchema.optional(),
  triggerMetadata: looseRecordSchema.optional(),
  renderedContext: looseRecordSchema.optional(),
  effectivePermissions: taskPermissionProfileSchema.optional(),
  finalMessage: z.string().optional(),
  resultText: z.string().optional(),
  artifacts: z.array(taskRunArtifactSchema),
  needsHumanReview: z.boolean(),
  humanReviewReason: z.string().optional(),
  result: looseRecordSchema.optional(),
  errorMessage: z.string().optional(),
  errorDetails: looseRecordSchema.optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional(),
  cancellationReason: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const taskRunListSchema = z.array(taskRunSchema);

export const taskSubtaskRunReplySchema = z.object({
  run: taskRunSchema,
  status: taskSubtaskDerivedStatusSchema,
});

export const taskSubtaskDetailSchema = taskSubtaskSchema.extend({
  status: taskSubtaskDerivedStatusSchema,
  latestRun: taskRunSchema.optional(),
  replies: z.array(taskSubtaskRunReplySchema),
});

export const taskFeedbackThreadSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  body: z.string().min(1),
  targetAgentIds: z.array(z.string().min(1)),
  subtasks: z.array(taskSubtaskDetailSchema),
  createdAt: z.string().datetime(),
});

export const taskSubtaskProgressItemSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  status: taskSubtaskDerivedStatusSchema,
});

export const taskSubtaskProgressSchema = z.object({
  taskId: z.string().min(1),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
  subtasks: z.array(taskSubtaskProgressItemSchema).default([]),
});

export const taskQueuePreviewInputSchema = queueTaskInputSchema.omit({ taskId: true });

export const taskQueuePreviewSchema = z.object({
  taskId: z.string().min(1),
  subtask: taskSubtaskSchema.optional(),
  feedback: taskFeedbackThreadSchema.optional(),
  runAgentId: z.string().min(1),
  renderedPrompt: z.string(),
  renderedContext: looseRecordSchema,
});

export const taskSubtaskListSchema = z.array(taskSubtaskSchema);
export const taskFeedbackThreadListSchema = z.array(taskFeedbackThreadSchema);
export const taskSubtaskProgressListSchema = z.array(taskSubtaskProgressSchema);

export const activeTaskRunListSchema = taskRunListSchema;

export const uploadTaskContextAttachmentResponseSchema = z.object({
  attachment: taskContextAttachmentSchema,
  context: taskContextSchema,
});

export const taskSchedulerStateSchema = z.object({
  taskId: z.string().min(1),
  nextRunAt: z.string().datetime().optional(),
  lastScheduledAt: z.string().datetime().optional(),
  lastError: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const taskSchedulerStateListSchema = z.array(taskSchedulerStateSchema);

export const taskRunSessionDiagnosticSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: looseRecordSchema.optional(),
});

export const taskRunSessionInspectionSchema = z.object({
  run: taskRunSchema,
  conversation: conversationDetailSchema.optional(),
  diagnostics: z.array(taskRunSessionDiagnosticSchema),
  canOpenInChat: z.boolean(),
});

export type CreateTaskInput = z.input<typeof createTaskInputSchema>;
export type CreateTaskTemplateInput = z.input<typeof createTaskTemplateInputSchema>;
export type UpdateTaskTemplateInput = z.input<typeof updateTaskTemplateInputSchema>;
export type TaskTemplateRunNowInput = z.input<typeof taskTemplateRunNowInputSchema>;
export type CreateTaskRunInput = z.input<typeof createTaskRunInputSchema>;
export type AddTaskRunArtifactInput = z.input<typeof addTaskRunArtifactInputSchema>;
export type CreateTaskArtifactShareLinkInput = z.input<
  typeof createTaskArtifactShareLinkInputSchema
>;
export type CreateTaskArtifactShareLinkResponse = z.infer<
  typeof createTaskArtifactShareLinkResponseSchema
>;
export type CancelTaskRunInput = z.input<typeof cancelTaskRunInputSchema>;
export type QueueTaskInput = z.input<typeof queueTaskInputSchema>;
export type ListTaskRunsQuery = z.infer<typeof listTaskRunsQuerySchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type BoardTaskStatus = z.infer<typeof boardTaskStatusSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskArtifactListResponse = z.infer<typeof taskArtifactListResponseSchema>;
export type TaskArtifactShareLink = z.infer<typeof taskArtifactShareLinkSchema>;
export type TaskArtifactSharingPreferences = z.infer<typeof taskArtifactSharingPreferencesSchema>;
export type TaskContext = z.infer<typeof taskContextSchema>;
export type TaskContextAttachment = z.infer<typeof taskContextAttachmentSchema>;
export type AppendTaskContextInput = z.input<typeof appendTaskContextInputSchema>;
export type CreateTaskFeedbackInput = z.input<typeof createTaskFeedbackInputSchema>;
export type TaskFeedbackThread = z.infer<typeof taskFeedbackThreadSchema>;
export type TaskTemplate = z.infer<typeof taskTemplateSchema>;
export type TaskPermissionProfile = z.infer<typeof taskPermissionProfileSchema>;
export type TaskRunArtifact = z.infer<typeof taskRunArtifactSchema>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type TaskRunOutcome = z.infer<typeof taskRunOutcomeSchema>;
export type TaskQueuePreview = z.infer<typeof taskQueuePreviewSchema>;
export type TaskRegisteredArtifact = z.infer<typeof taskRegisteredArtifactSchema>;
export type TaskRunSessionDiagnostic = z.infer<typeof taskRunSessionDiagnosticSchema>;
export type TaskRunSessionInspection = z.infer<typeof taskRunSessionInspectionSchema>;
export type TaskRunRuntimeState = z.infer<typeof taskRunRuntimeStateSchema>;
export type TaskRunStatus = z.infer<typeof taskRunStatusSchema>;
export type TaskRunTriggerSource = z.infer<typeof taskRunTriggerSourceSchema>;
export type TaskSchedulerState = z.infer<typeof taskSchedulerStateSchema>;
export type TaskSchedule = z.infer<typeof taskScheduleSchema>;
export type TaskSubtask = z.infer<typeof taskSubtaskSchema>;
export type TaskSubtaskDetail = z.infer<typeof taskSubtaskDetailSchema>;
export type TaskSubtaskDerivedStatus = z.infer<typeof taskSubtaskDerivedStatusSchema>;
export type TaskSubtaskProgress = z.infer<typeof taskSubtaskProgressSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskTodo = z.infer<typeof taskTodoSchema>;
export type TaskRepeatRule = z.infer<typeof taskRepeatRuleSchema>;
export type TriggerTaskInput = z.input<typeof triggerTaskInputSchema>;
export type UpdateTaskContextInput = z.input<typeof updateTaskContextInputSchema>;
export type UpdateTaskArtifactSharingPreferencesInput = z.input<
  typeof updateTaskArtifactSharingPreferencesInputSchema
>;
export type UpdateTaskInput = z.input<typeof updateTaskInputSchema>;
export type UpdateTaskRunInput = z.input<typeof updateTaskRunInputSchema>;
export type UpdateTaskSubtaskInput = z.input<typeof updateTaskSubtaskInputSchema>;
export type UploadTaskContextAttachmentInput = z.input<
  typeof uploadTaskContextAttachmentInputSchema
>;
export type UploadTaskContextAttachmentResponse = z.infer<
  typeof uploadTaskContextAttachmentResponseSchema
>;
export type MarkTaskRunNeedsReviewInput = z.input<typeof markTaskRunNeedsReviewInputSchema>;
export type SetTaskRunResultInput = z.input<typeof setTaskRunResultInputSchema>;
export { permissionActionSchema };
