import {
  cancelTaskRunInputSchema,
  MAX_FALLBACK_MODELS,
  queueTaskInputSchema,
  taskContextInputSchema,
  taskContextSchema,
  taskQueuePreviewSchema,
  uploadTaskContextAttachmentInputSchema,
  type CancelTaskRunInput,
  type QueueTaskInput,
  type TaskContext,
  type Task,
  type TaskQueuePreview,
  type TaskRun,
  type TaskSubtask,
} from "@cc/shared/schemas";
import type { Logger } from "pino";
import { z } from "zod";

import { createId } from "../db/ids.js";
import type { AppDb } from "../db/client.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import { TaskRunPromptError, type ConversationService } from "./conversation-service.js";
import type { TaskContextAttachmentService } from "./task-context-attachment-service.js";
import type { SessionArchiveService } from "./session-archive-service.js";
import type { SessionArchiveSettingsService } from "./session-archive-settings-service.js";
import { createTaskRunContextService } from "./task-run-context-service.js";
import {
  buildOpenCodeSessionPermissions,
  type TaskPermissionService,
} from "./task-permission-service.js";
import type { TaskService } from "./task-service.js";

export type TaskExecutionService = ReturnType<typeof createTaskExecutionService>;
type QueueTaskExecutionInput = Partial<Omit<QueueTaskInput, "taskId">> & {
  model?: string;
  fallbackModels?: string[];
  retryOfRunId?: string;
  context?: TaskContext;
  contextAttachmentUploads?: z.infer<typeof uploadTaskContextAttachmentInputSchema>[];
};
const fallbackModelsOverrideSchema = z.array(z.string().trim().min(1)).max(MAX_FALLBACK_MODELS);
const queueTaskExecutionInputSchema = queueTaskInputSchema.extend({
  model: z.string().trim().min(1).optional(),
  fallbackModels: fallbackModelsOverrideSchema.optional(),
  retryOfRunId: z.string().trim().min(1).optional(),
  context: taskContextInputSchema.optional(),
  contextAttachmentUploads: z.array(uploadTaskContextAttachmentInputSchema).default([]),
});
type ParsedQueueTaskExecutionInput = z.infer<typeof queueTaskExecutionInputSchema>;
type QueueSingleRunInput = Pick<
  ParsedQueueTaskExecutionInput,
  | "agentId"
  | "fallbackModels"
  | "metadata"
  | "model"
  | "retryOfRunId"
  | "subtaskId"
  | "triggerSource"
>;

