import {
  cancelTaskRunInputSchema,
  MAX_FALLBACK_MODELS,
  queueTaskInputSchema,
  taskContextInputSchema,
  taskContextSchema,
  taskQueuePreviewSchema,
  uploadTaskContextAttachmentInputSchema,
  type CancelTaskRunInput,
  type ConversationDetail,
  type ConversationMessage,
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
import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";
import {
  TaskRunPromptError,
  type ConversationService,
  type TaskRunPromptStart,
} from "./conversation-service.js";
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

type OpencodeMonitorMetadata = {
  conversationId: string;
  opencodeSessionId: string;
  attemptedModel: string;
  baselineMessageCount: number;
  promptAcceptedAt: string;
};

type TaskRunMonitorOptions = {
  autoStart?: boolean;
  initialPollMs?: number;
  maxPollMs?: number;
  idlePolls?: number;
  maxLifetimeMs?: number;
};

type TaskRunMonitorConfig = Required<TaskRunMonitorOptions>;

type TaskRunMonitorHandle = {
  runId: string;
  startedAtMs: number;
  delayMs: number;
  idleCount: number;
  lastStatus?: string;
  lastAssistantMessageId?: string;
  stopped: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

type AcceptedPromptEvidence = {
  conversation: ConversationDetail;
  reason: "monitor_metadata" | "messages" | "status";
  statusType?: string;
};

type TaskRunTransportRetryOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxElapsedMs?: number;
  jitterRatio?: number;
};

type TaskRunTransportRetryConfig = Required<TaskRunTransportRetryOptions>;

type TaskRunDeferOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
};

type TaskRunDeferConfig = Required<TaskRunDeferOptions>;

type AgentDrainDeferral = {
  delayMs: number;
  timer?: ReturnType<typeof setTimeout>;
};

type RetryStage =
  | "task_session_create"
  | "task_session_prompt"
  | "task_session_status"
  | "task_session_sync";

const DEFAULT_TASK_RUN_MONITOR_CONFIG: TaskRunMonitorConfig = {
  autoStart: true,
  initialPollMs: 2_000,
  maxPollMs: 10_000,
  idlePolls: 2,
  maxLifetimeMs: 6 * 60 * 60 * 1_000,
};

const DEFAULT_TRANSPORT_RETRY_CONFIG: TaskRunTransportRetryConfig = {
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  maxElapsedMs: 2 * 60 * 1_000,
  jitterRatio: 0.2,
};

const DEFAULT_TASK_RUN_DEFER_CONFIG: TaskRunDeferConfig = {
  initialDelayMs: 2_000,
  maxDelayMs: 30_000,
  jitterRatio: 0.2,
};

