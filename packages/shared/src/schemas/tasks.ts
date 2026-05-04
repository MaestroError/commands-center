import { z } from "zod";

import {
  agentAppMcpServerSchema,
  agentMcpServerSchema,
  agentPermissionRuleSchema,
  permissionActionSchema,
} from "./agents.js";
import { conversationDetailSchema } from "./conversations.js";

const looseRecordSchema = z.record(z.string(), z.unknown());

export const taskStatusSchema = z.enum([
  "draft",
  "enabled",
  "disabled",
  "archived",
  "running",
  "in_progress",
  "failed",
  "completed",
]);

export const taskRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "skipped",
]);

export const taskTriggerModeSchema = z.enum(["manual", "scheduled_once", "recurring"]);

export const taskRunTriggerSourceSchema = z.enum(["manual", "scheduled", "system"]);

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

export const manualTaskScheduleSchema = z.object({
  mode: z.literal("manual"),
});

export const scheduledOnceTaskScheduleSchema = z.object({
  mode: z.literal("scheduled_once"),
  runAt: z.string().datetime(),
  timezone: z.string().trim().min(1).optional(),
});

export const recurringTaskScheduleSchema = z.object({
  mode: z.literal("recurring"),
  cronExpression: z.string().trim().min(1),
  timezone: z.string().trim().min(1).optional(),
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
});

export const createTaskInputSchema = z.object({
  agentId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  context: z.string().trim().default(""),
  todos: z.array(taskTodoInputSchema).default([]),
  status: taskStatusSchema.optional(),
  triggerMode: taskTriggerModeSchema.default("manual"),
  schedule: taskScheduleSchema.optional(),
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean().optional(),
});

export const updateTaskInputSchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  context: z.string().trim().optional(),
  todos: z.array(taskTodoInputSchema).optional(),
  status: taskStatusSchema.optional(),
  triggerMode: taskTriggerModeSchema.optional(),
  schedule: taskScheduleSchema.optional(),
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

export const taskSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  context: z.string(),
  todos: z.array(taskTodoSchema),
  status: taskStatusSchema,
  triggerMode: taskTriggerModeSchema,
  schedule: taskScheduleSchema,
  permissionProfile: taskPermissionProfileSchema.optional(),
  enabled: z.boolean(),
  archived: z.boolean(),
  latestResultSummary: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});

export const taskListSchema = z.array(taskSchema);

export const createTaskRunInputSchema = z.object({
  taskId: z.string().trim().min(1),
  agentId: z.string().trim().min(1),
  status: taskRunStatusSchema.default("queued"),
  triggerSource: taskRunTriggerSourceSchema,
  opencodeSessionId: z.string().trim().min(1).optional(),
  renderedPrompt: z.string().default(""),
  renderedContext: looseRecordSchema.optional(),
  effectivePermissions: taskPermissionProfileSchema.optional(),
  resultSummary: z.string().optional(),
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
  opencodeSessionId: z.string().trim().min(1).optional(),
  renderedPrompt: z.string().optional(),
  renderedContext: looseRecordSchema.optional(),
  effectivePermissions: taskPermissionProfileSchema.optional(),
  resultSummary: z.string().optional(),
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
  agentId: z.string().min(1),
  opencodeSessionId: z.string().min(1).optional(),
  status: taskRunStatusSchema,
  triggerSource: taskRunTriggerSourceSchema,
  renderedPrompt: z.string(),
  renderedContext: looseRecordSchema.optional(),
  effectivePermissions: taskPermissionProfileSchema.optional(),
  resultSummary: z.string().optional(),
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

export const activeTaskRunListSchema = taskRunListSchema;

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
export type CreateTaskRunInput = z.input<typeof createTaskRunInputSchema>;
export type CancelTaskRunInput = z.input<typeof cancelTaskRunInputSchema>;
export type ListTaskRunsQuery = z.infer<typeof listTaskRunsQuerySchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskPermissionProfile = z.infer<typeof taskPermissionProfileSchema>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type TaskRunSessionDiagnostic = z.infer<typeof taskRunSessionDiagnosticSchema>;
export type TaskRunSessionInspection = z.infer<typeof taskRunSessionInspectionSchema>;
export type TaskRunStatus = z.infer<typeof taskRunStatusSchema>;
export type TaskRunTriggerSource = z.infer<typeof taskRunTriggerSourceSchema>;
export type TaskSchedulerState = z.infer<typeof taskSchedulerStateSchema>;
export type TaskSchedule = z.infer<typeof taskScheduleSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskTodo = z.infer<typeof taskTodoSchema>;
export type TaskTriggerMode = z.infer<typeof taskTriggerModeSchema>;
export type TriggerTaskInput = z.input<typeof triggerTaskInputSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskInputSchema>;
export type UpdateTaskRunInput = z.input<typeof updateTaskRunInputSchema>;
export { permissionActionSchema };
