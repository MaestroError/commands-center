import { describe, expect, it, vi } from "vitest";

import type { TaskRun } from "@cc/shared/schemas";

import { TaskRunPromptError } from "../../src/services/conversation-service";
import {
  DEFAULT_TRANSPORT_RETRY_CONFIG,
  buildTaskRunErrorDetails,
  createTaskRunTransport,
  isRetryableLocalOpenCodeError,
  mergeOpencodeMonitorMetadata,
  readElapsedRunMs,
  readLatestAssistantMessage,
  readOptionalOpencodeMonitorMetadata,
  summarizeTaskRunConversation,
} from "../../src/services/task-run-support";

function run(overrides: Partial<TaskRun> = {}): TaskRun {
  return { id: "run-1", taskId: "task-1", ...overrides } as TaskRun;
}

function promptError(): TaskRunPromptError {
  return new TaskRunPromptError({
    modelError: { name: "APIError", message: "overloaded", data: {} },
    attemptedModel: "openai/gpt-4.1",
  });
}

describe("isRetryableLocalOpenCodeError", () => {
  it("never retries terminal model errors", () => {
    expect(isRetryableLocalOpenCodeError(promptError())).toBe(false);
  });

  it("retries on 502/503/504 status codes", () => {
    expect(isRetryableLocalOpenCodeError({ statusCode: 503 })).toBe(true);
    expect(isRetryableLocalOpenCodeError({ status: 504 })).toBe(true);
  });

  it("retries on known transport error markers, including nested causes", () => {
    expect(isRetryableLocalOpenCodeError(new Error("fetch failed"))).toBe(true);
    const withCause = new Error("outer") as Error & { cause: unknown };
    withCause.cause = { code: "ECONNRESET" };
    expect(isRetryableLocalOpenCodeError(withCause)).toBe(true);
  });

  it("does not retry unrelated errors", () => {
    expect(isRetryableLocalOpenCodeError(new Error("bad request"))).toBe(false);
    expect(isRetryableLocalOpenCodeError(42)).toBe(false);
  });
});

describe("buildTaskRunErrorDetails", () => {
  it("derives details from a prompt error", () => {
    expect(buildTaskRunErrorDetails(promptError(), run())).toMatchObject({
      errorName: "APIError",
      attemptedModel: "openai/gpt-4.1",
      stage: "task_session_prompt",
    });
  });

  it("uses the create stage when no session exists and includes cause data", () => {
    const error = new Error("boom") as Error & { cause: unknown };
    error.cause = { name: "CauseError", message: "root", code: "EPIPE" };
    const details = buildTaskRunErrorDetails(error, run());
    expect(details["stage"]).toBe("task_session_create");
    expect(details["causeCode"]).toBe("EPIPE");
  });

  it("uses the prompt stage and records elapsed time when a session and start time exist", () => {
    const details = buildTaskRunErrorDetails(
      new Error("x"),
      run({ opencodeSessionId: "s1", startedAt: new Date(Date.now() - 1000).toISOString() }),
    );
    expect(details["stage"]).toBe("task_session_prompt");
    expect(details["opencodeSessionId"]).toBe("s1");
    expect(typeof details["elapsedRunMs"]).toBe("number");
  });

  it("uses the create stage for a provider model error before a session exists", () => {
    const error = new Error("Model not found: openai/gpt-5.6-terra-fast");
    error.name = "ProviderModelNotFoundError";

    expect(buildTaskRunErrorDetails(error, run())).toMatchObject({
      errorName: "ProviderModelNotFoundError",
      attemptedModel: "openai/gpt-5.6-terra-fast",
      stage: "task_session_create",
    });
  });

  it("uses the prompt stage for a wrapped provider model prompt error", () => {
    const error = new TaskRunPromptError({
      attemptedModel: "openai/gpt-5.6-terra-fast",
      modelError: {
        name: "ProviderModelNotFoundError",
        message: "Model not found: openai/gpt-5.6-terra-fast",
        data: {},
      },
    });

    expect(buildTaskRunErrorDetails(error, run())).toMatchObject({
      errorName: "ProviderModelNotFoundError",
      attemptedModel: "openai/gpt-5.6-terra-fast",
      stage: "task_session_prompt",
    });
  });
});