export function createTaskExecutionService(options: {
  db?: AppDb;
  taskService: TaskService;
  conversationService?: ConversationService;
  orchestrator?: Pick<OpenCodeOrchestrator, "getStatus">;
  taskContextAttachmentService?: TaskContextAttachmentService;
  taskPermissionService?: TaskPermissionService;
  archiveService?: SessionArchiveService;
  archiveSettingsService?: SessionArchiveSettingsService;
  onRunTerminal?: (run: TaskRun) => void | Promise<void>;
  logger?: Logger;
  monitor?: TaskRunMonitorOptions;
  transportRetry?: TaskRunTransportRetryOptions;
  defer?: TaskRunDeferOptions;
}) {
  const taskRunContextService = createTaskRunContextService({ db: options.db });
  const monitorConfig: TaskRunMonitorConfig = {
    ...DEFAULT_TASK_RUN_MONITOR_CONFIG,
    ...(options.monitor ?? {}),
  };
  const transportRetryConfig: TaskRunTransportRetryConfig = {
    ...DEFAULT_TRANSPORT_RETRY_CONFIG,
    ...(options.transportRetry ?? {}),
  };
  const deferConfig: TaskRunDeferConfig = {
    ...DEFAULT_TASK_RUN_DEFER_CONFIG,
    ...(options.defer ?? {}),
  };
  const monitors = new Map<string, TaskRunMonitorHandle>();
  const agentDrainDeferrals = new Map<string, AgentDrainDeferral>();

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

    startTaskRunMonitor(runId: string): void {
      startTaskRunMonitor(runId);
    },

    async resumeRunningTaskRuns(): Promise<void> {
      const runs = await options.taskService.listActiveRuns();

      for (const run of runs) {
        if (run.status !== "running") {
          continue;
        }

        if (run.opencodeSessionId) {
          await resumeRunningTaskRun(run);
          continue;
        }

        await options.taskService.updateRun(run.id, { status: "queued" });
        scheduleAgentDrain(run.agentId);
      }
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

      await abortOpenCodeTaskRun(run);
      notifyRunTerminal(cancelled);
      scheduleAgentDrain(cancelled.agentId);
      return cancelled;
    },

    async listActiveRuns(): Promise<TaskRun[]> {
      return options.taskService.listActiveRuns();
    },

    dispose(): void {
      for (const handle of monitors.values()) {
        stopTaskRunMonitor(handle);
      }

      for (const deferral of agentDrainDeferrals.values()) {
        if (deferral.timer) {
          clearTimeout(deferral.timer);
        }
      }

      monitors.clear();
      agentDrainDeferrals.clear();
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

    if (run.status === "running" && run.opencodeSessionId) {
      const existingEvidence = await readAcceptedPromptEvidence(run);

      if (existingEvidence) {
        return resumeAcceptedPromptRun(run, existingEvidence);
      }

      startTaskRunMonitor(run.id);
      options.logger?.info(
        {
          taskId: run.taskId,
          taskRunId: run.id,
          opencodeSessionId: run.opencodeSessionId,
        },
        "task run already has an OpenCode session; resumed monitor instead of starting prompt",
      );
      return run;
    }

    if (run.status !== "queued") {
      throw new BadRequestError("Only queued task runs can be started.");
    }

    if (deferQueuedRunIfOpenCodeIsUnhealthy(run)) {
      return run;
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
        const existingEvidence = await readAcceptedPromptEvidence(running);

        if (existingEvidence) {
          return resumeAcceptedPromptRun(running, existingEvidence);
        }

        const conversation = await getOrCreateTaskRunConversation(task, running);

        if (!running.opencodeSessionId) {
          const sessionLinked = await options.taskService.updateRun(running.id, {
            opencodeSessionId: conversation.opencodeSessionId,
          });

          if (!sessionLinked) {
            throw new NotFoundError("Task run not found.");
          }

          running = sessionLinked;
        }

        const attachments = options.taskContextAttachmentService
          ? await options.taskContextAttachmentService.readConversationAttachments(task.context)
          : [];
        const promptStart = await startTaskRunPromptWithRetry(running, conversation, {
          text: running.renderedPrompt,
          attachments,
          model: running.model,
        });

        if (promptStart.type === "accepted") {
          return resumeAcceptedPromptRun(running, promptStart.evidence);
        }

        const accepted = await options.taskService.updateRun(running.id, {
          triggerMetadata: mergeOpencodeMonitorMetadata(running.triggerMetadata, {
            conversationId: promptStart.promptStart.conversationId,
            opencodeSessionId: promptStart.promptStart.opencodeSessionId,
            attemptedModel: promptStart.promptStart.attemptedModel,
            baselineMessageCount: promptStart.promptStart.baselineMessageCount,
            promptAcceptedAt: promptStart.promptStart.promptAcceptedAt,
          }),
        });

        if (!accepted) {
          throw new NotFoundError("Task run not found.");
        }

        if (accepted.status !== "running") {
          await handleTerminalRun(accepted, { triggerContext: readRunContext(accepted) });
          return accepted;
        }

        if (monitorConfig.autoStart) {
          startTaskRunMonitor(accepted.id);
        }

        return accepted;
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

  async function getOrCreateTaskRunConversation(
    task: Task,
    run: TaskRun,
  ): Promise<ConversationDetail> {
    if (run.opencodeSessionId && options.conversationService) {
      const inspection = await options.conversationService.inspectTaskRunConversation(
        run.taskId,
        run.id,
      );

      if (inspection.conversation) {
        return inspection.conversation;
      }

      options.logger?.warn(
        {
          taskId: run.taskId,
          taskRunId: run.id,
          opencodeSessionId: run.opencodeSessionId,
          diagnostics: inspection.diagnostics,
        },
        "task run had an OpenCode session id but no task-owned conversation; creating a new session",
      );
    }

    if (!options.conversationService) {
      throw new Error("Conversation service is required to create task run conversations.");
    }

    return retryLocalOpenCodeCall(run, "task_session_create", () =>
      options.conversationService!.createTaskRunConversation({
        agentId: run.agentId,
        taskId: task.id,
        taskRunId: run.id,
        title: `Task: ${task.title}`,
        permission: run.effectivePermissions
          ? buildOpenCodeSessionPermissions(run.effectivePermissions)
          : undefined,
      }),
    );
  }

  async function startTaskRunPromptWithRetry(
    run: TaskRun,
    conversation: ConversationDetail,
    input: {
      text: string;
      attachments: Parameters<ConversationService["startTaskRunPrompt"]>[1]["attachments"];
      model?: string;
    },
  ): Promise<
    | { type: "started"; promptStart: TaskRunPromptStart }
    | { type: "accepted"; evidence: AcceptedPromptEvidence }
  > {
    return retryLocalOpenCodeCall(run, "task_session_prompt", async (error) => {
      if (error) {
        const latest = await findRun(run.id);
        const evidence = await readAcceptedPromptEvidence(latest);

        if (evidence) {
          return { type: "accepted", evidence };
        }
      }

      const promptStart = await options.conversationService!.startTaskRunPrompt(
        conversation.id,
        input,
      );
      return { type: "started", promptStart };
    });
  }

  async function readAcceptedPromptEvidence(
    run: TaskRun,
  ): Promise<AcceptedPromptEvidence | undefined> {
    if (!options.conversationService || !run.opencodeSessionId) {
      return undefined;
    }

    let conversation: ConversationDetail;

    try {
      conversation = await syncTaskRunConversationWithRetry(run);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return undefined;
      }

      throw error;
    }

    const monitorMetadata = readOptionalOpencodeMonitorMetadata(run);

    if (monitorMetadata) {
      return { conversation, reason: "monitor_metadata" };
    }

    let statusType: string | undefined;

    try {
      const status = await getTaskRunSessionStatusWithRetry(run);
      statusType = status.type;
    } catch (error) {
      options.logger?.warn(
        {
          err: error,
          taskId: run.taskId,
          taskRunId: run.id,
          opencodeSessionId: run.opencodeSessionId,
        },
        "task run duplicate-prevention status read failed; falling back to message count",
      );
    }

    if (statusType === "busy" || statusType === "retry") {
      return { conversation, reason: "status", statusType };
    }

    if (conversation.messageCount > 0) {
      return { conversation, reason: "messages", statusType };
    }

    return undefined;
  }

  async function resumeAcceptedPromptRun(
    run: TaskRun,
    evidence: AcceptedPromptEvidence,
  ): Promise<TaskRun> {
    let accepted = run;

    if (!readOptionalOpencodeMonitorMetadata(run)) {
      const updated = await options.taskService.updateRun(run.id, {
        triggerMetadata: mergeOpencodeMonitorMetadata(run.triggerMetadata, {
          conversationId: evidence.conversation.id,
          opencodeSessionId: evidence.conversation.opencodeSessionId,
          attemptedModel: run.model ?? "unknown",
          baselineMessageCount: 0,
          promptAcceptedAt: new Date().toISOString(),
        }),
      });

      if (!updated) {
        throw new NotFoundError("Task run not found.");
      }

      accepted = updated;
    }

    options.logger?.info(
      {
        taskId: accepted.taskId,
        taskRunId: accepted.id,
        opencodeSessionId: accepted.opencodeSessionId,
        observedStatus: evidence.statusType,
        messageCount: evidence.conversation.messageCount,
        reason: evidence.reason,
      },
      "task run prompt already appears accepted; resumed monitor instead of sending duplicate prompt",
    );
    startTaskRunMonitor(accepted.id);
    return accepted;
  }

  async function resumeRunningTaskRun(run: TaskRun): Promise<void> {
    const evidence = await readAcceptedPromptEvidence(run);

    if (evidence) {
      await resumeAcceptedPromptRun(run, evidence);
      return;
    }

    startTaskRunMonitor(run.id);
  }

  async function abortOpenCodeTaskRun(run: TaskRun): Promise<void> {
    if (run.status !== "running" || !run.opencodeSessionId || !options.conversationService) {
      return;
    }

    try {
      await options.conversationService.abortTaskRunConversation(run.taskId, run.id);
    } catch (error) {
      options.logger?.warn(
        {
          err: error,
          taskId: run.taskId,
          taskRunId: run.id,
          opencodeSessionId: run.opencodeSessionId,
        },
        "task run cancellation could not abort OpenCode session",
      );
    }
  }

  async function getTaskRunSessionStatusWithRetry(
    run: TaskRun,
  ): Promise<Awaited<ReturnType<ConversationService["getTaskRunSessionStatus"]>>> {
    return retryLocalOpenCodeCall(run, "task_session_status", () =>
      options.conversationService!.getTaskRunSessionStatus(run.taskId, run.id),
    );
  }

  async function syncTaskRunConversationWithRetry(run: TaskRun): Promise<ConversationDetail> {
    return retryLocalOpenCodeCall(run, "task_session_sync", () =>
      options.conversationService!.syncTaskRunConversation(run.taskId, run.id),
    );
  }

  async function retryLocalOpenCodeCall<T>(
    run: TaskRun,
    stage: RetryStage,
    operation: (previousError?: unknown) => Promise<T>,
  ): Promise<T> {
    const startedAtMs = Date.now();
    let attempt = 1;
    let previousError: unknown;

    while (true) {
      try {
        return await operation(previousError);
      } catch (error) {
        if (!isRetryableLocalOpenCodeError(error)) {
          throw error;
        }

        const elapsedMs = Date.now() - startedAtMs;
        const delayMs = computeTransportRetryDelay(attempt, elapsedMs);

        if (delayMs === undefined) {
          throw error;
        }

        const cause = readErrorCauseSummary(error);
        options.logger?.warn(
          {
            err: error,
            taskId: run.taskId,
            taskRunId: run.id,
            opencodeSessionId: run.opencodeSessionId,
            stage,
            attempt,
            nextDelayMs: delayMs,
            errorName: error instanceof Error ? error.name : "UnknownError",
            causeCode: cause.code,
            causeMessage: cause.message,
          },
          "retrying local OpenCode task run call after transport failure",
        );
        previousError = error;
        await sleep(delayMs);
        attempt += 1;
      }
    }
  }

  function computeTransportRetryDelay(attempt: number, elapsedMs: number): number | undefined {
    if (elapsedMs >= transportRetryConfig.maxElapsedMs) {
      return undefined;
    }

    const exponentialDelayMs = Math.min(
      transportRetryConfig.maxDelayMs,
      transportRetryConfig.initialDelayMs * 2 ** Math.max(0, attempt - 1),
    );
    const jitterMs =
      transportRetryConfig.jitterRatio > 0
        ? exponentialDelayMs * transportRetryConfig.jitterRatio * Math.random()
        : 0;
    const delayMs = Math.max(0, Math.round(exponentialDelayMs + jitterMs));
    const remainingMs = transportRetryConfig.maxElapsedMs - elapsedMs;

    return Math.min(delayMs, remainingMs);
  }

  function startTaskRunMonitor(runId: string): void {
    if (!options.conversationService || monitors.has(runId)) {
      return;
    }

    const handle: TaskRunMonitorHandle = {
      runId,
      startedAtMs: Date.now(),
      delayMs: monitorConfig.initialPollMs,
      idleCount: 0,
      stopped: false,
    };
    monitors.set(runId, handle);
    scheduleTaskRunMonitor(handle, 0);
  }

  function stopTaskRunMonitor(handle: TaskRunMonitorHandle): void {
    handle.stopped = true;

    if (handle.timer) {
      clearTimeout(handle.timer);
      handle.timer = undefined;
    }
  }

  function scheduleTaskRunMonitor(handle: TaskRunMonitorHandle, delayMs: number): void {
    if (handle.stopped) {
      return;
    }

    handle.timer = setTimeout(() => {
      void runTaskRunMonitorTick(handle);
    }, delayMs);
    handle.timer.unref?.();
  }

  async function runTaskRunMonitorTick(handle: TaskRunMonitorHandle): Promise<void> {
    if (handle.stopped) {
      return;
    }

    try {
      const done = await pollTaskRunMonitor(handle);

      if (done) {
        monitors.delete(handle.runId);
        stopTaskRunMonitor(handle);
        return;
      }

      scheduleTaskRunMonitor(handle, handle.delayMs);
    } catch (error) {
      options.logger?.warn(
        { err: error, runId: handle.runId },
        "task run monitor poll failed; will retry",
      );
      handle.idleCount = 0;
      handle.delayMs = nextMonitorDelay(handle.delayMs);
      scheduleTaskRunMonitor(handle, handle.delayMs);
    }
  }

  async function pollTaskRunMonitor(handle: TaskRunMonitorHandle): Promise<boolean> {
    const run = await options.taskService.getRunById(handle.runId);

    if (!run || run.status !== "running") {
      return true;
    }

    if (!options.conversationService || !run.opencodeSessionId) {
      return true;
    }

    if (isMonitorTimedOut(handle, run)) {
      return finalizeTaskRunMonitorTimeout(handle, run);
    }

    let statusType: string | undefined;

    try {
      const status = await getTaskRunSessionStatusWithRetry(run);
      statusType = status.type;
      handle.lastStatus = status.type;
    } catch (error) {
      options.logger?.warn(
        { err: error, runId: run.id, opencodeSessionId: run.opencodeSessionId },
        "task run monitor status read failed; falling back to synced messages",
      );
    }

    const conversation = await syncTaskRunConversationWithRetry(run);
    const monitorMetadata = readOpencodeMonitorMetadata(run);
    const latestAssistant = readLatestAssistantMessage(
      conversation.messages.slice(monitorMetadata.baselineMessageCount),
    );

    if (latestAssistant?.id) {
      handle.lastAssistantMessageId = latestAssistant.id;
    }

    if (latestAssistant?.error) {
      return finalizeTaskRunModelError(run, latestAssistant.error, monitorMetadata.attemptedModel);
    }

    if (statusType === "busy" || statusType === "retry") {
      handle.idleCount = 0;
      handle.delayMs = nextMonitorDelay(handle.delayMs);
      return false;
    }

    if (!latestAssistant) {
      handle.idleCount = 0;
      handle.delayMs = monitorConfig.initialPollMs;
      return false;
    }

    handle.idleCount += 1;
    handle.delayMs = monitorConfig.initialPollMs;

    if (handle.idleCount < monitorConfig.idlePolls) {
      return false;
    }

    return finalizeTaskRunCompletion(run, conversation);
  }

  async function finalizeTaskRunCompletion(
    run: TaskRun,
    conversation: { id: string; messageCount: number; messages: ConversationMessage[] },
  ): Promise<boolean> {
    const latest = await options.taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return true;
    }

    const completed = await options.taskService.setRunStatus(latest.id, "completed", {
      completedAt: new Date().toISOString(),
      finalMessage: summarizeTaskRunConversation(conversation),
      result: {
        conversationId: conversation.id,
        messageCount: conversation.messageCount,
      },
    });

    if (!completed) {
      throw new NotFoundError("Task run not found.");
    }

    await handleTerminalRun(completed, { triggerContext: readRunContext(completed) });
    return true;
  }

  async function finalizeTaskRunModelError(
    run: TaskRun,
    modelError: TaskRunPromptError["modelError"],
    attemptedModel: string,
  ): Promise<boolean> {
    const latest = await options.taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return true;
    }

    const error = new TaskRunPromptError({ modelError, attemptedModel });
    const errored = await options.taskService.setRunStatus(latest.id, "error", {
      completedAt: new Date().toISOString(),
      errorMessage: error.message,
      errorDetails: buildTaskRunErrorDetails(error, latest),
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
        "task run monitor observed provider error, queued fallback model run",
      );
      return true;
    }

    await handleTerminalRun(errored, { triggerContext: readRunContext(errored) });
    return true;
  }

  async function finalizeTaskRunMonitorTimeout(
    handle: TaskRunMonitorHandle,
    run: TaskRun,
  ): Promise<boolean> {
    let conversation:
      | { id: string; messageCount: number; messages: ConversationMessage[] }
      | undefined;

    try {
      conversation = options.conversationService
        ? await syncTaskRunConversationWithRetry(run)
        : undefined;
      const monitorMetadata = readOpencodeMonitorMetadata(run);
      const latestAssistant = readLatestAssistantMessage(
        conversation?.messages.slice(monitorMetadata.baselineMessageCount) ?? [],
      );

      if (latestAssistant?.id) {
        handle.lastAssistantMessageId = latestAssistant.id;
      }
    } catch (error) {
      options.logger?.warn({ err: error, runId: run.id }, "task run monitor timeout sync failed");
    }

    const latest = await options.taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return true;
    }

    const errored = await options.taskService.setRunStatus(latest.id, "error", {
      completedAt: new Date().toISOString(),
      errorMessage: "Task monitor timed out before OpenCode session settled.",
      errorDetails: {
        errorName: "TaskRunMonitorTimeout",
        stage: "monitor_timeout",
        opencodeSessionId: latest.opencodeSessionId,
        elapsedRunMs: readElapsedRunMs(latest),
        monitorElapsedMs: Date.now() - handle.startedAtMs,
        lastStatus: handle.lastStatus,
        lastAssistantMessageId: handle.lastAssistantMessageId,
        conversationId: conversation?.id,
        messageCount: conversation?.messageCount,
      },
    });

    if (!errored) {
      throw new NotFoundError("Task run not found.");
    }

    await handleTerminalRun(errored, { triggerContext: readRunContext(errored) });
    return true;
  }

  function isMonitorTimedOut(handle: TaskRunMonitorHandle, run: TaskRun): boolean {
    const startedAtMs = run.startedAt ? Date.parse(run.startedAt) : handle.startedAtMs;
    const elapsedMs = Date.now() - (Number.isNaN(startedAtMs) ? handle.startedAtMs : startedAtMs);

    return elapsedMs >= monitorConfig.maxLifetimeMs;
  }

  function nextMonitorDelay(currentDelayMs: number): number {
    return Math.min(
      monitorConfig.maxPollMs,
      Math.max(monitorConfig.initialPollMs, currentDelayMs * 2),
    );
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

    const details: Record<string, unknown> = {
      errorName: error instanceof Error ? error.name : "UnknownError",
      stage: run.opencodeSessionId ? "task_session_prompt" : "task_session_create",
    };

    if (error instanceof Error) {
      details["message"] = error.message;
      appendCauseDetails(details, error);
    }

    if (run.opencodeSessionId) {
      details["opencodeSessionId"] = run.opencodeSessionId;
    }

    const elapsedRunMs = readElapsedRunMs(run);
    if (elapsedRunMs !== undefined) {
      details["elapsedRunMs"] = elapsedRunMs;
    }

    return details;
  }

  function appendCauseDetails(details: Record<string, unknown>, error: Error): void {
    const cause = (error as Error & { cause?: unknown }).cause;

    if (!cause) {
      return;
    }

    if (cause instanceof Error) {
      details["causeName"] = cause.name;
      details["causeMessage"] = cause.message;
      appendCauseCode(details, cause);
      return;
    }

    if (isRecord(cause)) {
      const name = readString(cause, "name");
      const message = readString(cause, "message");
      const code = readString(cause, "code");

      if (name) {
        details["causeName"] = name;
      }

      if (message) {
        details["causeMessage"] = message;
      }

      if (code) {
        details["causeCode"] = code;
      }
    }
  }

  function appendCauseCode(details: Record<string, unknown>, error: Error): void {
    const code = (error as Error & { code?: unknown }).code;

    if (typeof code === "string" && code.trim()) {
      details["causeCode"] = code;
    }
  }

  function readElapsedRunMs(run: TaskRun): number | undefined {
    if (!run.startedAt) {
      return undefined;
    }

    const startedAtMs = Date.parse(run.startedAt);

    if (Number.isNaN(startedAtMs)) {
      return undefined;
    }

    return Math.max(0, Date.now() - startedAtMs);
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
      resetAgentDrainDeferral(agentId);
      return;
    }

    if (deferQueuedRunIfOpenCodeIsUnhealthy(nextRun)) {
      return;
    }

    resetAgentDrainDeferral(agentId);
    const started = await runQueuedTask(nextRun.id);

    if (started.status === "queued") {
      return;
    }
  }

  function deferQueuedRunIfOpenCodeIsUnhealthy(run: TaskRun): boolean {
    if (!options.conversationService || !options.orchestrator) {
      return false;
    }

    const status = options.orchestrator.getStatus();

    if (status.healthy) {
      resetAgentDrainDeferral(run.agentId);
      return false;
    }

    scheduleDeferredAgentDrain(run, status);
    return true;
  }

  function scheduleDeferredAgentDrain(
    run: TaskRun,
    status: ReturnType<OpenCodeOrchestrator["getStatus"]>,
  ): void {
    const existing = agentDrainDeferrals.get(run.agentId);

    if (existing?.timer) {
      return;
    }

    const delayMs = computeDeferDelay(existing?.delayMs ?? deferConfig.initialDelayMs);
    const nextDelayMs = Math.min(deferConfig.maxDelayMs, delayMs * 2);
    const deferral: AgentDrainDeferral = { delayMs: nextDelayMs };

    options.logger?.warn(
      {
        taskId: run.taskId,
        taskRunId: run.id,
        agentId: run.agentId,
        engineState: status.state,
        lastError: status.lastError,
        nextDelayMs: delayMs,
      },
      "deferred queued task run because OpenCode is unhealthy",
    );

    deferral.timer = setTimeout(() => {
      deferral.timer = undefined;
      void drainAgentQueue(run.agentId).catch((error: unknown) => {
        options.logger?.error({ err: error, agentId: run.agentId }, "task queue drain failed");
      });
    }, delayMs);
    deferral.timer.unref?.();
    agentDrainDeferrals.set(run.agentId, deferral);
  }

  function resetAgentDrainDeferral(agentId: string): void {
    const deferral = agentDrainDeferrals.get(agentId);

    if (!deferral) {
      return;
    }

    if (deferral.timer) {
      clearTimeout(deferral.timer);
    }

    agentDrainDeferrals.delete(agentId);
  }

  function computeDeferDelay(baseDelayMs: number): number {
    const cappedDelayMs = Math.min(deferConfig.maxDelayMs, Math.max(0, baseDelayMs));
    const jitterMs =
      deferConfig.jitterRatio > 0 ? cappedDelayMs * deferConfig.jitterRatio * Math.random() : 0;

    return Math.max(0, Math.round(cappedDelayMs + jitterMs));
  }
}

