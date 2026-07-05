import type {
  CreateTaskRunInput,
  ListTaskRunsQuery,
  ListTasksQuery,
  Task,
  TaskContext,
  TaskFeedbackThread,
  TaskRun,
  TaskSubtask,
  TaskTemplate,
  UpdateTaskRunInput,
  UpdateTaskTemplateInput,
} from "@cc/shared/schemas";

import type { AppDb } from "../db/client.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import { createArtifactService } from "./artifact-service.js";
import { createTaskServiceContext } from "./task-service/context.js";
import { createTaskReadOps } from "./task-service/read-ops.js";
import { createTaskCrudOps } from "./task-service/crud-ops.js";
import { createTaskTemplateOps } from "./task-service/template-ops.js";
import { createTaskFeedbackSubtaskOps } from "./task-service/feedback-subtask-ops.js";
import { createTaskRunOps } from "./task-service/run-ops.js";

export { taskTemplateReconciler } from "./task-service/template-files.js";

// The subset of the service the operation modules call back into (via the
// shared `service` reference) for cross-aggregate work. Declaring it as a
// standalone interface keeps `TaskService` — which is derived from the modules'
// return types — from circularly referencing itself.
export interface TaskServiceRef {
  list(query?: Partial<ListTasksQuery>): Promise<Task[]>;
  get(id: string, getOptions?: { includeArchived?: boolean }): Promise<Task | undefined>;
  listSubtasks(taskId: string): Promise<TaskSubtask[]>;
  listFeedback(taskId: string): Promise<TaskFeedbackThread[]>;
  listRuns(taskId: string, query?: Partial<ListTaskRunsQuery>): Promise<TaskRun[]>;
  getRunById(runId: string): Promise<TaskRun | undefined>;
  getActiveRunForTask(taskId: string, subtaskId?: string): Promise<TaskRun | undefined>;
  getRunningRunForAgent(agentId: string): Promise<TaskRun | undefined>;
  create(input: unknown): Promise<Task>;
  updateContext(id: string, input: TaskContext): Promise<Task | undefined>;
  restore(id: string): Promise<Task | undefined>;
  archive(id: string): Promise<Task | undefined>;
  updateTemplate(id: string, input: UpdateTaskTemplateInput): Promise<TaskTemplate | undefined>;
  updateRun(id: string, input: UpdateTaskRunInput): Promise<TaskRun | undefined>;
  createRun(input: CreateTaskRunInput): Promise<TaskRun>;
}

// The full service surface is the union of the per-aggregate operation modules.
export type TaskService = ReturnType<typeof createTaskReadOps> &
  ReturnType<typeof createTaskCrudOps> &
  ReturnType<typeof createTaskTemplateOps> &
  ReturnType<typeof createTaskFeedbackSubtaskOps> &
  ReturnType<typeof createTaskRunOps>;

export function createTaskService(options: { db: AppDb; config: RuntimeConfig }) {
  const artifactService = createArtifactService({ db: options.db, config: options.config });
  const ctx = createTaskServiceContext(options, artifactService);
  const service = {} as TaskService;
  Object.assign(
    service,
    createTaskReadOps(ctx, service),
    createTaskCrudOps(ctx, service),
    createTaskTemplateOps(ctx, service),
    createTaskFeedbackSubtaskOps(ctx, service),
    createTaskRunOps(ctx, service),
  );
  return service;
}
