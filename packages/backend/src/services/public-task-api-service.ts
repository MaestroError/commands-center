import type {
  Specialist,
  ListPublicTasksQuery,
  PublicSpecialistSummary,
  PublicCreateTaskBody,
  PublicFeedbackThread,
  PublicScheduleTaskBody,
  PublicTask,
  PublicTaskRun,
  PublicTaskRunStatus,
  PublicTaskTemplateSummary,
  PublicTriggerTaskBody,
  PublicTriggerTaskResponse,
  PublicTriggerTemplateBody,
  PublicTriggerTemplateResponse,
  Task,
  TaskFeedbackThread,
  TaskRun,
  TaskSubtaskDetail,
} from "@cc/shared/schemas";

import type { SpecialistService } from "./specialist-service.js";
import type { TaskContextAttachmentService } from "./task-context-attachment-service.js";
import type { TaskExecutionService } from "./task-execution-service.js";
import type { TaskService } from "./task-service.js";
import { applyContextAttachments, triggerTemplateRun } from "./trigger-template-run.js";

export type PublicTaskApiService = ReturnType<typeof createPublicTaskApiService>;

export type TriggerTemplateOutcome =
  | { kind: "not_found" }
  | { kind: "ok"; response: PublicTriggerTemplateResponse };

/**
 * Thin adapter over the existing task services. It exposes only public
 * operations and returns only public projections — never internal agent IDs,
 * permission profiles, rendered prompts, artifacts, or storage paths. It
 * contains no new task-execution logic: every action routes through a service
 * the internal UI already uses (triggering goes through the shared
 * {@link triggerTemplateRun} helper).
 */
export function createPublicTaskApiService(deps: {
  taskService: TaskService;
  executionService: TaskExecutionService;
  taskContextAttachmentService: TaskContextAttachmentService;
  agentService: SpecialistService;
}) {
  const { taskService, executionService, taskContextAttachmentService, agentService } = deps;

  return {
    async listTriggerableTemplates(): Promise<PublicTaskTemplateSummary[]> {
      const templates = await taskService.listTemplates();

      return templates
        .filter((template) => template.enabled)
        .map((template) => ({
          id: template.id,
          title: template.title,
          description: template.description,
        }));
    },

    async triggerTemplate(
      templateId: string,
      body: PublicTriggerTemplateBody,
    ): Promise<TriggerTemplateOutcome> {
      // Disabled templates are hidden from the public listing, so a direct
      // trigger by id is treated as not found rather than running them.
      const template = await taskService.getTemplate(templateId);

      if (!template || !template.enabled) {
        return { kind: "not_found" };
      }

      const text = body.context?.text;
      const result = await triggerTemplateRun(
        { taskService, executionService, taskContextAttachmentService },
        {
          templateId,
          triggerSource: "api",
          context: text ? { text, attachments: [] } : undefined,
          contextAttachmentUploads: body.attachments,
          metadata: body.metadata,
          scheduledFor: body.schedule?.runAt,
        },
      );

      if (result.kind === "not_found") {
        return { kind: "not_found" };
      }

      if (result.kind === "scheduled") {
        return {
          kind: "ok",
          response: {
            taskId: result.task.id,
            runId: null,
            status: "scheduled",
            scheduledFor: body.schedule?.runAt ?? null,
          },
        };
      }

      return {
        kind: "ok",
        response: {
          taskId: result.task.id,
          runId: result.run.id,
          status: "queued",
          scheduledFor: null,
        },
      };
    },

    async getRunStatus(runId: string): Promise<PublicTaskRunStatus | undefined> {
      const run = await taskService.getRunById(runId);

      if (!run) {
        return undefined;
      }

      return {
        runId: run.id,
        taskId: run.taskId,
        status: run.status,
        outcome: run.outcome ?? null,
        finalMessage: run.finalMessage ?? null,
        startedAt: run.startedAt ?? null,
        completedAt: run.completedAt ?? null,
      };
    },

    // --- Epic 09: direct task operations -----------------------------------

    async createTask(body: PublicCreateTaskBody): Promise<PublicTask> {
      const task = await taskService.create({
        agentId: body.specialistId,
        title: body.title,
        description: body.description,
        todos: body.todos,
        triggerSource: "api",
        scheduledAt: body.scheduledAt,
        dueAt: body.dueAt,
        context: body.context?.text ? { text: body.context.text, attachments: [] } : undefined,
      });

      const withAttachments = await applyContextAttachments(
        { taskService, taskContextAttachmentService },
        task,
        body.attachments,
      );

      return toPublicTask(withAttachments);
    },

    async triggerTask(
      taskId: string,
      body: PublicTriggerTaskBody,
    ): Promise<PublicTriggerTaskResponse | undefined> {
      const task = await taskService.get(taskId);

      if (!task) {
        return undefined;
      }

      const run = await executionService.queue(taskId, {
        triggerSource: "api",
        metadata: body.metadata,
      });

      return { taskId: run.taskId, runId: run.id, status: run.status };
    },

    async scheduleTask(
      taskId: string,
      body: PublicScheduleTaskBody,
    ): Promise<PublicTask | undefined> {
      const updated = await taskService.update(taskId, { scheduledAt: body.runAt });
      return updated ? toPublicTask(updated) : undefined;
    },

    async listTasks(query: ListPublicTasksQuery): Promise<PublicTask[]> {
      const tasks = await taskService.list({
        status: query.status,
        agentId: query.specialistId,
        sourceTemplateId: query.templateId,
        includeArchived: false,
      });

      return tasks.map(toPublicTask);
    },

    async getTask(
      taskId: string,
      expand: Set<string> = new Set(),
    ): Promise<PublicTask | undefined> {
      const task = await taskService.get(taskId);

      if (!task) {
        return undefined;
      }

      const projection = toPublicTask(task);

      if (expand.has("runs")) {
        const runs = await taskService.listRuns(taskId);
        projection.runs = runs.map(toPublicRun);
      }

      if (expand.has("feedback")) {
        const feedback = await taskService.listFeedback(taskId);
        projection.feedback = feedback.map(toPublicFeedbackThread);
      }

      return projection;
    },

    async listRuns(taskId: string): Promise<PublicTaskRun[] | undefined> {
      const task = await taskService.get(taskId);

      if (!task) {
        return undefined;
      }

      const runs = await taskService.listRuns(taskId);
      return runs.map(toPublicRun);
    },

    async getRun(taskId: string, runId: string): Promise<PublicTaskRun | undefined> {
      const run = await taskService.getRun(taskId, runId);
      return run ? toPublicRun(run) : undefined;
    },

    async listFeedback(taskId: string): Promise<PublicFeedbackThread[] | undefined> {
      const task = await taskService.get(taskId);

      if (!task) {
        return undefined;
      }

      const feedback = await taskService.listFeedback(taskId);
      return feedback.map(toPublicFeedbackThread);
    },

    async listAgents(): Promise<PublicSpecialistSummary[]> {
      const agents = await agentService.list();
      return agents.map((agent: Specialist) => ({
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
      }));
    },
  };
}