export function createTaskExecutionService(options: {
  db?: AppDb;
  taskService: TaskService;
  conversationService?: ConversationService;
  taskContextAttachmentService?: TaskContextAttachmentService;
  taskPermissionService?: TaskPermissionService;
  archiveService?: SessionArchiveService;
  archiveSettingsService?: SessionArchiveSettingsService;
  onRunTerminal?: (run: TaskRun) => void | Promise<void>;
  logger?: Logger;
}) {
  const taskRunContextService = createTaskRunContextService({ db: options.db });

  return {
    async trigger(taskId: string, input: QueueTaskExecutionInput = {}): Promise<TaskRun> {
      return queueTask(taskId, input);
    },

    async queue(taskId: string, input: QueueTaskExecutionInput = {}): Promise<TaskRun> {
      return queueTask(taskId, input);
    },

    async preview(taskId: string, input: QueueTaskExecutionInput = {}): Promise<TaskQueuePreview> {
      return previewTask(taskId, input);
    },

    async runQueuedTask(runId: string): Promise<TaskRun> {
      return runQueuedTask(runId);
    },

    async cancel(runId: string, input: CancelTaskRunInput = {}): Promise<TaskRun> {
      const parsed = cancelTaskRunInputSchema.parse(input);
      const run = await findRun(runId);

      if (!["queued", "running"].includes(run.status)) {
        throw new BadRequestError("Only queued or running task runs can be cancelled.");
      }

      const cancelled = await options.taskService.setRunStatus(run.id, "cancelled", {
        cancelledAt: new Date().toISOString(),
        cancellationReason: parsed.reason ?? "Cancelled by user.",
      });

      if (!cancelled) {
        throw new NotFoundError("Task run not found.");
      }

      notifyRunTerminal(cancelled);
      scheduleAgentDrain(cancelled.agentId);
      return cancelled;
    },

    async listActiveRuns(): Promise<TaskRun[]> {
      return options.taskService.listActiveRuns();
    },
  };

  async function queueTask(taskId: string, input: QueueTaskExecutionInput = {}): Promise<TaskRun> {
    const parsed = queueTaskExecutionInputSchema.parse({ taskId, ...input });
    const triggerContext = parsed.context ? taskContextSchema.parse(parsed.context) : undefined;
    const target = await requireRunnableTask(taskId, parsed.triggerSource);
    const task = await resolveExecutableTask(target, { ...parsed, context: triggerContext });

    if (!parsed.subtaskId) {
      const pending = await listRunnableSubtasks(task.id);

      if (pending.runnable.length > 0) {
        return queueNextSubtaskRun(task, parsed, triggerContext, pending.runnable);
      }

      if (pending.hasActive) {
        throw new BadRequestError("Task already has active feedback runs.");
      }
    }

    const targetSubtask = parsed.subtaskId
      ? await findSubtask(task.id, parsed.subtaskId)
      : undefined;
    return queueSingleRun(task, parsed, triggerContext, createId(), targetSubtask);
  }

  async function previewTask(
    taskId: string,
    input: QueueTaskExecutionInput = {},
  ): Promise<TaskQueuePreview> {
    const prepared = await prepareRun(taskId, input, "preview");
    const feedback = prepared.subtaskId
      ? (await options.taskService.listFeedback(prepared.task.id)).find((thread) =>
          thread.subtasks.some((subtask) => subtask.id === prepared.subtaskId),
        )
      : undefined;

    return taskQueuePreviewSchema.parse({
      taskId: prepared.task.id,
      subtask: prepared.targetSubtask,
      feedback,
      runAgentId: prepared.runAgentId,
      renderedPrompt: prepared.renderedPrompt,
      renderedContext: prepared.renderedContext,
    });
  }

  async function prepareRun(
    taskId: string,
    input: QueueTaskExecutionInput,
    runId: string,
  ): Promise<{
    parsed: z.infer<typeof queueTaskExecutionInputSchema>;
    task: Task;
    triggerContext?: TaskContext;
    targetSubtask?: TaskSubtask;
    subtaskId?: string;
    runAgentId: string;
    renderedContext: Record<string, unknown>;
    renderedPrompt: string;
  }> {
    const parsed = queueTaskExecutionInputSchema.parse({ taskId, ...input });
    const triggerContext = parsed.context ? taskContextSchema.parse(parsed.context) : undefined;
    const target = await requireRunnableTask(taskId, parsed.triggerSource);
    const task = await resolveExecutableTask(target, { ...parsed, context: triggerContext });
    const targetSubtask = parsed.subtaskId
      ? await findSubtask(task.id, parsed.subtaskId)
      : (await listRunnableSubtasks(task.id)).runnable[0];
    const subtaskId = parsed.subtaskId ?? targetSubtask?.id;
    const runAgentId =
      targetSubtask?.agentId ?? parsed.agentId ?? task.defaultAgentId ?? task.agentId;
    const { renderedContext, renderedPrompt } = await taskRunContextService.build({
      task,
      runId,
      runAgentId,
      subtaskId,
      trigger: { ...parsed, context: triggerContext },
    });

    return {
      parsed,
      task,
      triggerContext,
      targetSubtask,
      subtaskId,
      runAgentId,
      renderedContext,
      renderedPrompt,
    };
  }

  async function runQueuedTask(runId: string): Promise<TaskRun> {
    const run = await findRun(runId);

    if (run.status === "cancelled") {
      return run;
    }

    if (run.status !== "queued") {
      throw new BadRequestError("Only queued task runs can be started.");
    }

    let running = await options.taskService.tryStartQueuedRun(run.id, {
      startedAt: new Date().toISOString(),
    });

    if (!running) {
      return run;
    }

    try {
      const task = await options.taskService.get(running.taskId);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      if (options.conversationService) {
        const conversation = await options.conversationService.createTaskRunConversation({
          agentId: running.agentId,
          taskId: task.id,
          taskRunId: running.id,
          title: `Task: ${task.title}`,
          permission: running.effectivePermissions
            ? buildOpenCodeSessionPermissions(running.effectivePermissions)
            : undefined,
        });
        const sessionLinked = await options.taskService.updateRun(running.id, {
          opencodeSessionId: conversation.opencodeSessionId,
        });

        if (!sessionLinked) {
          throw new NotFoundError("Task run not found.");
        }

        running = sessionLinked;
        const attachments = options.taskContextAttachmentService
          ? await options.taskContextAttachmentService.readConversationAttachments(task.context)
          : [];
        const synced = await options.conversationService.sendTaskRunPrompt(conversation.id, {
          text: running.renderedPrompt,
          attachments,
          model: running.model,
        });
        const latest = await findRun(running.id);

        if (latest.status !== "running") {
          await handleTerminalRun(latest, { triggerContext: readRunContext(latest) });
          return latest;
        }

        const finalMessage = summarizeTaskRunConversation(synced);

        const completed = await options.taskService.setRunStatus(latest.id, "completed", {
          completedAt: new Date().toISOString(),
          finalMessage,
          result: {
            conversationId: synced.id,
            messageCount: synced.messageCount,
          },
        });

        if (!completed) {
          throw new NotFoundError("Task run not found.");
        }

        await handleTerminalRun(completed, { triggerContext: readRunContext(running) });
        return completed;
      }

      const completed = await options.taskService.setRunStatus(running.id, "completed", {
        completedAt: new Date().toISOString(),
        finalMessage: `Task '${task.title}' execution recorded. OpenCode execution is implemented in I4.3.`,
      });

      if (!completed) {
        throw new NotFoundError("Task run not found.");
      }

      await handleTerminalRun(completed, { triggerContext: readRunContext(running) });
      return completed;
    } catch (error) {
      const latest = await findRun(running.id);

      if (latest.status !== "running") {
        await handleTerminalRun(latest, { triggerContext: readRunContext(latest) });
        return latest;
      }

      const errored = await options.taskService.setRunStatus(running.id, "error", {
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "Task execution failed.",
        errorDetails: buildTaskRunErrorDetails(error, running),
      });

      if (!errored) {
        throw new NotFoundError("Task run not found.");
      }

      const fallback = buildFallbackRunInput(errored, error);
      if (fallback) {
        notifyRunTerminal(errored);
        const fallbackRun = await queueTask(errored.taskId, fallback);
        options.logger?.warn(
          {
            taskId: errored.taskId,
            previousRunId: errored.id,
            fallbackRunId: fallbackRun.id,
            model: fallback.model,
          },
          "task run errored, queued fallback model run",
        );
        return fallbackRun;
      }

      await handleTerminalRun(errored, { triggerContext: readRunContext(running) });
      return errored;
    }
  }

  function buildTaskRunErrorDetails(error: unknown, run: TaskRun): Record<string, unknown> {
    if (error instanceof TaskRunPromptError) {
      return {
        errorName: error.modelError.name,
        attemptedModel: error.attemptedModel,
        modelError: error.modelError,
        stage: "task_session_prompt",
      };
    }

    return {
      errorName: error instanceof Error ? error.name : "UnknownError",
      stage: run.opencodeSessionId ? "task_session_prompt" : "task_session_create",
    };
  }

  function buildFallbackRunInput(
    errored: TaskRun,
    error: unknown,
  ): QueueTaskExecutionInput | undefined {
    if (!(error instanceof TaskRunPromptError) || !isFallbackEligible(error)) {
      return undefined;
    }

    const selected = selectNextFallbackModel(error, errored.fallbackModels);
    if (!selected) {
      return undefined;
    }

    return {
      agentId: errored.agentId,
      subtaskId: errored.subtaskId,
      triggerSource: "system",
      model: selected.model,
      fallbackModels: selected.remaining,
      retryOfRunId: errored.id,
      context: {
        text: [
          "Previous task run ended with a model/provider error.",
          `Previous run id: ${errored.id}`,
          `Attempted model: ${error.attemptedModel}`,
          `Error: ${error.modelError.name}: ${error.modelError.message}`,
          "The previous attempt may have already changed workspace files. Inspect the current workspace state before continuing, avoid duplicating completed work, and finish the original task goal.",
        ].join("\n"),
        attachments: [],
      },
      metadata: {
        fallbackOfRunId: errored.id,
        attemptedModel: error.attemptedModel,
        errorName: error.modelError.name,
      },
    };
  }

  function selectNextFallbackModel(
    error: TaskRunPromptError,
    fallbackModels: string[],
  ): { model: string; remaining: string[] } | undefined {
    for (let index = 0; index < fallbackModels.length; index += 1) {
      const model = fallbackModels[index]!;
      if (model === error.attemptedModel) {
        continue;
      }

      if (
        error.modelError.name === "ProviderAuthError" &&
        readProvider(model) === readProvider(error.attemptedModel)
      ) {
        continue;
      }

      return {
        model,
        remaining: fallbackModels.slice(index + 1),
      };
    }

    return undefined;
  }

  function isFallbackEligible(error: TaskRunPromptError): boolean {
    if (error.modelError.name === "UnknownError") {
      return false;
    }

    if (error.modelError.name === "ProviderAuthError") {
      return true;
    }

    if (error.modelError.name !== "APIError") {
      return false;
    }

    const data = error.modelError.data ?? {};
    const statusCode = typeof data["statusCode"] === "number" ? data["statusCode"] : undefined;
    const isRetryable = data["isRetryable"] === true;
    const message = error.modelError.message.toLowerCase();

    return (
      isRetryable ||
      statusCode === 404 ||
      statusCode === 429 ||
      (statusCode !== undefined && statusCode >= 500) ||
      message.includes("overload") ||
      message.includes("rate limit") ||
      message.includes("too many requests") ||
      message.includes("model not found")
    );
  }

  function readProvider(model: string): string {
    const slash = model.indexOf("/");
    return slash > 0 ? model.slice(0, slash) : model;
  }

  async function queueNextSubtaskRun(
    task: Task,
    parsed: QueueSingleRunInput,
    triggerContext: TaskContext | undefined,
    subtasks: TaskSubtask[],
  ): Promise<TaskRun> {
    const subtask = subtasks[0];

    if (!subtask) {
      throw new BadRequestError("No feedback runs were queued.");
    }

    return queueSingleRun(task, parsed, triggerContext, createId(), subtask);
  }

  async function queueSingleRun(
    task: Task,
    parsed: QueueSingleRunInput,
    triggerContext: TaskContext | undefined,
    taskRunId: string,
    targetSubtask?: TaskSubtask,
  ): Promise<TaskRun> {
    const subtaskId = parsed.subtaskId ?? targetSubtask?.id;
    const runAgentId =
      targetSubtask?.agentId ?? parsed.agentId ?? task.defaultAgentId ?? task.agentId;
    const { renderedContext, renderedPrompt } = await taskRunContextService.build({
      task,
      runId: taskRunId,
      runAgentId,
      subtaskId,
      trigger: { ...parsed, context: triggerContext },
    });
    const effectivePermissions = await options.taskPermissionService?.compute(task);
    const run = await options.taskService.queueTask({
      id: taskRunId,
      taskId: task.id,
      subtaskId,
      agentId: runAgentId,
      triggerSource: parsed.triggerSource,
      model: parsed.model,
      fallbackModels: parsed.fallbackModels,
      retryOfRunId: parsed.retryOfRunId,
      context: triggerContext,
      metadata: parsed.metadata,
      renderedPrompt,
      renderedContext,
      effectivePermissions,
    });

    scheduleAgentDrain(run.agentId);
    return run;
  }

  async function listRunnableSubtasks(
    taskId: string,
  ): Promise<{ runnable: TaskSubtask[]; hasActive: boolean }> {
    const subtasks = await options.taskService.listSubtasks(taskId);

    if (subtasks.length === 0) {
      return { runnable: [], hasActive: false };
    }

    const runs = await options.taskService.listRuns(taskId);
    const activeSubtaskIds = new Set(
      runs
        .filter((run) => run.subtaskId && (run.status === "queued" || run.status === "running"))
        .map((run) => run.subtaskId),
    );

    const unattemptedSubtasks = subtasks.filter(
      (subtask) => !activeSubtaskIds.has(subtask.id) && !hasTerminalSubtaskRun(subtask.id, runs),
    );
    const retryableSubtasks = subtasks.filter(
      (subtask) => !activeSubtaskIds.has(subtask.id) && !hasSuccessfulSubtaskRun(subtask.id, runs),
    );

    return {
      runnable: unattemptedSubtasks.length > 0 ? unattemptedSubtasks : retryableSubtasks,
      hasActive: activeSubtaskIds.size > 0,
    };
  }

  async function handleTerminalRun(
    run: TaskRun,
    input: { triggerContext?: TaskContext },
  ): Promise<void> {
    notifyRunTerminal(run);
    const queued = await queueNextFeedbackSubtaskAfter(run, input.triggerContext);
    scheduleAgentDrain(queued?.agentId ?? run.agentId);
  }

  async function queueNextFeedbackSubtaskAfter(
    run: TaskRun,
    triggerContext: TaskContext | undefined,
  ): Promise<TaskRun | undefined> {
    if (!run.subtaskId) {
      return undefined;
    }

    const task = await options.taskService.get(run.taskId);

    if (!task) {
      return undefined;
    }

    const pending = await listRunnableSubtasks(task.id);

    if (pending.hasActive || pending.runnable.length === 0) {
      return undefined;
    }

    return queueNextSubtaskRun(
      task,
      {
        triggerSource: run.triggerSource,
        fallbackModels: run.fallbackModels,
        metadata: run.triggerMetadata,
      },
      triggerContext,
      pending.runnable,
    );
  }

  function readRunContext(run: TaskRun): TaskContext | undefined {
    return run.context ? taskContextSchema.parse(run.context) : undefined;
  }

  async function findSubtask(taskId: string, subtaskId: string): Promise<TaskSubtask> {
    const subtask = (await options.taskService.listSubtasks(taskId)).find(
      (entry) => entry.id === subtaskId,
    );

    if (!subtask) {
      throw new NotFoundError("Task subtask not found.");
    }

    return subtask;
  }

  async function requireRunnableTask(
    taskId: string,
    triggerSource: QueueTaskInput["triggerSource"],
  ): Promise<Task> {
    const task = await options.taskService.get(taskId);

    if (!task) {
      throw new NotFoundError("Task not found.");
    }

    if (task.archived) {
      throw new BadRequestError("Archived tasks cannot run.");
    }

    if (!task.enabled || task.status === "disabled" || task.status === "draft") {
      if (triggerSource === "scheduled") {
        const skipped = await options.taskService.createRun({
          taskId: task.id,
          agentId: task.agentId,
          status: "skipped",
          triggerSource,
          renderedPrompt: "",
          finalMessage: "Task was skipped because it is not enabled.",
          completedAt: new Date().toISOString(),
        });

        notifyRunTerminal(skipped);

        throw new BadRequestError("Task is not enabled and was skipped.", { runId: skipped.id });
      }

      throw new BadRequestError("Task must be enabled before it can run.");
    }

    return task;
  }

  async function resolveExecutableTask(
    task: Task,
    trigger: QueueTaskInput & {
      context?: TaskContext;
      contextAttachmentUploads?: z.infer<typeof uploadTaskContextAttachmentInputSchema>[];
    },
  ): Promise<Task> {
    if (task.templateId !== task.id) {
      return task;
    }

    const scheduledAt = readScheduledAtFromTrigger(trigger);
    let occurrence = await options.taskService.createTaskFromTemplate(task.id, {
      scheduledFor: scheduledAt,
      triggerSource: trigger.triggerSource,
      context: trigger.context,
    });

    if (!occurrence) {
      throw new NotFoundError("Task template not found.");
    }

    const occurrenceTask = occurrence;
    if (options.taskContextAttachmentService && trigger.contextAttachmentUploads?.length) {
      const attachmentService = options.taskContextAttachmentService;
      const attachments = await Promise.all(
        trigger.contextAttachmentUploads.map((upload) =>
          attachmentService.storeForTask(occurrenceTask.id, upload),
        ),
      );
      const updated = await options.taskService.updateContext(occurrenceTask.id, {
        ...occurrenceTask.context,
        attachments: [...occurrenceTask.context.attachments, ...attachments],
      });
      occurrence = updated ?? occurrenceTask;
    }

    return occurrence;
  }

  async function findRun(runId: string): Promise<TaskRun> {
    const run = await options.taskService.getRunById(runId);

    if (run) {
      return run;
    }

    throw new NotFoundError("Task run not found.");
  }

  function notifyRunTerminal(run: TaskRun): void {
    void finalizeRunArchive(run);
    void options.onRunTerminal?.(run);
  }

  async function finalizeRunArchive(run: TaskRun): Promise<void> {
    const archiveService = options.archiveService;

    if (!archiveService) {
      return;
    }

    try {
      const settings = await options.archiveSettingsService?.get();

      if (settings && !settings.sessionArchiveEnabled) {
        return;
      }

      const archivePath = archiveService.resolveTaskRunArchivePath({
        agentId: run.agentId,
        taskId: run.taskId,
        taskRunId: run.id,
      });
      // Drain any debounced appends from the run's conversation sync first.
      await archiveService.flush();
      await archiveService.setStatus({
        archivePath,
        status: "completed",
        outcome: run.outcome ?? null,
      });
      await archiveService.materialize({ archivePath, force: true });
    } catch (error) {
      options.logger?.warn(
        { err: error, runId: run.id },
        "session archive task-run finalization failed",
      );
    }
  }

  function scheduleAgentDrain(agentId: string): void {
    void drainAgentQueue(agentId).catch((error: unknown) => {
      options.logger?.error({ err: error, agentId }, "task queue drain failed");
    });
  }

  async function drainAgentQueue(agentId: string): Promise<void> {
    const running = await options.taskService.getRunningRunForAgent(agentId);

    if (running) {
      return;
    }

    const nextRun = await options.taskService.getNextQueuedRunForAgent(agentId);

    if (!nextRun) {
      return;
    }

    const started = await runQueuedTask(nextRun.id);

    if (started.status === "queued") {
      return;
    }
  }
}

function readScheduledAtFromTrigger(trigger: QueueTaskInput): string | undefined {
  const scheduledAt = trigger.metadata?.["scheduledAt"];
  return typeof scheduledAt === "string" ? scheduledAt : undefined;
}

function summarizeTaskRunConversation(conversation: {
  messages: { role: string; content: string }[];
}): string {
  const assistantMessage = [...conversation.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());

  return assistantMessage?.content.trim() ?? "Task completed without an assistant summary.";
}

function hasSuccessfulSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  return runs.some(
    (run) =>
      run.subtaskId === subtaskId &&
      run.status === "completed" &&
      run.outcome !== "failed" &&
      run.outcome !== "needs_human_review" &&
      !run.needsHumanReview,
  );
}

function hasTerminalSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  return runs.some(
    (run) => run.subtaskId === subtaskId && run.status !== "queued" && run.status !== "running",
  );
}
