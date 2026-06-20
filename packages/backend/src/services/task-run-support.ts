import type { ConversationDetail, ConversationMessage, TaskRun } from "@cc/shared/schemas";
import type { Logger } from "pino";

import {
  TaskRunPromptError,
  type ConversationService,
  type TaskRunPendingInteraction,
} from "./conversation-service.js";

export type OpencodeMonitorMetadata = {
  conversationId: string;
  opencodeSessionId: string;
  attemptedModel: string;
  baselineMessageCount: number;
  promptAcceptedAt: string;
};

export type RetryStage =
  | "task_session_create"
  | "task_session_prompt"
  | "task_session_status"
  | "task_session_sync"
  | "task_session_pending_interactions";

export type TaskRunTransportRetryOptions = {
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxElapsedMs?: number;
  jitterRatio?: number;
};

export type TaskRunTransportRetryConfig = Required<TaskRunTransportRetryOptions>;

export const DEFAULT_TRANSPORT_RETRY_CONFIG: TaskRunTransportRetryConfig = {
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  maxElapsedMs: 2 * 60 * 1_000,
  jitterRatio: 0.2,
};

export type TaskRunTransport = {
  retry<T>(
    run: TaskRun,
    stage: RetryStage,
    operation: (previousError?: unknown) => Promise<T>,
  ): Promise<T>;
  getSessionStatus(
    run: TaskRun,
  ): Promise<Awaited<ReturnType<ConversationService["getTaskRunSessionStatus"]>>>;
  syncConversation(run: TaskRun): Promise<ConversationDetail>;
  getPendingInteractions(run: TaskRun): Promise<TaskRunPendingInteraction[]>;
};

/**
 * Bounded retry wrapper for the short, local OpenCode HTTP calls that task
 * execution and the async monitor share (create session, start async prompt,
 * read session status, sync session messages). Shared so both services classify
 * and back off transport failures identically.
 */
export function createTaskRunTransport(options: {
  conversationService?: ConversationService;
  logger?: Logger;
  config: TaskRunTransportRetryConfig;
}): TaskRunTransport {
  const { logger, config } = options;

  async function retry<T>(
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
        const delayMs = computeTransportRetryDelay(config, attempt, elapsedMs);

        if (delayMs === undefined) {
          throw error;
        }

        const cause = readErrorCauseSummary(error);
        logger?.warn(
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

  return {
    retry,
    async getSessionStatus(run) {
      return retry(run, "task_session_status", () =>
        options.conversationService!.getTaskRunSessionStatus(run.taskId, run.id),
      );
    },
    async syncConversation(run) {
      return retry(run, "task_session_sync", () =>
        options.conversationService!.syncTaskRunConversation(run.taskId, run.id),
      );
    },
    async getPendingInteractions(run) {
      return retry(run, "task_session_pending_interactions", () =>
        options.conversationService!.listTaskRunPendingInteractions(run.taskId, run.id),
      );
    },
  };
}

function computeTransportRetryDelay(
  config: TaskRunTransportRetryConfig,
  attempt: number,
  elapsedMs: number,
): number | undefined {
  if (elapsedMs >= config.maxElapsedMs) {
    return undefined;
  }

  const exponentialDelayMs = Math.min(
    config.maxDelayMs,
    config.initialDelayMs * 2 ** Math.max(0, attempt - 1),
  );
  const jitterMs =
    config.jitterRatio > 0 ? exponentialDelayMs * config.jitterRatio * Math.random() : 0;
  const delayMs = Math.max(0, Math.round(exponentialDelayMs + jitterMs));
  const remainingMs = config.maxElapsedMs - elapsedMs;

  return Math.min(delayMs, remainingMs);
}

export function isRetryableLocalOpenCodeError(error: unknown): boolean {
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

export function buildTaskRunErrorDetails(error: unknown, run: TaskRun): Record<string, unknown> {
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

export function readElapsedRunMs(run: TaskRun): number | undefined {
  if (!run.startedAt) {
    return undefined;
  }

  const startedAtMs = Date.parse(run.startedAt);

  if (Number.isNaN(startedAtMs)) {
    return undefined;
  }

  return Math.max(0, Date.now() - startedAtMs);
}

export function mergeOpencodeMonitorMetadata(
  triggerMetadata: Record<string, unknown> | undefined,
  opencodeMonitor: OpencodeMonitorMetadata,
): Record<string, unknown> {
  return {
    ...(triggerMetadata ?? {}),
    opencodeMonitor,
  };
}

export function readOptionalOpencodeMonitorMetadata(
  run: TaskRun,
): OpencodeMonitorMetadata | undefined {
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

export function readLatestAssistantMessage(
  messages: ConversationMessage[],
): ConversationMessage | undefined {
  return messages.findLast((message) => message.role === "assistant");
}

export function summarizeTaskRunConversation(conversation: {
  messages: ConversationMessage[];
}): string {
  const latestAssistant = readLatestAssistantMessage(conversation.messages);

  if (!latestAssistant) {
    return "Task completed. No assistant summary was recorded.";
  }

  const content = latestAssistant.content.trim();
  return content.length > 0 ? content : "Task completed.";
}

export async function sleep(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
  });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}