function readScheduledAtFromTrigger(trigger: QueueTaskInput): string | undefined {
  const scheduledAt = trigger.metadata?.["scheduledAt"];
  return typeof scheduledAt === "string" ? scheduledAt : undefined;
}

function mergeOpencodeMonitorMetadata(
  triggerMetadata: Record<string, unknown> | undefined,
  opencodeMonitor: OpencodeMonitorMetadata,
): Record<string, unknown> {
  return {
    ...(triggerMetadata ?? {}),
    opencodeMonitor,
  };
}

function readOpencodeMonitorMetadata(run: TaskRun): OpencodeMonitorMetadata {
  const metadata = readOptionalOpencodeMonitorMetadata(run);

  if (!metadata) {
    throw new BadRequestError("Task run is missing OpenCode monitor metadata.");
  }

  return metadata;
}

function readOptionalOpencodeMonitorMetadata(run: TaskRun): OpencodeMonitorMetadata | undefined {
  const value = run.triggerMetadata?.["opencodeMonitor"];

  if (!isRecord(value)) {
    return undefined;
  }

  const conversationId = readString(value, "conversationId");
  const opencodeSessionId = readString(value, "opencodeSessionId");
  const attemptedModel = readString(value, "attemptedModel");
  const promptAcceptedAt = readString(value, "promptAcceptedAt");
  const baselineMessageCount =
    typeof value["baselineMessageCount"] === "number" &&
    Number.isInteger(value["baselineMessageCount"]) &&
    value["baselineMessageCount"] >= 0
      ? value["baselineMessageCount"]
      : undefined;

  if (
    !conversationId ||
    !opencodeSessionId ||
    !attemptedModel ||
    !promptAcceptedAt ||
    baselineMessageCount === undefined
  ) {
    return undefined;
  }

  return {
    conversationId,
    opencodeSessionId,
    attemptedModel,
    baselineMessageCount,
    promptAcceptedAt,
  };
}

