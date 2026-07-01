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
import { and, eq, isNull } from "drizzle-orm";
import type { Logger } from "pino";
import { z } from "zod";

import { createId } from "../db/ids.js";
import type { AppDb } from "../db/client.js";
import { task_runs, tasks } from "../db/schema/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/api-error.js";
import type { OpenCodeOrchestrator } from "../orchestrator/opencode-orchestrator.js";
import {
  TaskRunPromptError,
  type ConversationService,
  type TaskRunPromptStart,
} from "./conversation-service.js";
import type { TaskContextAttachmentService } from "./task-context-attachment-service.js";
import type { SessionArchiveService } from "./session-archive-service.js";
import type { SessionArchiveSettingsService } from "./session-archive-settings-service.js";
import type { ActivityService } from "./activity-service.js";
import { buildTerminalActivity } from "./task-activity.js";
import { createTaskRunContextService } from "./task-run-context-service.js";
import {
  createTaskRunMonitorService,
  DEFAULT_TASK_RUN_MONITOR_CONFIG,
  type TaskRunMonitorConfig,
  type TaskRunMonitorOptions,
  type TaskRunMonitorRuntimeConfig,
  type TaskRunBlockedInteractionDetails,
  type TaskRunStallDetails,
} from "./task-run-monitor-service.js";
import type { TaskRunMonitorSettingsService } from "./task-run-monitor-settings-service.js";
import {
  buildTaskRunErrorDetails,
  createTaskRunTransport,
  DEFAULT_TRANSPORT_RETRY_CONFIG,
  mergeOpencodeMonitorMetadata,
  readOptionalOpencodeMonitorMetadata,
  type TaskRunTransportRetryConfig,
  type TaskRunTransportRetryOptions,
} from "./task-run-support.js";
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

type RunnableSubtasks = {
  unattempted: TaskSubtask[];
  retryableErrored: TaskSubtask[];
  retryableReview: TaskSubtask[];
  hasActive: boolean;
};

type AcceptedPromptEvidence = {
  conversation: ConversationDetail;
  reason: "monitor_metadata" | "messages" | "status";
  statusType?: string;
};

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

const DEFAULT_TASK_RUN_DEFER_CONFIG: TaskRunDeferConfig = {
  initialDelayMs: 2_000,
  maxDelayMs: 30_000,
  jitterRatio: 0.2,
};

const MONITOR_RUNTIME_CACHE_MS = 10_000;

