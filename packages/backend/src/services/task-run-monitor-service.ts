import type { ConversationDetail, ConversationMessage, TaskRun } from "@cc/shared/schemas";
import type { Logger } from "pino";

import { NotFoundError } from "../lib/api-error.js";
import {
  TaskRunPromptError,
  type ConversationService,
  type TaskRunPendingInteraction,
} from "./conversation-service.js";
import type { TaskService } from "./task-service.js";
import {
  buildTaskRunErrorDetails,
  mergeOpencodeMonitorMetadata,
  readElapsedRunMs,
  readLatestAssistantMessage,
  readOptionalOpencodeMonitorMetadata,
  summarizeTaskRunConversation,
  type OpencodeMonitorMetadata,
  type TaskRunTransport,
} from "./task-run-support.js";

export type TaskRunMonitorOptions = {
  autoStart?: boolean;
  initialPollMs?: number;
  maxPollMs?: number;
  idlePolls?: number;
  maxLifetimeMs?: number;
  /** No-progress (stall) timeout. `<= 0` disables stall detection. */
  noProgressMs?: number;
  /**
   * How long a sustained provider `retry` status may persist before finalizing
   * as a usage-limit error instead of waiting for the stall timeout. `<= 0`
   * disables fail-fast detection.
   */
  retryFailFastMs?: number;
};

export type TaskRunMonitorConfig = Required<TaskRunMonitorOptions>;

export const DEFAULT_TASK_RUN_MONITOR_CONFIG: TaskRunMonitorConfig = {
  autoStart: true,
  initialPollMs: 2_000,
  maxPollMs: 10_000,
  idlePolls: 2,
  maxLifetimeMs: 6 * 60 * 60 * 1_000,
  noProgressMs: 30 * 60 * 1_000,
  retryFailFastMs: 2 * 60 * 1_000,
};

/** Runtime-resolvable timeouts; can change between polls (e.g. from settings). */
export type TaskRunMonitorRuntimeConfig = {
  maxLifetimeMs: number;
  noProgressMs: number;
  retryFailFastMs: number;
};