function readLatestAssistantMessage(
  messages: ConversationMessage[],
): ConversationMessage | undefined {
  return messages.findLast((message) => message.role === "assistant");
}

function summarizeTaskRunConversation(conversation: { messages: ConversationMessage[] }): string {
  const latestAssistant = readLatestAssistantMessage(conversation.messages);

  if (!latestAssistant) {
    return "Task completed. No assistant summary was recorded.";
  }

  const content = latestAssistant.content.trim();
  return content.length > 0 ? content : "Task completed.";
}

function isRetryableLocalOpenCodeError(error: unknown): boolean {
  if (error instanceof TaskRunPromptError) {
    return false;
  }

  const statusCode = readErrorStatusCode(error);
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return true;
  }

  const text = collectErrorText(error).join(" ").toLowerCase();

  return [
    "fetch failed",
    "econnrefused",
    "econnreset",
    "epipe",
    "und_err_socket",
    "und_err_headers_timeout",
    "headers timeout",
    "header timeout",
    "socket closed",
    "socket hang up",
    "aborted",
    "aborterror",
    "timeout",
    "timed out",
  ].some((marker) => text.includes(marker));
}

function collectErrorText(error: unknown, seen = new Set<unknown>()): string[] {
  if (!error || seen.has(error)) {
    return [];
  }

  seen.add(error);

  if (error instanceof Error) {
    return [
      error.name,
      error.message,
      ...collectErrorText((error as Error & { cause?: unknown }).cause, seen),
    ];
  }

  if (!isRecord(error)) {
    return typeof error === "string" ? [error] : [];
  }

  const values: string[] = [];
  for (const key of ["name", "message", "code", "statusText"]) {
    const value = error[key];

    if (typeof value === "string") {
      values.push(value);
    }
  }

  values.push(...collectErrorText(error["cause"], seen));
  values.push(...collectErrorText(error["data"], seen));
  return values;
}

function readErrorStatusCode(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  for (const key of ["statusCode", "status"]) {
    const value = error[key];

    if (typeof value === "number") {
      return value;
    }
  }

  return readErrorStatusCode(error["cause"]) ?? readErrorStatusCode(error["data"]);
}

function readErrorCauseSummary(error: unknown): { code?: string; message?: string } {
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;

  if (cause instanceof Error) {
    return {
      code:
        typeof (cause as Error & { code?: unknown }).code === "string"
          ? (cause as Error & { code: string }).code
          : undefined,
      message: cause.message,
    };
  }

  if (isRecord(cause)) {
    return {
      code: readString(cause, "code"),
      message: readString(cause, "message"),
    };
  }

  return {};
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
