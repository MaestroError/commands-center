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
  type QueueTaskInput,
  type TaskContext,
  type Task,
  type TaskQueuePreview,
  type TaskRun,
  type TaskRunFollowup,
  type TaskSubtask,
} from "@cc/shared/schemas";
import { z } from "zod";

import { createId } from "../db/ids.js";
import { BadRequestError, NotFoundError } from "../lib/api-error.js";
import type { ConversationService, TaskRunPromptStart } from "./conversation-service.js";
import { buildTerminalActivity } from "./task-activity.js";
import { createTaskRunContextService } from "./task-run-context-service.js";
import {
  createTaskRunMonitorService,
  DEFAULT_TASK_RUN_MONITOR_CONFIG,
  type TaskRunMonitorConfig,
  type TaskRunMonitorRuntimeConfig,
} from "./task-run-monitor-service.js";
import {
  buildTaskRunErrorDetails,
  createTaskRunTransport,
  DEFAULT_TRANSPORT_RETRY_CONFIG,
  formatTaskRunErrorMessage,
  mergeOpencodeMonitorMetadata,
  readOptionalOpencodeMonitorMetadata,
  type TaskRunTransportRetryConfig,
} from "./task-run-support.js";
import { buildOpenCodeSessionPermissions } from "./task-permission-service.js";
import { createTaskRunOperationGuard } from "./task-run-operation-guard.js";
import type {
  AcceptedPromptEvidence,
  TaskExecutionServiceOptions,
} from "./task-execution-service/context.js";
import { createTaskRetryPolicy } from "./task-execution-service/retry-policy.js";
import { createTaskReplyFlow } from "./task-execution-service/reply-flow.js";
import { createAgentDrainQueue } from "./task-execution-service/agent-drain.js";
import {
  hasTerminalSubtaskRun,
  latestSubtaskRunErrored,
  latestSubtaskRunNeedsReview,
  readScheduledAtFromTrigger,
} from "./task-execution-service/helpers.js";

export type TaskExecutionService = ReturnType<typeof createTaskExecutionService>;
export type QueueTaskExecutionInput = Partial<Omit<QueueTaskInput, "taskId">> & {
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

type RunnableSubtasks = {
  unattempted: TaskSubtask[];
  retryableErrored: TaskSubtask[];
  retryableReview: TaskSubtask[];
  hasActive: boolean;
};

export type TaskRunDeferOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
};

export type TaskRunDeferConfig = Required<TaskRunDeferOptions>;

export type AgentDrainDeferral = {
  delayMs: number;
  timer?: ReturnType<typeof setTimeout>;
};

const DEFAULT_TASK_RUN_DEFER_CONFIG: TaskRunDeferConfig = {
  initialDelayMs: 2_000,
  maxDelayMs: 30_000,
  jitterRatio: 0.2,
};

const MONITOR_RUNTIME_CACHE_MS = 10_000;

