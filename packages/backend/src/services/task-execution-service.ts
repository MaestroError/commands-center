import {
  cancelTaskRunInputSchema,
  triggerTaskInputSchema,
  type CancelTaskRunInput,
  type Task,
  type TaskRun,
  type TriggerTaskInput,
} from "@cc/shared/schemas";

import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { ConversationService } from "./conversation-service.js";
import {
  buildOpenCodeSessionPermissions,
  type TaskPermissionService,
} from "./task-permission-service.js";
import type { TaskService } from "./task-service.js";

export type TaskExecutionService = ReturnType<typeof createTaskExecutionService>;

export function createTaskExecutionService(options: {
  taskService: TaskService;
  conversationService?: ConversationService;
  taskPermissionService?: TaskPermissionService;
}) {
  return {
    async trigger(taskId: string, input: Partial<TriggerTaskInput> = {}): Promise<TaskRun> {
      const parsed = triggerTaskInputSchema.parse(input);
      const task = await requireRunnableTask(taskId, parsed.triggerSource);
      const activeRun = await options.taskService.getActiveRunForTask(task.id);

      if (activeRun) {
        throw new ConflictError("Task already has an active run.", { runId: activeRun.id });
      }

      const renderedContext = buildRenderedContext(task, parsed);
      const effectivePermissions = await options.taskPermissionService?.compute(task);
      const run = await options.taskService.createRun({
        taskId: task.id,
        agentId: task.agentId,
        status: "queued",
        triggerSource: parsed.triggerSource,
        renderedPrompt: renderTaskRunPrompt(task, renderedContext),
        renderedContext,
        effectivePermissions,
      });

      return runQueuedTask(run.id);
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

      return cancelled;
    },

    async listActiveRuns(): Promise<TaskRun[]> {
      return options.taskService.listActiveRuns();
    },
  };

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
        const resultSummary = summarizeTaskRunConversation(synced);

        const completed = await options.taskService.setRunStatus(running.id, "completed", {
          completedAt: new Date().toISOString(),
          resultSummary,
          result: {
            conversationId: synced.id,
            messageCount: synced.messageCount,
          },
        });

        if (!completed) {
          throw new NotFoundError("Task run not found.");
        }

        return completed;
      }

      const completed = await options.taskService.setRunStatus(running.id, "completed", {
        completedAt: new Date().toISOString(),
        resultSummary: `Task '${task.title}' execution recorded. OpenCode execution is implemented in I4.3.`,
      });

      if (!completed) {
        throw new NotFoundError("Task run not found.");
      }

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

      return failed;
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
          resultSummary: "Task was skipped because it is not enabled.",
          completedAt: new Date().toISOString(),
        });

        throw new BadRequestError("Task is not enabled and was skipped.", { runId: skipped.id });
      }

      throw new BadRequestError("Task must be enabled before it can run.");
    }

    return task;
  }

  async function findRun(runId: string): Promise<TaskRun> {
    const run = await options.taskService.getRunById(runId);

    if (run) {
      return run;
    }

    throw new NotFoundError("Task run not found.");
  }
}

function buildRenderedContext(
  task: Task,
  trigger: { triggerSource: TriggerTaskInput["triggerSource"]; metadata?: Record<string, unknown> },
): Record<string, unknown> {
  return {
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description,
    assignedAgentId: task.agentId,
    triggerSource: trigger.triggerSource,
    triggerMetadata: trigger.metadata,
    schedule: task.schedule,
    todos: task.todos,
  };
}

function renderTaskRunPrompt(task: Task, renderedContext: Record<string, unknown>): string {
  return [
    `Task: ${task.title}`,
    `Assigned agent ID: ${task.agentId}`,
    task.description ? `Description: ${task.description}` : undefined,
    task.context ? `Context: ${task.context}` : undefined,
    task.todos.length > 0
      ? `Todos:\n${task.todos.map((todo) => `- [${todo.status === "completed" ? "x" : " "}] ${todo.content}`).join("\n")}`
      : undefined,
    `Trigger source: ${String(renderedContext["triggerSource"])}`,
    renderedContext["triggerMetadata"]
      ? `Trigger metadata: ${JSON.stringify(renderedContext["triggerMetadata"])}`
      : undefined,
    `Schedule: ${JSON.stringify(task.schedule)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function summarizeTaskRunConversation(conversation: {
  messages: { role: string; content: string }[];
}): string {
  const assistantMessage = [...conversation.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());

  return assistantMessage?.content.trim() ?? "Task completed without an assistant summary.";
}