export function createTaskExecutionService(options: {
  db?: AppDb;
  taskService: TaskService;
  conversationService?: ConversationService;
  orchestrator?: Pick<OpenCodeOrchestrator, "getStatus">;
  taskContextAttachmentService?: TaskContextAttachmentService;
  taskPermissionService?: TaskPermissionService;
  archiveService?: SessionArchiveService;
  archiveSettingsService?: SessionArchiveSettingsService;
  monitorSettingsService?: TaskRunMonitorSettingsService;
  activityService?: ActivityService;
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
  const agentDrainDeferrals = new Map<string, AgentDrainDeferral>();
  let monitorRuntimeCache: { atMs: number; value: TaskRunMonitorRuntimeConfig } | undefined;
  const transport = createTaskRunTransport({
    conversationService: options.conversationService,
    logger: options.logger,
    config: transportRetryConfig,
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
    },
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
    };

    try {
      const settings = await options.monitorSettingsService!.get();
      const value: TaskRunMonitorRuntimeConfig = {
        maxLifetimeMs: settings.taskRunMonitorMaxLifetimeMinutes * 60_000,
        noProgressMs: settings.taskRunMonitorNoProgressTimeoutMinutes * 60_000,
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
        errorMessage: error instanceof Error ? error.message : "Task execution failed.",
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

  async function sendRunReply(runId: string, input: unknown): Promise<TaskRunFollowup> {
    if (!options.db) {
      throw new Error("Database client is required to send a run reply.");
    }

    if (!options.conversationService) {
      throw new Error("Conversation service is required to send a run reply.");
    }

    const run = await findRun(runId);

    if (run.status === "running") {
      throw new ConflictError("Cannot send a reply while the run is in progress.");
    }

    if (!run.opencodeSessionId) {
      throw new ConflictError("Task run does not have an OpenCode session.");
    }

    if (run.status !== "completed" && run.status !== "failed" && run.status !== "error") {
      throw new BadRequestError("Only completed, failed, or error task runs can receive a reply.");
    }

    const inspection = await options.conversationService.inspectTaskRunConversation(
      run.taskId,
      run.id,
    );
    const conversation = inspection.conversation;

    if (!conversation) {
      throw new NotFoundError("Task run session not found.");
    }

    const resumed = await reactivateRunForReply(run);
    const followup = await options.taskService.insertFollowup(resumed, input);

    try {
      const promptStart = await startTaskRunPromptWithRetry(resumed, conversation, {
        text: followup.body,
        attachments: [],
        model: resumed.model,
      });

      let accepted: TaskRun;
      if (promptStart.type === "accepted") {
        accepted = await resumeAcceptedPromptRun(resumed, promptStart.evidence);
      } else {
        const updated = await options.taskService.updateRun(resumed.id, {
          triggerMetadata: mergeOpencodeMonitorMetadata(resumed.triggerMetadata, {
            conversationId: promptStart.promptStart.conversationId,
            opencodeSessionId: promptStart.promptStart.opencodeSessionId,
            attemptedModel: promptStart.promptStart.attemptedModel,
            baselineMessageCount: promptStart.promptStart.baselineMessageCount,
            promptAcceptedAt: promptStart.promptStart.promptAcceptedAt,
          }),
        });

        if (!updated) {
          throw new NotFoundError("Task run not found.");
        }

        accepted = updated;
        if (monitorConfig.autoStart) {
          monitorService.start(accepted.id);
        }
      }

      // The followup row is left in "sending" — it's finalized (answered/failed)
      // once the run reaches terminal status again, via
      // finalizeInFlightRunFollowup (called from notifyRunTerminal).
      return followup;
    } catch (error) {
      const failed = await options.taskService.markFollowupFailed(
        followup.id,
        error instanceof Error ? error.message : "Failed to deliver reply.",
      );

      const latest = await findRun(resumed.id);

      if (latest.status !== "running") {
        await handleTerminalRun(latest, { triggerContext: readRunContext(latest) });
        return failed ?? followup;
      }

      const errored = await options.taskService.setRunStatus(resumed.id, "error", {
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "Task execution failed.",
        errorDetails: buildTaskRunErrorDetails(error, resumed),
      });

      if (!errored) {
        throw new NotFoundError("Task run not found.");
      }

      await handleTerminalRun(errored, { triggerContext: readRunContext(resumed) });
      return failed ?? followup;
    }
  }

  async function reactivateRunForReply(run: TaskRun): Promise<TaskRun> {
    if (!options.db) {
      throw new Error("Database client is required to send a run reply.");
    }

    const running = await options.taskService.getRunningRunForAgent(run.agentId);

    if (running && running.id !== run.id) {
      throw new ConflictError("Agent already has a running task run.", { runId: running.id });
    }

    const timestamp = new Date();
    try {
      options.db
        .update(task_runs)
        .set({
          status: "running",
          outcome: null,
          needs_human_review: false,
          human_review_reason: null,
          review_question_json: null,
          error_message: null,
          error_details_json: null,
          completed_at: null,
          cancelled_at: null,
          cancellation_reason: null,
          updated_at: timestamp,
        })
        .where(eq(task_runs.id, run.id))
        .run();
    } catch (error) {
      if (isRunningAgentConstraintError(error)) {
        const running = await options.taskService.getRunningRunForAgent(run.agentId);
        throw new ConflictError(
          "Agent already has a running task run.",
          running ? { runId: running.id } : undefined,
        );
      }

      throw error;
    }

    options.db
      .update(tasks)
      .set({
        status: "queued",
        updated_at: timestamp,
      })
      .where(and(eq(tasks.id, run.taskId), isNull(tasks.deleted_at)))
      .run();

    const resumed = await options.taskService.getRunById(run.id);

    if (!resumed) {
      throw new NotFoundError("Task run not found.");
    }

    return resumed;
  }

  function isRunningAgentConstraintError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("task_runs_agent_running_unique_idx") ||
        error.message.includes("UNIQUE constraint failed: task_runs.agent_id"))
    );
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
  async function finalizeStalledRun(run: TaskRun, details: TaskRunStallDetails): Promise<void> {
    const latest = await options.taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return;
    }

    await abortOpenCodeTaskRun(latest);

    const requeue = await resolveRequeueSettings();
    const nextRequeueCount = readRequeueCount(latest) + 1;
    const willRequeue = requeue.enabled && nextRequeueCount <= requeue.limit;
    const limitReached = requeue.enabled && !willRequeue;

    const cancellationReason =
      `Automatically cancelled: OpenCode produced no new output for ` +
      `${formatStallDuration(details.noProgressMs)} (stall timeout)` +
      `${latest.opencodeSessionId ? `; session ${latest.opencodeSessionId}` : ""}.` +
      `${limitReached ? ` Requeue limit (${String(requeue.limit)}) reached; not requeued.` : ""}`;

    const cancelled = await options.taskService.setRunStatus(latest.id, "cancelled", {
      cancelledAt: new Date().toISOString(),
      cancellationReason,
    });

    if (!cancelled) {
      throw new NotFoundError("Task run not found.");
    }

    notifyRunTerminal(cancelled);

    if (willRequeue) {
      try {
        const requeued = await requeueStalledRun(cancelled, nextRequeueCount);
        options.logger?.warn(
          {
            taskId: cancelled.taskId,
            cancelledRunId: cancelled.id,
            requeuedRunId: requeued.id,
            requeueAttempt: nextRequeueCount,
            requeueLimit: requeue.limit,
            opencodeSessionId: cancelled.opencodeSessionId,
            noProgressMs: details.noProgressMs,
            lastStatus: details.lastStatus,
          },
          "stalled task run cancelled and requeued",
        );
        return;
      } catch (error) {
        options.logger?.error(
          { err: error, taskId: cancelled.taskId, cancelledRunId: cancelled.id },
          "failed to requeue stalled task run; leaving it cancelled",
        );
      }
    } else {
      options.logger?.warn(
        {
          taskId: cancelled.taskId,
          taskRunId: cancelled.id,
          opencodeSessionId: cancelled.opencodeSessionId,
          noProgressMs: details.noProgressMs,
          lastStatus: details.lastStatus,
          requeueLimitReached: limitReached,
          requeueLimit: limitReached ? requeue.limit : undefined,
        },
        limitReached
          ? "stalled task run cancelled; requeue limit reached"
          : "stalled task run cancelled",
      );
    }

    scheduleAgentDrain(cancelled.agentId);
  }

  async function finalizeBlockedInteraction(
    run: TaskRun,
    details: TaskRunBlockedInteractionDetails,
  ): Promise<void> {
    const latest = await options.taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return;
    }

    await abortOpenCodeTaskRun(latest);

    // A blocked interaction means the agent is parked on a permission/question
    // that an automatic task run cannot answer — a human genuinely has to step in.
    // So it ends as an `error` run (it did not complete) but is flagged for human
    // review, which routes it to `review` and keeps it out of the auto-retry path
    // (retrying would just re-hit the same wall).
    const errorMessage = formatBlockedInteractionMessage(details);
    const errored = await options.taskService.setRunStatus(latest.id, "error", {
      completedAt: new Date().toISOString(),
      errorMessage,
      errorDetails: buildBlockedInteractionErrorDetails(latest, details),
      needsHumanReview: true,
      humanReviewReason: errorMessage,
    });

    if (!errored) {
      throw new NotFoundError("Task run not found.");
    }

    notifyRunTerminal(errored);
    options.logger?.warn(
      {
        taskId: errored.taskId,
        taskRunId: errored.id,
        opencodeSessionId: errored.opencodeSessionId,
        interactionType: details.interaction.type,
        requestId: details.interaction.id,
      },
      "task run blocked by pending OpenCode interaction",
    );
    scheduleAgentDrain(errored.agentId);
  }

  async function resolveRequeueSettings(): Promise<{ enabled: boolean; limit: number }> {
    const fallback = { enabled: false, limit: 10 };

    if (!options.monitorSettingsService) {
      return fallback;
    }

    try {
      const settings = await options.monitorSettingsService.get();
      return {
        enabled: settings.taskRunMonitorRequeueAfterStall,
        limit: settings.taskRunMonitorRequeueLimit,
      };
    } catch (error) {
      options.logger?.warn(
        { err: error },
        "task run monitor requeue setting read failed; defaulting to no requeue",
      );
      return fallback;
    }
  }

  function readRequeueCount(run: TaskRun): number {
    const value = run.triggerMetadata?.["requeueCount"];
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
  }

  // Max automatic re-queues per task/subtask chain after a system error/failure.
  // Bounds the auto-retry path so a repeatedly failing run cannot loop forever.
  async function resolveAutoRetryLimit(): Promise<number> {
    const fallback = 10;

    if (!options.monitorSettingsService) {
      return fallback;
    }

    try {
      const settings = await options.monitorSettingsService.get();
      return settings.taskRunMaxAutoRetries;
    } catch (error) {
      options.logger?.warn(
        { err: error },
        "task run auto-retry limit read failed; defaulting to 10",
      );
      return fallback;
    }
  }

  // Queue a fresh run of the same task/subtask after a stall cancellation. A new
  // run (not the cancelled row) is created so it gets a clean OpenCode session
  // instead of re-attaching to the wedged one via duplicate-prevention. The
  // requeue count carries forward so the chain stops at the configured limit.
  async function requeueStalledRun(cancelled: TaskRun, requeueCount: number): Promise<TaskRun> {
    return queueTask(cancelled.taskId, {
      agentId: cancelled.agentId,
      subtaskId: cancelled.subtaskId,
      triggerSource: "system",
      model: cancelled.model,
      fallbackModels: cancelled.fallbackModels,
      retryOfRunId: cancelled.id,
      context: {
        text: [
          "The previous run of this task was cancelled automatically because the OpenCode session stalled (it stopped producing output).",
          `Previous run id: ${cancelled.id}`,
          "It may have already changed workspace files. Inspect the current state before continuing, avoid redoing completed work, and finish the original task goal.",
        ].join("\n"),
        attachments: [],
      },
      metadata: {
        requeuedFromRunId: cancelled.id,
        requeueReason: "stall_timeout",
        requeueCount,
      },
    });
  }

  /**
   * Queue a fallback-model run for a provider/model error when one is eligible.
   * Used by both the synchronous start path and the async monitor. Returns the
   * queued fallback run, or undefined when no fallback applies.
   */
  async function queueFallbackRun(
    errored: TaskRun,
    error: unknown,
    log: { logMessage?: string } = {},
  ): Promise<TaskRun | undefined> {
    const fallback = buildFallbackRunInput(errored, error);

    if (!fallback) {
      return undefined;
    }

    notifyRunTerminal(errored);
    const fallbackRun = await queueTask(errored.taskId, fallback);
    options.logger?.warn(
      {
        taskId: errored.taskId,
        previousRunId: errored.id,
        fallbackRunId: fallbackRun.id,
        model: fallback.model,
      },
      log.logMessage ?? "task run monitor observed provider error, queued fallback model run",
    );
    return fallbackRun;
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
          answerBody: run.finalMessage ?? run.resultText ?? "No response text.",
          answeredAt: new Date().toISOString(),
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

// Render a stall window for the operator-facing cancellation reason. Production
// values are whole minutes, but the monitor config is in milliseconds and may be
// sub-minute (or non-integer minutes), so report what was actually configured.
function formatStallDuration(ms: number): string {
  if (ms < 60_000) {
    const seconds = Math.max(1, Math.round(ms / 1_000));
    return `${String(seconds)} second(s)`;
  }

  const minutes = ms / 60_000;
  const rounded = Number.isInteger(minutes) ? minutes : Math.round(minutes * 10) / 10;
  return `${String(rounded)} minute(s)`;
}

function formatBlockedInteractionMessage(details: TaskRunBlockedInteractionDetails): string {
  if (details.interaction.type === "permission") {
    return `Blocked by pending OpenCode permission: ${details.interaction.permission}.`;
  }

  return "Blocked by pending OpenCode question.";
}

function buildBlockedInteractionErrorDetails(
  run: TaskRun,
  details: TaskRunBlockedInteractionDetails,
): Record<string, unknown> {
  const base = {
    errorName: "TaskRunBlockedByOpenCodeInteraction",
    stage: "opencode_pending_interaction",
    taskRunId: run.id,
    taskId: run.taskId,
    opencodeSessionId: run.opencodeSessionId,
    monitorElapsedMs: details.monitorElapsedMs,
    lastStatus: details.lastStatus,
    lastAssistantMessageId: details.lastAssistantMessageId,
    interactionType: details.interaction.type,
    requestId: details.interaction.id,
    sessionID: details.interaction.sessionID,
    tool: details.interaction.tool,
  };

  if (details.interaction.type === "permission") {
    return {
      ...base,
      permission: details.interaction.permission,
      patterns: details.interaction.patterns,
      always: details.interaction.always,
      metadata: details.interaction.metadata,
    };
  }

  return {
    ...base,
    questions: details.interaction.questions,
    questionCount: details.interaction.questions.length,
  };
}

function readScheduledAtFromTrigger(trigger: QueueTaskInput): string | undefined {
  const scheduledAt = trigger.metadata?.["scheduledAt"];
  return typeof scheduledAt === "string" ? scheduledAt : undefined;
}

function hasTerminalSubtaskRun(subtaskId: string, runs: TaskRun[]): boolean {
  return runs.some(
    (run) => run.subtaskId === subtaskId && run.status !== "queued" && run.status !== "running",
  );
}

// `runs` is ordered created_at desc, so the first match is the subtask's latest
// run. Retry eligibility is decided by the latest run only, so a successful retry
// clears an earlier transient failure.
function latestSubtaskRun(subtaskId: string, runs: TaskRun[]): TaskRun | undefined {
  return runs.find((run) => run.subtaskId === subtaskId);
}

// Latest run is an intentional human-review hand-off. Terminal: never auto-retried.
function latestSubtaskRunNeedsReview(subtaskId: string, runs: TaskRun[]): boolean {
  const latest = latestSubtaskRun(subtaskId, runs);
  if (!latest) {
    return false;
  }

  return latest.outcome === "needs_human_review" || latest.needsHumanReview;
}

// Latest run is a system-defined failure (errored/failed/cancelled, or a `failed`
// outcome). Eligible for bounded automatic retry. A human-review hand-off wins, so
// a run flagged for review (e.g. blocked on input) is never treated as retryable.
function latestSubtaskRunErrored(subtaskId: string, runs: TaskRun[]): boolean {
  const latest = latestSubtaskRun(subtaskId, runs);
  if (!latest || latestSubtaskRunNeedsReview(subtaskId, runs)) {
    return false;
  }

  return (
    latest.status === "failed" ||
    latest.status === "error" ||
    latest.status === "cancelled" ||
    latest.outcome === "failed"
  );
}
