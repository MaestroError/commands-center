import { z } from "zod";

import {
  agentAppMcpServerSchema,
  agentMcpServerSchema,
  agentPermissionRuleSchema,
  permissionActionSchema,
} from "./agents.js";
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
  "cancelled",
  "skipped",
]);

export const taskTriggerModeSchema = z.enum(["manual", "scheduled_once", "recurring"]);

export const taskRunOutcomeSchema = z.enum(["success", "needs_human_review", "failed"]);

export const taskRunTriggerSourceSchema = z.enum([
  "manual",
  "scheduled",
  "api",
  "template",
  "system",
]);

export const taskCommentStatusSchema = z.enum(["open", "included", "resolved"]);

export const taskSubtaskStatusSchema = z.enum([
  "backlog",
  "queued",
  "ready_to_check",
  "review",
  "done",
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

export const taskPermissionProfileSchema = z.object({
  customTools: z.array(z.string().min(1)).optional(),
  mcpServers: z.array(agentMcpServerSchema).optional(),
  appMcpServers: z.array(agentAppMcpServerSchema).optional(),
  toolPermissions: z.array(agentPermissionRuleSchema).optional(),
  appToolPermissions: z.array(agentPermissionRuleSchema).optional(),
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

export const taskCommentInputSchema = z.object({
  body: z.string().trim().min(1),
  status: taskCommentStatusSchema.default("open"),
});

export const taskCommentSchema = taskCommentInputSchema.extend({
  id: z.string().min(1),
  taskId: z.string().min(1),
  includedInRunId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});

export const taskSubtaskInputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  defaultAgentId: z.string().trim().min(1).optional(),
  status: taskSubtaskStatusSchema.default("backlog"),
});

export const updateTaskCommentInputSchema = z.object({
  body: z.string().trim().min(1).optional(),
  status: taskCommentStatusSchema.optional(),
});

export const updateTaskSubtaskInputSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  defaultAgentId: z.string().trim().min(1).optional(),
  status: taskSubtaskStatusSchema.optional(),
});

export const taskSubtaskSchema = taskSubtaskInputSchema.extend({
  id: z.string().min(1),
  taskId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const createTaskInputSchema = z.object({
  agentId: z.string().trim().min(1),
  defaultAgentId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  todos: z.array(taskTodoInputSchema).default([]),
  status: taskStatusSchema.optional(),
  triggerMode: taskTriggerModeSchema.default("manual"),
  schedule: taskScheduleSchema.optional(),
  scheduledAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  context: taskContextInputSchema.optional(),
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean().optional(),
});

export const updateTaskInputSchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  defaultAgentId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  todos: z.array(taskTodoInputSchema).optional(),
  status: taskStatusSchema.optional(),
  triggerMode: taskTriggerModeSchema.optional(),
  schedule: taskScheduleSchema.optional(),
  scheduledAt: z.string().datetime().optional(),
  dueAt: z.string().datetime().optional(),
  context: taskContextInputSchema.optional(),
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean().optional(),
});

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  triggerMode: taskTriggerModeSchema.optional(),
  agentId: z.string().trim().min(1).optional(),
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