type TaskRunMonitorHandle = {
  runId: string;
  startedAtMs: number;
  delayMs: number;
  idleCount: number;
  lastStatus?: string;
  lastAssistantMessageId?: string;
  lastProgressAtMs: number;
  lastSignature?: string;
  /** Set when a `retry` status is first observed; cleared once status changes. */
  retryStatusSinceMs?: number;
  stopped: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

/**
 * Business operations the monitor delegates back to task execution after a run
 * settles. The monitor owns the polling/settle-detection state machine; the
 * execution service owns terminal task handling and fallback-model queueing.
 */
export type TaskRunStallDetails = {
  noProgressMs: number;
  monitorElapsedMs: number;
  lastStatus?: string;
  lastAssistantMessageId?: string;
};

export type TaskRunBlockedInteractionDetails = {
  interaction: TaskRunPendingInteraction;
  monitorElapsedMs: number;
  lastStatus?: string;
  lastAssistantMessageId?: string;
};

export type TaskRunUsageLimitDetails = {
  attempt: number;
  message: string;
  /** OpenCode's next-retry timestamp (epoch ms). */
  next: number;
  attemptedModel: string;
  retryElapsedMs: number;
  monitorElapsedMs: number;
  lastAssistantMessageId?: string;
};

/**
 * Same shape as a usage-limit finalization; the run is finalized because the
 * targeted model is unknown/invalid rather than because a limit was hit.
 */
export type TaskRunModelNotFoundDetails = TaskRunUsageLimitDetails;

export type TaskRunMonitorHooks = {
  /** Run terminal handling (archive finalization, feedback subtasks, queue drain). */
  handleTerminalRun(run: TaskRun): Promise<void>;
  /**
   * Queue a fallback-model run for a provider/model error when eligible. Returns
   * the queued run, or undefined when no fallback applies (then the monitor runs
   * normal terminal handling for the errored run).
   */
  queueFallbackRun(errored: TaskRun, error: TaskRunPromptError): Promise<TaskRun | undefined>;
  /**
   * Finalize a stalled run: best-effort abort the wedged session, cancel the run
   * with a clear reason, and optionally requeue it (per settings). Owns all the
   * cancel/requeue policy; the monitor only detects the stall.
   */
  finalizeStalledRun(run: TaskRun, details: TaskRunStallDetails): Promise<void>;
  /** Mark a task run as needing review when OpenCode is waiting for hidden input. */
  finalizeBlockedInteraction(
    run: TaskRun,
    details: TaskRunBlockedInteractionDetails,
  ): Promise<void>;
  /**
   * Finalize a run stuck on a sustained provider `retry` status (e.g. a rate or
   * usage limit) once it has persisted past the fail-fast threshold, rather than
   * waiting for the much larger stall timeout. Owns the terminal/error policy;
   * the monitor only detects the sustained retry.
   */
  finalizeUsageLimitRun(run: TaskRun, details: TaskRunUsageLimitDetails): Promise<void>;
  /**
   * Finalize a run whose provider `retry` status reports a non-existent/invalid
   * model. Retrying can never succeed, so this fails fast: abort the session,
   * mark the run errored, and queue a different-model fallback when configured.
   */
  finalizeModelNotFoundRun(run: TaskRun, details: TaskRunModelNotFoundDetails): Promise<void>;
};

export type TaskRunMonitorService = ReturnType<typeof createTaskRunMonitorService>;

export function createTaskRunMonitorService(deps: {
  taskService: Pick<TaskService, "getRunById" | "updateRun" | "setRunStatus">;
  conversationService?: ConversationService;
  transport: TaskRunTransport;
  config: TaskRunMonitorConfig;
  hooks: TaskRunMonitorHooks;
  /**
   * Resolve the current timeouts each poll so settings changes apply to in-flight
   * monitors. Falls back to the static config defaults when omitted or on error.
   */
  resolveRuntimeConfig?: () => Promise<TaskRunMonitorRuntimeConfig>;
  logger?: Logger;
}) {
  const { taskService, transport, config, hooks, logger } = deps;
  const monitors = new Map<string, TaskRunMonitorHandle>();

  return {
    /** Idempotent per run id: returns immediately if a monitor is already active. */
    start(runId: string): void {
      if (!deps.conversationService || monitors.has(runId)) {
        return;
      }

      const now = Date.now();
      const handle: TaskRunMonitorHandle = {
        runId,
        startedAtMs: now,
        delayMs: config.initialPollMs,
        idleCount: 0,
        lastProgressAtMs: now,
        stopped: false,
      };
      monitors.set(runId, handle);
      schedule(handle, 0);
    },

    has(runId: string): boolean {
      return monitors.has(runId);
    },

    dispose(): void {
      for (const handle of monitors.values()) {
        stop(handle);
      }

      monitors.clear();
    },
  };

  function stop(handle: TaskRunMonitorHandle): void {
    handle.stopped = true;

    if (handle.timer) {
      clearTimeout(handle.timer);
      handle.timer = undefined;
    }
  }

  function schedule(handle: TaskRunMonitorHandle, delayMs: number): void {
    if (handle.stopped) {
      return;
    }

    handle.timer = setTimeout(() => {
      void tick(handle);
    }, delayMs);
    handle.timer.unref?.();
  }

  async function tick(handle: TaskRunMonitorHandle): Promise<void> {
    if (handle.stopped) {
      return;
    }

    try {
      const done = await poll(handle);

      if (done) {
        monitors.delete(handle.runId);
        stop(handle);
        return;
      }

      schedule(handle, handle.delayMs);
    } catch (error) {
      logger?.warn({ err: error, runId: handle.runId }, "task run monitor poll failed; will retry");
      handle.idleCount = 0;
      handle.delayMs = nextMonitorDelay(handle.delayMs);
      schedule(handle, handle.delayMs);
    }
  }

  async function poll(handle: TaskRunMonitorHandle): Promise<boolean> {
    const run = await taskService.getRunById(handle.runId);

    if (!run || run.status !== "running") {
      return true;
    }

    if (!deps.conversationService || !run.opencodeSessionId) {
      return true;
    }

    const runtime = await resolveRuntimeConfig();

    if (isMonitorTimedOut(handle, run, runtime.maxLifetimeMs)) {
      return finalizeTimeout(handle, run);
    }

    let statusType: string | undefined;
    let statusKnown = false;
    let retryStatus: { attempt: number; message: string; next: number } | undefined;

    try {
      const status = await transport.getSessionStatus(run);
      statusType = status.type;
      statusKnown = true;
      handle.lastStatus = status.type;
      if (status.type === "retry") {
        retryStatus = { attempt: status.attempt, message: status.message, next: status.next };
      }
    } catch (error) {
      logger?.warn(
        { err: error, runId: run.id, opencodeSessionId: run.opencodeSessionId },
        "task run monitor status read failed; will keep monitoring without advancing idle settle",
      );
    }

    const conversation = await transport.syncConversation(run);
    const monitorMetadata = await ensureOpencodeMonitorMetadata(run, conversation);
    const latestAssistant = readLatestAssistantMessage(
      conversation.messages.slice(monitorMetadata.baselineMessageCount),
    );

    if (latestAssistant?.id) {
      handle.lastAssistantMessageId = latestAssistant.id;
    }

    // Progress = the session produced new content. Deliberately excludes session
    // status, so a wedged-but-busy session (no new messages) trips the stall
    // timeout while status flapping does not reset it.
    const signature = `${String(conversation.messageCount)}|${latestAssistant?.id ?? ""}`;
    if (signature !== handle.lastSignature) {
      handle.lastSignature = signature;
      handle.lastProgressAtMs = Date.now();
    }

    // A provider error in the assistant message is a definitive terminal signal,
    // so finalize it regardless of whether the status read succeeded.
    if (latestAssistant?.error) {
      return finalizeModelError(run, latestAssistant.error, monitorMetadata.attemptedModel);
    }

    const pendingInteractions = await transport.getPendingInteractions(run);
    const pendingInteraction = pendingInteractions[0];

    if (pendingInteraction) {
      return finalizeBlockedInteraction(handle, run, pendingInteraction);
    }

    // A `retry` status reporting a non-existent/invalid model will never succeed
    // on retry — the model simply does not exist. Fail fast immediately (no
    // persistence threshold, unlike the usage-limit case below) instead of
    // burning the much larger stall timeout, routing it through the model-error
    // fallback path so a valid fallback model can take over.
    if (retryStatus && isModelNotFoundRetryMessage(retryStatus.message)) {
      return finalizeModelNotFound(handle, run, retryStatus, monitorMetadata.attemptedModel);
    }

    // A sustained provider `retry` status that reads as a usage/rate limit
    // produces no new messages, so left alone it would only be caught by the
    // much larger stall timeout. Finalize it fast and labeled once it persists
    // past the threshold. Any other `retry` reason (e.g. a transient blip) is
    // deliberately left to the ordinary stall timeout below instead.
    if (retryStatus && isUsageLimitRetryMessage(retryStatus.message)) {
      handle.retryStatusSinceMs ??= Date.now();
      const retryElapsedMs = Date.now() - handle.retryStatusSinceMs;

      if (runtime.retryFailFastMs > 0 && retryElapsedMs >= runtime.retryFailFastMs) {
        return finalizeUsageLimit(
          handle,
          run,
          retryStatus,
          monitorMetadata.attemptedModel,
          retryElapsedMs,
        );
      }
    } else {
      handle.retryStatusSinceMs = undefined;
    }

    // OpenCode stopped making progress (e.g. the agent loop wedged on a provider
    // or tool). Finalize as a stall instead of holding the run until the much
    // larger max-lifetime cap.
    if (runtime.noProgressMs > 0 && Date.now() - handle.lastProgressAtMs >= runtime.noProgressMs) {
      return finalizeStalled(handle, run, runtime.noProgressMs);
    }

    if (statusType === "busy" || statusType === "retry") {
      handle.idleCount = 0;
      handle.delayMs = nextMonitorDelay(handle.delayMs);
      return false;
    }

    if (!statusKnown) {
      // OpenCode status is temporarily unavailable. Do not let an existing
      // assistant message advance idle-settle detection, or the run could be
      // marked completed while OpenCode is still busy. Keep polling with backoff
      // until status is known again (or the monitor lifetime times out).
      handle.idleCount = 0;
      handle.delayMs = nextMonitorDelay(handle.delayMs);
      return false;
    }

    if (!latestAssistant) {
      handle.idleCount = 0;
      handle.delayMs = config.initialPollMs;
      return false;
    }

    handle.idleCount += 1;
    handle.delayMs = config.initialPollMs;

    if (handle.idleCount < config.idlePolls) {
      return false;
    }

    return finalizeCompletion(run, conversation);
  }

  async function ensureOpencodeMonitorMetadata(
    run: TaskRun,
    conversation: ConversationDetail,
  ): Promise<OpencodeMonitorMetadata> {
    const existing = readOptionalOpencodeMonitorMetadata(run);

    if (existing) {
      return existing;
    }

    // A run can reach the monitor without persisted monitor metadata: startup
    // resume of a running run, or a duplicate start with no accepted-prompt
    // evidence. Reconstruct conservative metadata (baseline 0 so every synced
    // message is in scope, unknown attempted model) and persist it so the monitor
    // settles deterministically instead of throwing on every tick.
    const reconstructed: OpencodeMonitorMetadata = {
      conversationId: conversation.id,
      opencodeSessionId: run.opencodeSessionId ?? conversation.opencodeSessionId,
      attemptedModel: "unknown",
      baselineMessageCount: 0,
      promptAcceptedAt: new Date().toISOString(),
    };

    const updated = await taskService.updateRun(run.id, {
      triggerMetadata: mergeOpencodeMonitorMetadata(run.triggerMetadata, reconstructed),
    });

    if (!updated) {
      throw new NotFoundError("Task run not found.");
    }

    logger?.warn(
      {
        taskId: run.taskId,
        taskRunId: run.id,
        opencodeSessionId: reconstructed.opencodeSessionId,
        conversationId: reconstructed.conversationId,
      },
      "task run monitor recovered missing OpenCode monitor metadata",
    );
    return reconstructed;
  }

  async function finalizeCompletion(
    run: TaskRun,
    conversation: { id: string; messageCount: number; messages: ConversationMessage[] },
  ): Promise<boolean> {
    const latest = await taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return true;
    }

    const completed = await taskService.setRunStatus(latest.id, "completed", {
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

    await hooks.handleTerminalRun(completed);
    return true;
  }

  async function finalizeModelError(
    run: TaskRun,
    modelError: TaskRunPromptError["modelError"],
    attemptedModel: string,
  ): Promise<boolean> {
    const latest = await taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return true;
    }

    const error = new TaskRunPromptError({ modelError, attemptedModel });
    const errored = await taskService.setRunStatus(latest.id, "error", {
      completedAt: new Date().toISOString(),
      errorMessage: error.message,
      errorDetails: buildTaskRunErrorDetails(error, latest),
    });

    if (!errored) {
      throw new NotFoundError("Task run not found.");
    }

    const fallbackRun = await hooks.queueFallbackRun(errored, error);
    if (fallbackRun) {
      return true;
    }

    await hooks.handleTerminalRun(errored);
    return true;
  }

  async function finalizeTimeout(handle: TaskRunMonitorHandle, run: TaskRun): Promise<boolean> {
    let conversation:
      | { id: string; messageCount: number; messages: ConversationMessage[] }
      | undefined;

    try {
      conversation = deps.conversationService ? await transport.syncConversation(run) : undefined;
      const monitorMetadata = readOptionalOpencodeMonitorMetadata(run);
      const latestAssistant = readLatestAssistantMessage(
        conversation?.messages.slice(monitorMetadata?.baselineMessageCount ?? 0) ?? [],
      );

      if (latestAssistant?.id) {
        handle.lastAssistantMessageId = latestAssistant.id;
      }
    } catch (error) {
      logger?.warn({ err: error, runId: run.id }, "task run monitor timeout sync failed");
    }

    const latest = await taskService.getRunById(run.id);

    if (!latest || latest.status !== "running") {
      return true;
    }

    const errored = await taskService.setRunStatus(latest.id, "error", {
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

    await hooks.handleTerminalRun(errored);
    return true;
  }

  async function resolveRuntimeConfig(): Promise<TaskRunMonitorRuntimeConfig> {
    const fallback: TaskRunMonitorRuntimeConfig = {
      maxLifetimeMs: config.maxLifetimeMs,
      noProgressMs: config.noProgressMs,
      retryFailFastMs: config.retryFailFastMs,
    };

    if (!deps.resolveRuntimeConfig) {
      return fallback;
    }

    try {
      return await deps.resolveRuntimeConfig();
    } catch (error) {
      logger?.warn(
        { err: error },
        "task run monitor runtime config resolve failed; using static defaults",
      );
      return fallback;
    }
  }

  async function finalizeStalled(
    handle: TaskRunMonitorHandle,
    run: TaskRun,
    noProgressMs: number,
  ): Promise<boolean> {
    // The execution service owns the cancel + optional-requeue policy; the monitor
    // only reports the stall and the diagnostics it observed.
    await hooks.finalizeStalledRun(run, {
      noProgressMs,
      monitorElapsedMs: Date.now() - handle.startedAtMs,
      lastStatus: handle.lastStatus,
      lastAssistantMessageId: handle.lastAssistantMessageId,
    });
    return true;
  }

  async function finalizeBlockedInteraction(
    handle: TaskRunMonitorHandle,
    run: TaskRun,
    interaction: TaskRunPendingInteraction,
  ): Promise<boolean> {
    await hooks.finalizeBlockedInteraction(run, {
      interaction,
      monitorElapsedMs: Date.now() - handle.startedAtMs,
      lastStatus: handle.lastStatus,
      lastAssistantMessageId: handle.lastAssistantMessageId,
    });
    return true;
  }

  async function finalizeUsageLimit(
    handle: TaskRunMonitorHandle,
    run: TaskRun,
    retryStatus: { attempt: number; message: string; next: number },
    attemptedModel: string,
    retryElapsedMs: number,
  ): Promise<boolean> {
    await hooks.finalizeUsageLimitRun(run, {
      ...retryStatus,
      attemptedModel,
      retryElapsedMs,
      monitorElapsedMs: Date.now() - handle.startedAtMs,
      lastAssistantMessageId: handle.lastAssistantMessageId,
    });
    return true;
  }

  async function finalizeModelNotFound(
    handle: TaskRunMonitorHandle,
    run: TaskRun,
    retryStatus: { attempt: number; message: string; next: number },
    attemptedModel: string,
  ): Promise<boolean> {
    await hooks.finalizeModelNotFoundRun(run, {
      ...retryStatus,
      attemptedModel,
      // Detected on first observation, so there is no accumulated retry window.
      retryElapsedMs: 0,
      monitorElapsedMs: Date.now() - handle.startedAtMs,
      lastAssistantMessageId: handle.lastAssistantMessageId,
    });
    return true;
  }

  function isMonitorTimedOut(
    handle: TaskRunMonitorHandle,
    run: TaskRun,
    maxLifetimeMs: number,
  ): boolean {
    const startedAtMs = run.startedAt ? Date.parse(run.startedAt) : handle.startedAtMs;
    const elapsedMs = Date.now() - (Number.isNaN(startedAtMs) ? handle.startedAtMs : startedAtMs);

    return elapsedMs >= maxLifetimeMs;
  }

  function nextMonitorDelay(currentDelayMs: number): number {
    return Math.min(config.maxPollMs, Math.max(config.initialPollMs, currentDelayMs * 2));
  }
}

const USAGE_LIMIT_RETRY_MARKERS = [
  "usage limit",
  "rate limit",
  "quota",
  "too many requests",
  "credit balance",
  "billing",
];

/**
 * Whether a `retry` status message reads as a usage/rate limit rather than some
 * other transient reason OpenCode retries for. Only these get the short
 * fail-fast timeout; anything else falls back to the ordinary stall timeout.
 */
export function isUsageLimitRetryMessage(message: string): boolean {
  const text = message.toLowerCase();
  return USAGE_LIMIT_RETRY_MARKERS.some((marker) => text.includes(marker));
}

const MODEL_NOT_FOUND_RETRY_MARKERS = [
  "model not found",
  "model_not_found",
  "no such model",
  "unknown model",
  "invalid model",
  "unsupported model",
  "no endpoints found",
];

/**
 * Whether a `retry` status message reads as a non-existent/invalid model. Such a
 * run can never succeed on retry, so it is failed fast immediately rather than
 * being tolerated for a threshold like a usage/rate limit.
 */
export function isModelNotFoundRetryMessage(message: string): boolean {
  const text = message.toLowerCase();
  return MODEL_NOT_FOUND_RETRY_MARKERS.some((marker) => text.includes(marker));
}