function toPublicTask(task: Task): PublicTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    specialistId: task.agentId,
    todos: task.todos.map((todo) => ({ id: todo.id, content: todo.content, status: todo.status })),
    scheduledAt: task.scheduledAt ?? null,
    dueAt: task.dueAt ?? null,
    doneAt: task.doneAt ?? null,
    latestRunId: task.latestRunId ?? null,
    latestFinalMessage: task.latestFinalMessage ?? null,
    sourceTemplateId: task.sourceTemplateId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function toPublicRun(run: TaskRun): PublicTaskRun {
  return {
    id: run.id,
    taskId: run.taskId,
    status: run.status,
    triggerSource: run.triggerSource,
    outcome: run.outcome ?? null,
    finalMessage: run.finalMessage ?? null,
    resultText: run.resultText ?? null,
    needsHumanReview: run.needsHumanReview,
    humanReviewReason: run.humanReviewReason ?? null,
    errorMessage: run.errorMessage ?? null,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    cancelledAt: run.cancelledAt ?? null,
    createdAt: run.createdAt,
  };
}

function toPublicFeedbackThread(thread: TaskFeedbackThread): PublicFeedbackThread {
  return {
    id: thread.id,
    taskId: thread.taskId,
    body: thread.body,
    createdAt: thread.createdAt,
    subtasks: thread.subtasks.map((subtask: TaskSubtaskDetail) => ({
      id: subtask.id,
      description: subtask.description,
      status: subtask.status,
      latestRun: subtask.latestRun ? toPublicRun(subtask.latestRun) : null,
      replies: subtask.replies.map((reply) => toPublicRun(reply.run)),
    })),
  };
}
