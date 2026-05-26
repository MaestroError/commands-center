import {
  cancelTaskRunInputSchema,
  triggerTaskInputSchema,
  type CancelTaskRunInput,
  type Task,
  type TaskRun,
  type TriggerTaskInput,
} from "@cc/shared/schemas";
import type { Logger } from "pino";

import { createId } from "../db/ids.js";
import type { AppDb } from "../db/client.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import type { ConversationService } from "./conversation-service.js";
import { createTaskRunContextService } from "./task-run-context-service.js";
import {
  buildOpenCodeSessionPermissions,
  type TaskPermissionService,
} from "./task-permission-service.js";
import type { TaskService } from "./task-service.js";

export type TaskExecutionService = ReturnType<typeof createTaskExecutionService>;

export function createTaskExecutionService(options: {
  db?: AppDb;
  taskService: TaskService;
  conversationService?: ConversationService;
  taskPermissionService?: TaskPermissionService;
  onRunTerminal?: (run: TaskRun) => void | Promise<void>;
  logger?: Logger;
}) {
  const taskRunContextService = createTaskRunContextService({ db: options.db });

  return {
    async trigger(taskId: string, input: Partial<TriggerTaskInput> = {}): Promise<TaskRun> {
      return queueTask(taskId, input);
    },

    async queue(taskId: string, input: Partial<TriggerTaskInput> = {}): Promise<TaskRun> {
      return queueTask(taskId, input);
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
      return cancelled;
    },

    async listActiveRuns(): Promise<TaskRun[]> {
      return options.taskService.listActiveRuns();
    },
  };

  async function queueTask(
    taskId: string,
    input: Partial<TriggerTaskInput> = {},
  ): Promise<TaskRun> {
    const parsed = triggerTaskInputSchema.parse(input);
    const target = await requireRunnableTask(taskId, parsed.triggerSource);
    const task = await resolveExecutableTask(target, parsed);

    const taskRunId = createId();
    const runAgentId = task.agentId;
    const { renderedContext, renderedPrompt } = await taskRunContextService.build({
      task,
      runId: taskRunId,
      runAgentId,
      trigger: parsed,
    });
    const effectivePermissions = await options.taskPermissionService?.compute(task);
    const run = await options.taskService.queueTask({
      id: taskRunId,
      taskId: task.id,
      agentId: runAgentId,
      triggerSource: parsed.triggerSource,
      context: parsed.context,
      metadata: parsed.metadata,
      renderedPrompt,
      renderedContext,
      effectivePermissions,
    });

    void runQueuedTask(run.id).catch((error: unknown) => {
      void markDetachedRunFailed(run, error);
    });
    return run;
  }

  async function runQueuedTask(runId: string): Promise<TaskRun> {
    const run = await findRun(runId);

    if (run.status === "cancelled") {
      return run;
    }

    if (run.status !== "queued") {
      throw new BadRequestError("Only queued task runs can be started.");
    }

    let running = await options.taskService.setRunStatus(run.id, "running", {
      startedAt: new Date().toISOString(),
    });

    if (!running) {
      throw new NotFoundError("Task run not found.");
    }

    try {
      const task = await options.taskService.get(running.taskId);

      if (!task) {
        throw new NotFoundError("Task not found.");
      }

      if (options.conversationService) {
        const conversation = await options.conversationService.createTaskRunConversation({
          agentId: task.agentId,
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
        const synced = await options.conversationService.sendTaskRunPrompt(conversation.id, {
          text: running.renderedPrompt,
          attachments: [],
        });
        const finalMessage = summarizeTaskRunConversation(synced);

        const completed = await options.taskService.setRunStatus(running.id, "completed", {
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

        notifyRunTerminal(completed);
        return completed;
      }

      const completed = await options.taskService.setRunStatus(running.id, "completed", {
        completedAt: new Date().toISOString(),
        finalMessage: `Task '${task.title}' execution recorded. OpenCode execution is implemented in I4.3.`,
      });

      if (!completed) {
        throw new NotFoundError("Task run not found.");
      }

      notifyRunTerminal(completed);
      return completed;
    } catch (error) {
      const failed = await options.taskService.setRunStatus(running.id, "failed", {
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "Task execution failed.",
        errorDetails: {
          errorName: error instanceof Error ? error.name : "UnknownError",
          stage: running.opencodeSessionId ? "task_session_prompt" : "task_session_create",
        },
      });

      if (!failed) {
        throw new NotFoundError("Task run not found.");
      }

      notifyRunTerminal(failed);
      return failed;
    }
  }

  async function markDetachedRunFailed(run: TaskRun, error: unknown): Promise<void> {
    try {
      const failed = await options.taskService.setRunStatus(run.id, "failed", {
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "Task execution failed.",
        errorDetails: {
          errorName: error instanceof Error ? error.name : "UnknownError",
          stage: "task_run_start",
        },
      });

      if (failed) {
        notifyRunTerminal(failed);
        return;
      }

      options.logger?.error({ err: error, runId: run.id, taskId: run.taskId }, "task run failed");
    } catch (failureUpdateError) {
      options.logger?.error(
        { err: error, failureUpdateError, runId: run.id, taskId: run.taskId },
        "task run failed",
      );
    }
  }

  async function requireRunnableTask(
    taskId: string,
    triggerSource: TriggerTaskInput["triggerSource"],
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

  async function resolveExecutableTask(task: Task, trigger: TriggerTaskInput): Promise<Task> {
    if (task.templateId !== task.id) {
      return task;
    }

    const scheduledAt = readScheduledAtFromTrigger(trigger);
    const occurrence = await options.taskService.createTaskFromTemplate(task.id, {
      scheduledFor: scheduledAt,
      triggerSource: trigger.triggerSource,
    });

    if (!occurrence) {
      throw new NotFoundError("Task template not found.");
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
    void options.onRunTerminal?.(run);
  }
}

function readScheduledAtFromTrigger(trigger: TriggerTaskInput): string | undefined {
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
