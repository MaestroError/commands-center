import type {
  Task,
  TaskContext,
  TaskRun,
  UploadTaskContextAttachmentInput,
} from "@cc/shared/schemas";

import type { TaskContextAttachmentService } from "./task-context-attachment-service.js";
import type { TaskExecutionService } from "./task-execution-service.js";
import type { TaskService } from "./task-service.js";

/**
 * The service instances required to create-from-template, attach context, and
 * queue a run. These are the same instances wired in `registerTaskRoutes` and
 * on `RuntimeContext` — never parallel copies.
 */
export interface TriggerTemplateRunServices {
  taskService: TaskService;
  executionService: TaskExecutionService;
  taskContextAttachmentService: TaskContextAttachmentService;
}

export interface TriggerTemplateRunInput {
  templateId: string;
  /** Tags the created task/run — `"template"` for the internal UI, `"api"` for the public API. */
  triggerSource: TaskRun["triggerSource"];
  generatedByAgentId?: string;
  context?: TaskContext;
  contextAttachmentUploads?: UploadTaskContextAttachmentInput[];
  metadata?: Record<string, unknown>;
  /** When set, the task is created with `scheduled_at` and is NOT queued — the scheduler runs it. */
  scheduledFor?: string;
}

export type TriggerTemplateRunResult =
  | { kind: "not_found" }
  | { kind: "queued"; task: Task; run: TaskRun }
  | { kind: "scheduled"; task: Task };

/**
 * Single shared "create task from template → attach context → queue" path.
 *
 * Both the internal `POST /api/tasks/templates/:id/run-now` route and the
 * public trigger endpoint call this — there is exactly one implementation of
 * triggering a template. When `scheduledFor` is set, the task is created with a
 * `scheduled_at` and left for the scheduler to pick up (no synchronous queue).
 */
export async function triggerTemplateRun(
  services: TriggerTemplateRunServices,
  input: TriggerTemplateRunInput,
): Promise<TriggerTemplateRunResult> {
  const { taskService, executionService, taskContextAttachmentService } = services;

  let task = await taskService.createTaskFromTemplate(input.templateId, {
    triggerSource: input.triggerSource,
    generatedByAgentId: input.generatedByAgentId,
    context: input.context,
    scheduledFor: input.scheduledFor,
  });

  if (!task) {
    return { kind: "not_found" };
  }

  task = await applyContextAttachments(
    { taskService, taskContextAttachmentService },
    task,
    input.contextAttachmentUploads,
  );

  if (input.scheduledFor) {
    return { kind: "scheduled", task };
  }

  const run = await executionService.queue(task.id, {
    triggerSource: input.triggerSource,
    context: input.context,
    metadata: input.metadata,
  });

  return { kind: "queued", task, run };
}

/**
 * Store base64 context-attachment uploads against an existing task and fold them
 * into its context. The single attachment code path shared by template triggers
 * (this file) and direct public task creation. No-op when there are no uploads.
 */
export async function applyContextAttachments(
  services: Pick<TriggerTemplateRunServices, "taskService" | "taskContextAttachmentService">,
  task: Task,
  uploads: UploadTaskContextAttachmentInput[] | undefined,
): Promise<Task> {
  if (!uploads || uploads.length === 0) {
    return task;
  }

  const stored = await Promise.all(
    uploads.map((upload) => services.taskContextAttachmentService.storeForTask(task.id, upload)),
  );

  return (
    (await services.taskService.updateContext(task.id, {
      ...task.context,
      attachments: [...task.context.attachments, ...stored],
    })) ?? task
  );
}