describe("readElapsedRunMs", () => {
  it("returns undefined without a start time or with an invalid one", () => {
    expect(readElapsedRunMs(run())).toBeUndefined();
    expect(readElapsedRunMs(run({ startedAt: "not-a-date" }))).toBeUndefined();
  });

  it("returns elapsed milliseconds for a valid start time", () => {
    expect(
      readElapsedRunMs(run({ startedAt: new Date(Date.now() - 500).toISOString() })),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("opencode monitor metadata", () => {
  it("merges monitor metadata onto existing trigger metadata", () => {
    const metadata = {
      conversationId: "c1",
      opencodeSessionId: "s1",
      attemptedModel: "openai/gpt-4.1",
      baselineMessageCount: 0,
      promptAcceptedAt: "2026-06-01T00:00:00.000Z",
    };
    expect(mergeOpencodeMonitorMetadata({ existing: true }, metadata)).toEqual({
      existing: true,
      opencodeMonitor: metadata,
    });
    expect(mergeOpencodeMonitorMetadata(undefined, metadata)).toEqual({
      opencodeMonitor: metadata,
    });
  });

  it("reads valid monitor metadata and rejects malformed shapes", () => {
    const valid = {
      conversationId: "c1",
      opencodeSessionId: "s1",
      attemptedModel: "openai/gpt-4.1",
      baselineMessageCount: 3,
      promptAcceptedAt: "2026-06-01T00:00:00.000Z",
    };
    expect(
      readOptionalOpencodeMonitorMetadata(run({ triggerMetadata: { opencodeMonitor: valid } })),
    ).toEqual(valid);

    // Missing/invalid fields yield undefined.
    expect(readOptionalOpencodeMonitorMetadata(run({ triggerMetadata: {} }))).toBeUndefined();
    expect(
      readOptionalOpencodeMonitorMetadata(
        run({ triggerMetadata: { opencodeMonitor: { ...valid, baselineMessageCount: -1 } } }),
      ),
    ).toBeUndefined();
  });
});

describe("conversation summaries", () => {
  const message = (role: string, content: string) => ({ id: role, role, content }) as never;

  it("reads the latest assistant message", () => {
    expect(
      readLatestAssistantMessage([
        message("assistant", "first"),
        message("user", "middle"),
        message("assistant", "last"),
      ])?.content,
    ).toBe("last");
    expect(readLatestAssistantMessage([message("user", "only")])).toBeUndefined();
  });

  it("summarizes based on the latest assistant content", () => {
    expect(summarizeTaskRunConversation({ messages: [] })).toContain("No assistant summary");
    expect(summarizeTaskRunConversation({ messages: [message("assistant", "  done  ")] })).toBe(
      "done",
    );
    expect(summarizeTaskRunConversation({ messages: [message("assistant", "   ")] })).toBe(
      "Task completed.",
    );
  });
});

describe("createTaskRunTransport.retry", () => {
  it("retries a retryable failure then succeeds", async () => {
    const transport = createTaskRunTransport({
      config: { ...DEFAULT_TRANSPORT_RETRY_CONFIG, initialDelayMs: 1, jitterRatio: 0 },
    });
    const op = vi.fn().mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValueOnce("ok");
    await expect(transport.retry(run(), "task_session_prompt", op)).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-retryable failure immediately", async () => {
    const transport = createTaskRunTransport({ config: DEFAULT_TRANSPORT_RETRY_CONFIG });
    const op = vi.fn().mockRejectedValue(new Error("not retryable"));
    await expect(transport.retry(run(), "task_session_prompt", op)).rejects.toThrow(
      "not retryable",
    );
    expect(op).toHaveBeenCalledTimes(1);
  });
});