export const markTaskRunNeedsReviewInputSchema = z.object({
  taskRunId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

export const taskSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1).optional(),
  agentId: z.string().min(1),
  defaultAgentId: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string(),
  context: taskContextSchema.default({ attachments: [] }),
  todos: z.array(taskTodoSchema),
  status: taskStatusSchema,
  triggerMode: taskTriggerModeSchema,
  schedule: taskScheduleSchema,
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean(),
  archived: z.boolean(),
  latestFinalMessage: z.string().optional(),
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

export const taskTemplateStatusSchema = z.enum(["enabled", "disabled", "archived"]);

export const taskTemplateSchema = z.object({
  id: z.string().min(1),
  defaultAgentId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  todos: z.array(taskTodoSchema),
  status: taskTemplateStatusSchema,
  recurrence: recurringTaskScheduleSchema.optional(),
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean(),
  archived: z.boolean(),
  latestFinalMessage: z.string().optional(),
  latestTaskId: z.string().min(1).optional(),
  nextOccurrenceAt: z.string().datetime().optional(),
  lastGeneratedOccurrenceAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});

export const taskTemplateListSchema = z.array(taskTemplateSchema);

export const taskTemplateRunNowInputSchema = z.object({
  context: taskContextInputSchema.optional(),
  contextAttachmentUploads: z.array(uploadTaskContextAttachmentInputSchema).default([]),
  metadata: looseRecordSchema.optional(),
});

export const createTaskTemplateInputSchema = z.object({
  defaultAgentId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  todos: z.array(taskTodoInputSchema).default([]),
  recurrence: recurringTaskScheduleSchema.optional(),
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean().optional(),
});

export const createTaskRunInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1),
  subtaskId: z.string().trim().min(1).optional(),
  agentId: z.string().trim().min(1),
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
  opencodeSessionId: z.string().min(1).optional(),
  status: taskRunStatusSchema,
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

export const taskCommentListSchema = z.array(taskCommentSchema);

export const taskSubtaskListSchema = z.array(taskSubtaskSchema);

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
export type TaskTemplateRunNowInput = z.input<typeof taskTemplateRunNowInputSchema>;
export type CreateTaskRunInput = z.input<typeof createTaskRunInputSchema>;
export type AddTaskRunArtifactInput = z.input<typeof addTaskRunArtifactInputSchema>;
export type CancelTaskRunInput = z.input<typeof cancelTaskRunInputSchema>;
export type QueueTaskInput = z.input<typeof queueTaskInputSchema>;
export type ListTaskRunsQuery = z.infer<typeof listTaskRunsQuerySchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type BoardTaskStatus = z.infer<typeof boardTaskStatusSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskContext = z.infer<typeof taskContextSchema>;
export type TaskContextAttachment = z.infer<typeof taskContextAttachmentSchema>;
export type AppendTaskContextInput = z.input<typeof appendTaskContextInputSchema>;
export type TaskComment = z.infer<typeof taskCommentSchema>;
export type TaskCommentStatus = z.infer<typeof taskCommentStatusSchema>;
export type TaskTemplate = z.infer<typeof taskTemplateSchema>;
export type TaskTemplateStatus = z.infer<typeof taskTemplateStatusSchema>;
export type TaskPermissionProfile = z.infer<typeof taskPermissionProfileSchema>;
export type TaskRunArtifact = z.infer<typeof taskRunArtifactSchema>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type TaskRunOutcome = z.infer<typeof taskRunOutcomeSchema>;
export type TaskRunSessionDiagnostic = z.infer<typeof taskRunSessionDiagnosticSchema>;
export type TaskRunSessionInspection = z.infer<typeof taskRunSessionInspectionSchema>;
export type TaskRunStatus = z.infer<typeof taskRunStatusSchema>;
export type TaskRunTriggerSource = z.infer<typeof taskRunTriggerSourceSchema>;
export type TaskSchedulerState = z.infer<typeof taskSchedulerStateSchema>;
export type TaskSchedule = z.infer<typeof taskScheduleSchema>;
export type TaskSubtask = z.infer<typeof taskSubtaskSchema>;
export type TaskSubtaskStatus = z.infer<typeof taskSubtaskStatusSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskTodo = z.infer<typeof taskTodoSchema>;
export type TaskTriggerMode = z.infer<typeof taskTriggerModeSchema>;
export type TaskRepeatRule = z.infer<typeof taskRepeatRuleSchema>;
export type TriggerTaskInput = z.input<typeof triggerTaskInputSchema>;
export type UpdateTaskContextInput = z.input<typeof updateTaskContextInputSchema>;
export type UpdateTaskCommentInput = z.input<typeof updateTaskCommentInputSchema>;
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
