// Fallback-model + stall/requeue retry policy, split out of
// task-execution-service.ts (issue #99). The core run loop injects it via ctx.

import type { TaskRun } from "@cc/shared/schemas";
import { NotFoundError } from "../../lib/api-error.js";
import {
  PROVIDER_MODEL_NOT_FOUND_ERROR_NAME,
  readProviderModelNotFoundError,
} from "../../lib/provider-model-not-found.js";
import { TaskRunPromptError } from "../conversation-service.js";
import type {
  TaskRunBlockedInteractionDetails,
  TaskRunModelNotFoundDetails,
  TaskRunStallDetails,
  TaskRunUsageLimitDetails,
} from "../task-run-monitor-service.js";
import type { TaskExecutionServiceOptions } from "./context.js";

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
  const providerError = readProviderModelNotFoundError(
    { name: PROVIDER_MODEL_NOT_FOUND_ERROR_NAME, message: details.message },
    details.attemptedModel,
  );
  const base = `${providerError?.message ?? details.message} Automatic retries were stopped.`;

  return fallbackModel
    ? `${base} Retrying automatically with fallback model ${fallbackModel}.`
    : base;
}

export function buildModelNotFoundErrorDetails(
  run: TaskRun,
  details: TaskRunModelNotFoundDetails,
): Record<string, unknown> {
  const providerError = readProviderModelNotFoundError(
    { name: PROVIDER_MODEL_NOT_FOUND_ERROR_NAME, message: details.message },
    details.attemptedModel,
  );

  return {
    errorName: PROVIDER_MODEL_NOT_FOUND_ERROR_NAME,
    stage: "opencode_session_retry",
    taskRunId: run.id,
    taskId: run.taskId,
    opencodeSessionId: run.opencodeSessionId,
    ...providerError?.details,
    retryAttempt: details.attempt,
    retryMessage: details.message,
    monitorElapsedMs: details.monitorElapsedMs,
    lastAssistantMessageId: details.lastAssistantMessageId,
  };
}

export function createTaskRetryPolicy(ctx: {
  options: TaskExecutionServiceOptions;
  notifyRunTerminal: (run: TaskRun) => void;
  scheduleAgentDrain: (agentId: string) => void;
  abortOpenCodeTaskRun: (run: TaskRun) => Promise<void>;
  cancelRun: (id: string, input: { reason: string }) => Promise<TaskRun>;
}) {
  const { options, notifyRunTerminal, scheduleAgentDrain, abortOpenCodeTaskRun } = ctx;

  async function stopRun(
    run: TaskRun,
    message: string,
    details: Record<string, unknown>,
    review = false,
  ): Promise<TaskRun | undefined> {
    const latest = await options.taskService.getRunById(run.id);
    if (!latest || latest.status !== "running") return undefined;
    await abortOpenCodeTaskRun(latest);
    const stopped = await options.taskService.setRunStatus(run.id, "error", {
      completedAt: new Date().toISOString(),
      errorMessage: message,
      errorDetails: details,
      needsHumanReview: review,
      ...(review ? { humanReviewReason: message } : {}),
    });
    if (!stopped) throw new NotFoundError("Task run not found.");
    return stopped;
  }

  function finish(run: TaskRun): void {
    notifyRunTerminal(run);
    scheduleAgentDrain(run.agentId);
  }

  async function queueModelContinuation(
    run: TaskRun,
    selected: { model: string; remaining: string[] } | undefined,
  ): Promise<TaskRun | undefined> {
    if (!selected || !run.opencodeSessionId) return undefined;
    await options.taskService.updateRun(run.id, { fallbackModels: selected.remaining });
    await options.taskService.insertFollowup(
      run,
      {
        body: "Continue the current task after the model/provider failure. Inspect the existing conversation and workspace; do not repeat completed actions.",
        model: selected.model,
        requestId: `recovery:${run.id}:${run.startedAt}:${selected.model}`,
      },
      "recovery",
    );
    finish(run);
    return run;
  }

  async function queueFallbackRun(
    run: TaskRun,
    error: unknown,
    _log?: { logMessage?: string },
  ): Promise<TaskRun | undefined> {
    if (!(error instanceof TaskRunPromptError) || !isFallbackEligible(error)) return undefined;
    return queueModelContinuation(run, selectNextFallbackModel(error, run.fallbackModels));
  }

  async function finalizeStalledRun(run: TaskRun, details: TaskRunStallDetails): Promise<void> {
    const latest = await options.taskService.getRunById(run.id);
    if (latest?.status !== "running") return;
    const reason = `Automatically cancelled: OpenCode produced no new output for ${formatStallDuration(details.noProgressMs)} (stall timeout); session ${run.opencodeSessionId ?? "unavailable"}. Inspect and Continue this execution, or duplicate the task.`;
    const stopped = await ctx.cancelRun(run.id, { reason });
    await options.taskService.updateRun(stopped.id, {
      errorMessage: reason,
      errorDetails: buildStallErrorDetails(run, details),
    });
  }

  async function finalizeInterruptedRun(
    run: TaskRun,
    details: { lastAssistantMessageId?: string },
  ): Promise<void> {
    const latest = await options.taskService.getRunById(run.id);
    if (latest?.status !== "running") return;
    const reason =
      "Automatically cancelled: engine interruption during an incomplete assistant turn. Inspect and Continue this execution, or duplicate the task if the session is unavailable.";
    const stopped = await ctx.cancelRun(run.id, { reason });
    await options.taskService.updateRun(stopped.id, {
      errorMessage: reason,
      errorDetails: {
        errorName: "TaskRunEngineInterrupted",
        stage: "task_session_interrupted",
        opencodeSessionId: run.opencodeSessionId,
        ...details,
      },
    });
  }

  async function finalizeBlockedInteraction(
    run: TaskRun,
    details: TaskRunBlockedInteractionDetails,
  ): Promise<void> {
    const stopped = await stopRun(
      run,
      formatBlockedInteractionMessage(details),
      buildBlockedInteractionErrorDetails(run, details),
      true,
    );
    if (stopped) finish(stopped);
  }

  async function finalizeUsageLimitRun(
    run: TaskRun,
    details: TaskRunUsageLimitDetails,
  ): Promise<void> {
    const stopped = await stopRun(
      run,
      formatUsageLimitMessage(details),
      buildUsageLimitErrorDetails(run, details),
    );
    if (!stopped) return;
    if (
      !(await queueModelContinuation(
        stopped,
        selectDifferentProviderFallbackModel(details.attemptedModel, stopped.fallbackModels),
      ))
    )
      finish(stopped);
  }

  async function finalizeModelNotFoundRun(
    run: TaskRun,
    details: TaskRunModelNotFoundDetails,
  ): Promise<void> {
    const stopped = await stopRun(
      run,
      formatModelNotFoundMessage(details),
      buildModelNotFoundErrorDetails(run, details),
    );
    if (!stopped) return;
    const error = new TaskRunPromptError({
      attemptedModel: details.attemptedModel,
      modelError: { name: "APIError", message: details.message, data: { statusCode: 404 } },
    });
    if (!(await queueFallbackRun(stopped, error))) finish(stopped);
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
    finalizeInterruptedRun,
    finalizeBlockedInteraction,
    finalizeUsageLimitRun,
    finalizeModelNotFoundRun,
  };
}