export function createTaskExecutionService(options: TaskExecutionServiceOptions) {
  const taskRunOperationGuard =
    options.conversationService?.taskRunOperationGuard ?? createTaskRunOperationGuard();
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
  const agentDrainDeferrals = new Map<string, AgentDrainDeferral>();
  let monitorRuntimeCache: { atMs: number; value: TaskRunMonitorRuntimeConfig } | undefined;
  const transport = createTaskRunTransport({
    conversationService: options.conversationService,
    logger: options.logger,
    config: transportRetryConfig,
  });
  const { scheduleAgentDrain, deferQueuedRunIfOpenCodeIsUnhealthy } = createAgentDrainQueue({
    options,
    agentDrainDeferrals,
    deferConfig,
    runQueuedTask,
  });
  const {
    queueFallbackRun,
    finalizeStalledRun,
    finalizeBlockedInteraction,
    finalizeUsageLimitRun,
    finalizeModelNotFoundRun,
    resolveAutoRetryLimit,
    readRequeueCount,
  } = createTaskRetryPolicy({
    options,
    queueTask,
    notifyRunTerminal,
    scheduleAgentDrain,
    abortOpenCodeTaskRun,
  });

  const monitorService = createTaskRunMonitorService({
    taskService: options.taskService,
    conversationService: options.conversationService,
    transport,
    config: monitorConfig,
    resolveRuntimeConfig: options.monitorSettingsService ? resolveMonitorRuntimeConfig : undefined,
    logger: options.logger,
    hooks: {
      handleTerminalRun: (run) => handleTerminalRun(run, { triggerContext: readRunContext(run) }),
      queueFallbackRun,
      finalizeBlockedInteraction,
      finalizeStalledRun,
      finalizeUsageLimitRun,
      finalizeModelNotFoundRun,
    },
  });

  const { sendRunReply } = createTaskReplyFlow({
    options,
    findRun,
    startTaskRunPromptWithRetry,
    resumeAcceptedPromptRun,
    handleTerminalRun,
    readRunContext,
    monitorConfig,
    monitorService,
  });

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

    async sendRunReply(runId: string, input: unknown): Promise<TaskRunFollowup> {
      return sendRunReply(runId, input);
    },

    startTaskRunMonitor(runId: string): void {
      monitorService.start(runId);
    },

    async resumeRunningTaskRuns(): Promise<void> {
      const runs = await options.taskService.listActiveRuns();

      for (const run of runs) {
        if (run.status !== "running") {
          continue;
        }

        // Best-effort startup recovery: one run failing to resume (e.g. a
        // transient transport error past the retry budget while OpenCode is still
        // coming up) must not abort recovery for the remaining running runs.
        try {
          if (run.opencodeSessionId) {
            await resumeRunningTaskRun(run);
            continue;
          }

          await options.taskService.updateRun(run.id, { status: "queued" });
          scheduleAgentDrain(run.agentId);
        } catch (error) {
          options.logger?.warn(
            {
              err: error,
              taskId: run.taskId,
              taskRunId: run.id,
              opencodeSessionId: run.opencodeSessionId,
            },
            "failed to resume running task run on startup; starting monitor best-effort",
          );

          // The monitor itself is resilient (polls with retries and reconstructs
          // missing metadata), so fall back to it when the run has a session.
          if (run.opencodeSessionId) {
            monitorService.start(run.id);
          }
        }
      }
    },

    async cancel(runId: string, input: CancelTaskRunInput = {}): Promise<TaskRun> {
      const parsed = cancelTaskRunInputSchema.parse(input);
      taskRunOperationGuard.requestCancellation(runId);
      let guarded: { run: TaskRun; cancelled: TaskRun };
      try {
        guarded = await taskRunOperationGuard.runExclusive(runId, async () => {
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

          return { run, cancelled };
        });
      } finally {
        taskRunOperationGuard.clearCancellationRequest(runId);
      }

      const { run, cancelled } = guarded;

      await abortOpenCodeTaskRun(run);
      notifyRunTerminal(cancelled);
      scheduleAgentDrain(cancelled.agentId);
      return cancelled;
    },

    async listActiveRuns(): Promise<TaskRun[]> {
      return options.taskService.listActiveRuns();
    },

    dispose(): void {
      monitorService.dispose();

      for (const deferral of agentDrainDeferrals.values()) {
        if (deferral.timer) {
          clearTimeout(deferral.timer);
        }
      }

      agentDrainDeferrals.clear();
    },
  };

  // Resolve the monitor's timeouts from settings, cached briefly so many active
  // monitors polling every couple of seconds don't each re-read the file. Falls
  // back to the static monitor config on any read/parse failure.
  async function resolveMonitorRuntimeConfig(): Promise<TaskRunMonitorRuntimeConfig> {
    const now = Date.now();

    if (monitorRuntimeCache && now - monitorRuntimeCache.atMs < MONITOR_RUNTIME_CACHE_MS) {
      return monitorRuntimeCache.value;
    }

    const fallback: TaskRunMonitorRuntimeConfig = {
      maxLifetimeMs: monitorConfig.maxLifetimeMs,
      noProgressMs: monitorConfig.noProgressMs,
      retryFailFastMs: monitorConfig.retryFailFastMs,
    };

    try {
      const settings = await options.monitorSettingsService!.get();
      const value: TaskRunMonitorRuntimeConfig = {
        maxLifetimeMs: settings.taskRunMonitorMaxLifetimeMinutes * 60_000,
        noProgressMs: settings.taskRunMonitorNoProgressTimeoutMinutes * 60_000,
        retryFailFastMs: settings.taskRunMonitorUsageLimitFailFastMinutes * 60_000,
      };
      monitorRuntimeCache = { atMs: now, value };
      return value;
    } catch (error) {
      options.logger?.warn(
        { err: error },
        "task run monitor settings read failed; using static monitor config",
      );
      monitorRuntimeCache = { atMs: now, value: fallback };
      return fallback;
    }
  }

  async function queueTask(taskId: string, input: QueueTaskExecutionInput = {}): Promise<TaskRun> {
    const parsed = queueTaskExecutionInputSchema.parse({ taskId, ...input });
    const triggerContext = parsed.context ? taskContextSchema.parse(parsed.context) : undefined;
    const target = await requireRunnableTask(taskId, parsed.triggerSource);
    const task = await resolveExecutableTask(target, { ...parsed, context: triggerContext });

    if (!parsed.subtaskId) {
      const pending = await listRunnableSubtasks(task.id);
      const runnable = manualRunnableSubtasks(pending);

      if (runnable.length > 0) {
        return queueNextSubtaskRun(task, parsed, triggerContext, runnable);
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
      : manualRunnableSubtasks(await listRunnableSubtasks(task.id))[0];
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

      monitorService.start(run.id);
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

        // Link (or relink) the run to the conversation's session. The run can
        // arrive with a stale opencodeSessionId whose conversation/session no
        // longer exists, in which case getOrCreateTaskRunConversation created a
        // fresh session — keep task_runs.opencode_session_id consistent with it.
        if (running.opencodeSessionId !== conversation.opencodeSessionId) {
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
          monitorService.start(accepted.id);
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
        errorMessage: formatTaskRunErrorMessage(error),
        errorDetails: buildTaskRunErrorDetails(error, running),
      });

      if (!errored) {
        throw new NotFoundError("Task run not found.");
      }

      const fallbackRun = await queueFallbackRun(errored, error, {
        logMessage: "task run errored, queued fallback model run",
      });
      if (fallbackRun) {
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

    return transport.retry(run, "task_session_create", () =>
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
    return transport.retry(run, "task_session_prompt", async (error) => {
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
      conversation = await transport.syncConversation(run);
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
      const status = await transport.getSessionStatus(run);
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
          // The prompt was accepted out of band (transport failure recovery), so
          // the actually attempted model is unknown here. `run.model` is only the
          // requested model and may differ from the agent-default fallback that
          // startTaskRunPrompt resolved, so use an explicit sentinel instead of
          // guessing — keeps later provider-error fallback selection accurate.
          attemptedModel: "unknown",
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
    monitorService.start(accepted.id);
    return accepted;
  }

  async function resumeRunningTaskRun(run: TaskRun): Promise<void> {
    const evidence = await readAcceptedPromptEvidence(run);

    if (evidence) {
      await resumeAcceptedPromptRun(run, evidence);
      return;
    }

    monitorService.start(run.id);
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

  // Finalize a run the monitor detected as stalled: abort the wedged session,
  // cancel the run with a clear reason, and — when enabled in settings — queue a
  // fresh run of the same task/subtask.
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

  // Classify a task's feedback subtasks into the buckets the queue paths care
  // about. `unattempted` is fresh work; `retryableErrored` is a subtask whose
  // latest run was a system error/failure; `retryableReview` is one whose latest
  // run is an intentional human-review hand-off. The buckets are kept separate so
  // the automatic path can auto-retry failures (bounded by a cap) while never
  // re-queuing a review hand-off, which is terminal.
  async function listRunnableSubtasks(taskId: string): Promise<RunnableSubtasks> {
    const subtasks = await options.taskService.listSubtasks(taskId);

    if (subtasks.length === 0) {
      return { unattempted: [], retryableErrored: [], retryableReview: [], hasActive: false };
    }

    const runs = await options.taskService.listRuns(taskId);
    const activeSubtaskIds = new Set(
      runs
        .filter((run) => run.subtaskId && (run.status === "queued" || run.status === "running"))
        .map((run) => run.subtaskId),
    );

    const inactive = subtasks.filter((subtask) => !activeSubtaskIds.has(subtask.id));

    return {
      unattempted: inactive.filter((subtask) => !hasTerminalSubtaskRun(subtask.id, runs)),
      retryableErrored: inactive.filter((subtask) => latestSubtaskRunErrored(subtask.id, runs)),
      retryableReview: inactive.filter((subtask) => latestSubtaskRunNeedsReview(subtask.id, runs)),
      hasActive: activeSubtaskIds.size > 0,
    };
  }

  // Subtasks a manual/explicit queue may run: fresh work first, otherwise any
  // attempted-but-not-successful subtask (failed or awaiting review). A deliberate
  // user retry is not subject to the auto-retry cap.
  function manualRunnableSubtasks(pending: RunnableSubtasks): TaskSubtask[] {
    if (pending.unattempted.length > 0) {
      return pending.unattempted;
    }

    return [...pending.retryableErrored, ...pending.retryableReview];
  }

  async function handleTerminalRun(
    run: TaskRun,
    input: { triggerContext?: TaskContext },
  ): Promise<void> {
    notifyRunTerminal(run);
    const queued = await queueNextFeedbackSubtaskAfter(run, input.triggerContext);
    scheduleAgentDrain(queued?.agentId ?? run.agentId);
  }

  // Automatic chaining after a terminal feedback run. Fresh subtasks are always
  // queued next; a failed subtask is auto-retried only while under the configured
  // cap; a human-review hand-off is terminal and is never re-queued (this is what
  // prevents the runaway loop).
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

    if (pending.hasActive) {
      return undefined;
    }

    // Fresh subtasks are new work: queue the next one with a clean retry chain.
    if (pending.unattempted.length > 0) {
      return queueNextSubtaskRun(
        task,
        {
          triggerSource: run.triggerSource,
          fallbackModels: run.fallbackModels,
          metadata: { ...run.triggerMetadata, requeueCount: 0 },
        },
        triggerContext,
        pending.unattempted,
      );
    }

    // No fresh work left. Auto-retry a failed subtask only while under the cap.
    if (pending.retryableErrored.length === 0) {
      return undefined;
    }

    const limit = await resolveAutoRetryLimit();
    const nextRequeueCount = readRequeueCount(run) + 1;

    if (nextRequeueCount > limit) {
      options.logger?.warn(
        {
          taskId: task.id,
          taskRunId: run.id,
          subtaskId: run.subtaskId,
          requeueAttempt: nextRequeueCount,
          autoRetryLimit: limit,
        },
        "feedback subtask auto-retry limit reached; leaving task in failed status",
      );
      return undefined;
    }

    return queueNextSubtaskRun(
      task,
      {
        triggerSource: run.triggerSource,
        fallbackModels: run.fallbackModels,
        metadata: {
          ...run.triggerMetadata,
          requeuedFromRunId: run.id,
          requeueReason: "system_failure",
          requeueCount: nextRequeueCount,
        },
      },
      triggerContext,
      pending.retryableErrored,
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
    void finalizeInFlightRunFollowup(run);
    void finalizeRunArchive(run);
    void emitTerminalActivity(run);
    void options.onRunTerminal?.(run);
  }

  // Every terminal transition (completion, error, cancellation, skip) funnels
  // through here, so this is the one place that can reliably close out a reply
  // that reactivated this run — regardless of which path put it back into
  // "running". Best-effort: never throw into the terminal path.
  async function finalizeInFlightRunFollowup(run: TaskRun): Promise<void> {
    try {
      const inFlight = await options.taskService.findInFlightFollowup(run.id);

      if (!inFlight) {
        return;
      }

      if (run.status === "completed") {
        await options.taskService.markFollowupAnswered(inFlight.id, {
          answerBody: run.resultText ?? run.finalMessage ?? "No response text.",
          // Prefer the run's own completion time so the answer's timestamp
          // reflects when the run finished, not when this terminal hook happened
          // to run.
          answeredAt: run.completedAt ?? new Date().toISOString(),
        });
        return;
      }

      await options.taskService.markFollowupFailed(
        inFlight.id,
        run.errorMessage ?? `Run ended (${run.status}) before answering.`,
      );
    } catch (error) {
      options.logger?.warn(
        { err: error, taskId: run.taskId, taskRunId: run.id },
        "failed to finalize in-flight run reply",
      );
    }
  }

  // Drop an activity for the just-finished run. Best-effort: never throw into the
  // terminal path, and never block it.
  async function emitTerminalActivity(run: TaskRun): Promise<void> {
    const activityService = options.activityService;
    if (!activityService) {
      return;
    }

    try {
      let isFeedbackSubtask = false;
      if (run.subtaskId) {
        const subtask = (await options.taskService.listSubtasks(run.taskId)).find(
          (entry) => entry.id === run.subtaskId,
        );
        isFeedbackSubtask = Boolean(subtask?.feedbackId);
      }

      const task = await options.taskService.get(run.taskId);
      const input = buildTerminalActivity({
        run,
        taskTitle: task?.title ?? "Untitled task",
        isFeedbackSubtask,
      });
      if (input) {
        await activityService.emit(input);
      }
    } catch (error) {
      options.logger?.warn({ err: error, runId: run.id }, "failed to emit terminal activity");
    }
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
}

// Render a stall window for the operator-facing cancellation reason. Production
// values are whole minutes, but the monitor config is in milliseconds and may be
// sub-minute (or non-integer minutes), so report what was actually configured.
