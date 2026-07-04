// Fallback-model + stall/requeue retry policy, split out of
// task-execution-service.ts (issue #99). The core run loop injects it via ctx.

import type { QueueTaskExecutionInput } from "../task-execution-service.js";
import type { TaskExecutionServiceOptions } from "./context.js";
import type { TaskRun } from "@cc/shared/schemas";
import { NotFoundError } from "../../lib/api-error.js";
import { TaskRunPromptError } from "../conversation-service.js";
import type {
  TaskRunBlockedInteractionDetails,
  TaskRunStallDetails,
} from "../task-run-monitor-service.js";

export function formatStallDuration(ms: number): string {
  if (ms < 60_000) {
    const seconds = Math.max(1, Math.round(ms / 1_000));
    return `${String(seconds)} second(s)`;
  }

  const minutes = ms / 60_000;
  const rounded = Number.isInteger(minutes) ? minutes : Math.round(minutes * 10) / 10;
  return `${String(rounded)} minute(s)`;
}

export function formatBlockedInteractionMessage(details: TaskRunBlockedInteractionDetails): string {
  if (details.interaction.type === "permission") {
    return `Blocked by pending OpenCode permission: ${details.interaction.permission}.`;
  }

  return "Blocked by pending OpenCode question.";
}

export function buildBlockedInteractionErrorDetails(
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

export interface TaskRetryPolicyContext {
  options: TaskExecutionServiceOptions;
  queueTask: (taskId: string, input?: QueueTaskExecutionInput) => Promise<TaskRun>;
  notifyRunTerminal: (run: TaskRun) => void;
  scheduleAgentDrain: (agentId: string) => void;
  abortOpenCodeTaskRun: (run: TaskRun) => Promise<void>;
}

export function createTaskRetryPolicy(ctx: TaskRetryPolicyContext) {
  const { options, queueTask, notifyRunTerminal, scheduleAgentDrain, abortOpenCodeTaskRun } = ctx;

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

  return {
    queueFallbackRun,
    finalizeStalledRun,
    finalizeBlockedInteraction,
    resolveAutoRetryLimit,
    readRequeueCount,
  };
}
