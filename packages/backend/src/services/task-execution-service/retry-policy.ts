// Fallback-model + stall/requeue retry policy, split out of
// task-execution-service.ts (issue #99). The core run loop injects it via ctx.

import type { QueueTaskExecutionInput } from "../task-execution-service.js";
import type { TaskExecutionServiceOptions } from "./context.js";
import type { TaskRun } from "@cc/shared/schemas";
import { NotFoundError } from "../../lib/api-error.js";
import { TaskRunPromptError } from "../conversation-service.js";
import type {
  TaskRunBlockedInteractionDetails,
  TaskRunModelNotFoundDetails,
  TaskRunStallDetails,
  TaskRunUsageLimitDetails,
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

export function buildStallErrorDetails(
  run: TaskRun,
  details: TaskRunStallDetails,
): Record<string, unknown> {
  return {
    errorName: "TaskRunStallTimeout",
    stage: "monitor_stall",
    taskRunId: run.id,
    taskId: run.taskId,
    opencodeSessionId: run.opencodeSessionId,
    noProgressMs: details.noProgressMs,
    monitorElapsedMs: details.monitorElapsedMs,
    lastStatus: details.lastStatus,
    lastAssistantMessageId: details.lastAssistantMessageId,
  };
}

export function formatUsageLimitMessage(
  details: TaskRunUsageLimitDetails,
  fallbackModel?: string,
): string {
  const base =
    `Provider retry status persisted for ${formatStallDuration(details.retryElapsedMs)} ` +
    `(model: ${details.attemptedModel}): ${details.message}`;

  return fallbackModel
    ? `${base} Retrying automatically with fallback model ${fallbackModel}.`
    : base;
}

export function buildUsageLimitErrorDetails(
  run: TaskRun,
  details: TaskRunUsageLimitDetails,
  fallbackModel?: string,
): Record<string, unknown> {
  const slash = details.attemptedModel.indexOf("/");
  const provider = slash > 0 ? details.attemptedModel.slice(0, slash) : details.attemptedModel;

  return {
    errorName: "UsageLimitReached",
    stage: "opencode_session_retry",
    taskRunId: run.id,
    taskId: run.taskId,
    opencodeSessionId: run.opencodeSessionId,
    attemptedModel: details.attemptedModel,
    provider,
    retryAttempt: details.attempt,
    retryMessage: details.message,
    retryNextAtMs: details.next,
    retryElapsedMs: details.retryElapsedMs,
    monitorElapsedMs: details.monitorElapsedMs,
    lastAssistantMessageId: details.lastAssistantMessageId,
    fallbackQueued: fallbackModel !== undefined,
    ...(fallbackModel ? { fallbackModel } : {}),
  };
}

export function formatModelNotFoundMessage(
  details: TaskRunModelNotFoundDetails,
  fallbackModel?: string,
): string {
  const base =
    `Model not found (attempted model: ${details.attemptedModel}): ${details.message} ` +
    `The model does not exist or is unavailable, so automatic retries were stopped.`;

  return fallbackModel
    ? `${base} Retrying automatically with fallback model ${fallbackModel}.`
    : base;
}

export function buildModelNotFoundErrorDetails(
  run: TaskRun,
  details: TaskRunModelNotFoundDetails,
): Record<string, unknown> {
  const slash = details.attemptedModel.indexOf("/");
  const provider = slash > 0 ? details.attemptedModel.slice(0, slash) : details.attemptedModel;

  return {
    errorName: "ModelNotFound",
    stage: "opencode_session_retry",
    taskRunId: run.id,
    taskId: run.taskId,
    opencodeSessionId: run.opencodeSessionId,
    attemptedModel: details.attemptedModel,
    provider,
    retryAttempt: details.attempt,
    retryMessage: details.message,
    monitorElapsedMs: details.monitorElapsedMs,
    lastAssistantMessageId: details.lastAssistantMessageId,
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

    // errorDetails distinguishes this system-initiated cancellation (surfaced as
    // a task_run_failed activity, same as any other failure) from a manual
    // cancel via the `cancel` API, which carries no errorDetails and stays
    // silent since the user already knows they cancelled it. errorMessage is
    // also set (mirroring cancellationReason) so that activity's notification
    // body isn't left empty.
    const cancelled = await options.taskService.setRunStatus(latest.id, "cancelled", {
      cancelledAt: new Date().toISOString(),
      cancellationReason,
      errorMessage: cancellationReason,
      errorDetails: buildStallErrorDetails(latest, details),
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

  async function finalizeUsageLimitRun(
    run: TaskRun,
    details: TaskRunUsageLimitDetails,
  ): Promise<void> {
    const latest = await options.taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return;
    }

    await abortOpenCodeTaskRun(latest);

    // A usage/rate limit is provider-wide, not model-specific, so a fallback on
    // the *same* provider would just hit the same wall. Only a different
    // provider's fallback model is worth an automatic retry here.
    const fallback = selectDifferentProviderFallbackModel(
      details.attemptedModel,
      latest.fallbackModels,
    );

    // The run must be marked terminal *before* queueing a fallback: `queueTask`
    // rejects a new run for a task that still has an active (running) run.
    // Label it generically first; if a fallback is actually queued below, the
    // label is corrected before the single notifyRunTerminal call fires.
    const errored = await options.taskService.setRunStatus(latest.id, "error", {
      completedAt: new Date().toISOString(),
      errorMessage: formatUsageLimitMessage(details),
      errorDetails: buildUsageLimitErrorDetails(latest, details),
    });

    if (!errored) {
      throw new NotFoundError("Task run not found.");
    }

    let fallbackRun: TaskRun | undefined;

    if (fallback) {
      try {
        fallbackRun = await queueTask(errored.taskId, {
          agentId: errored.agentId,
          subtaskId: errored.subtaskId,
          triggerSource: "system",
          model: fallback.model,
          fallbackModels: fallback.remaining,
          retryOfRunId: errored.id,
          context: {
            text: [
              "Previous task run ended because the provider reported a sustained usage/rate limit.",
              `Previous run id: ${errored.id}`,
              `Attempted model: ${details.attemptedModel}`,
              `Provider message: ${details.message}`,
              "The previous attempt may have already changed workspace files. Inspect the current workspace state before continuing, avoid duplicating completed work, and finish the original task goal.",
            ].join("\n"),
            attachments: [],
          },
          metadata: {
            fallbackOfRunId: errored.id,
            attemptedModel: details.attemptedModel,
            errorName: "UsageLimitReached",
          },
        });
      } catch (error) {
        options.logger?.error(
          { err: error, taskId: errored.taskId, taskRunId: errored.id },
          "failed to queue usage-limit fallback run; finalizing without fallback",
        );
      }
    }

    const finalized = fallbackRun
      ? ((await options.taskService.updateRun(errored.id, {
          errorMessage: formatUsageLimitMessage(details, fallback?.model),
          errorDetails: buildUsageLimitErrorDetails(latest, details, fallback?.model),
        })) ?? errored)
      : errored;

    notifyRunTerminal(finalized);

    if (fallbackRun) {
      options.logger?.warn(
        {
          taskId: finalized.taskId,
          previousRunId: finalized.id,
          fallbackRunId: fallbackRun.id,
          model: fallback?.model,
        },
        "task run hit usage limit; queued fallback model run on a different provider",
      );
    } else {
      options.logger?.warn(
        {
          taskId: finalized.taskId,
          taskRunId: finalized.id,
          opencodeSessionId: finalized.opencodeSessionId,
          attemptedModel: details.attemptedModel,
          retryAttempt: details.attempt,
          retryElapsedMs: details.retryElapsedMs,
        },
        "task run finalized: sustained provider retry status treated as usage limit; no fallback available",
      );
    }

    scheduleAgentDrain(finalized.agentId);
  }

  async function finalizeModelNotFoundRun(
    run: TaskRun,
    details: TaskRunModelNotFoundDetails,
  ): Promise<void> {
    const latest = await options.taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return;
    }

    // OpenCode is still actively retrying the missing model, so abort the session
    // before finalizing or it would keep looping in the background.
    await abortOpenCodeTaskRun(latest);

    // Synthesize a model/provider error so this routes through the same fallback
    // machinery as an error surfaced directly in an assistant message. A missing
    // model is model-specific (not provider-wide), so a valid fallback model —
    // even on the same provider — is eligible (see selectNextFallbackModel).
    const error = new TaskRunPromptError({
      modelError: {
        name: "APIError",
        message: details.message,
        data: {
          statusCode: 404,
          isRetryable: false,
          retryAttempt: details.attempt,
        },
      },
      attemptedModel: details.attemptedModel,
    });

    const errored = await options.taskService.setRunStatus(latest.id, "error", {
      completedAt: new Date().toISOString(),
      errorMessage: formatModelNotFoundMessage(details),
      errorDetails: buildModelNotFoundErrorDetails(latest, details),
    });

    if (!errored) {
      throw new NotFoundError("Task run not found.");
    }

    // queueFallbackRun fires notifyRunTerminal itself when it queues a fallback;
    // when none is eligible it returns undefined and we finalize the run here.
    const fallbackRun = await queueFallbackRun(errored, error, {
      logMessage: "task run targeted a non-existent model; queued fallback model run",
    });

    if (fallbackRun) {
      return;
    }

    notifyRunTerminal(errored);
    options.logger?.warn(
      {
        taskId: errored.taskId,
        taskRunId: errored.id,
        opencodeSessionId: errored.opencodeSessionId,
        attemptedModel: details.attemptedModel,
        retryAttempt: details.attempt,
      },
      "task run finalized: model not found and no eligible fallback model available",
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

  // A usage/rate limit applies to the whole provider account, so (unlike
  // selectNextFallbackModel) same-provider models are always skipped, not just
  // for ProviderAuthError.
  function selectDifferentProviderFallbackModel(
    attemptedModel: string,
    fallbackModels: string[],
  ): { model: string; remaining: string[] } | undefined {
    const attemptedProvider = readProvider(attemptedModel);

    for (let index = 0; index < fallbackModels.length; index += 1) {
      const model = fallbackModels[index]!;

      if (readProvider(model) === attemptedProvider) {
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
    finalizeUsageLimitRun,
    finalizeModelNotFoundRun,
    resolveAutoRetryLimit,
    readRequeueCount,
  };
}
