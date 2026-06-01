import { afterEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";

import { createOpenCodeEventService } from "../../src/services/opencode-event-service.js";

describe("opencode-event-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards full retry status metadata from SSE", async () => {
    const event = {
      type: "session.status",
      properties: {
        sessionID: "sess-1",
        status: {
          type: "retry",
          attempt: 3,
          message: "OpenAI rate limit reached",
          next: 1_700_000_000_000,
        },
      },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeSseResponse([event]));
    const onEvent = vi.fn();

    createOpenCodeEventService({
      config: { opencode: { baseUrl: "http://opencode.test:1234" } } as never,
      logger: createLogger(),
    }).subscribe({
      directory: "/work/agent-a",
      sessionID: "sess-1",
      signal: AbortSignal.timeout(50),
      onEvent,
    });

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({
        type: "session.status",
        properties: {
          sessionID: "sess-1",
          status: {
            type: "retry",
            attempt: 3,
            message: "OpenAI rate limit reached",
            next: 1_700_000_000_000,
          },
        },
      });
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("preserves assistant message error metadata", async () => {
    const event = {
      type: "message.updated",
      properties: {
        sessionID: "sess-1",
        info: {
          id: "msg-1",
          sessionID: "sess-1",
          role: "assistant",
          parentID: "user-1",
          error: {
            name: "APIError",
            message: "Rate limit exceeded",
            data: { retryAfter: 30 },
          },
          time: {
            created: 1_700_000_000_000,
            completed: 1_700_000_000_500,
          },
        },
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeSseResponse([event]));
    const onEvent = vi.fn();

    createOpenCodeEventService({
      config: { opencode: { baseUrl: "http://opencode.test:1234" } } as never,
      logger: createLogger(),
    }).subscribe({
      directory: "/work/agent-a",
      sessionID: "sess-1",
      signal: AbortSignal.timeout(50),
      onEvent,
    });

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({
        type: "message.updated",
        properties: {
          sessionID: "sess-1",
          message: {
            id: "msg-1",
            conversationId: "",
            role: "assistant",
            content: "",
            parts: [],
            attachments: [],
            parentId: "user-1",
            error: {
              name: "APIError",
              message: "Rate limit exceeded",
              data: { retryAfter: 30 },
            },
            createdAt: new Date(1_700_000_000_000).toISOString(),
            updatedAt: new Date(1_700_000_000_500).toISOString(),
          },
        },
      });
    });
  });

  it("maps server connection and heartbeat events", async () => {
    const onEvent = await collectEvents([
      { type: "server.connected", properties: {} },
      { type: "server.heartbeat", properties: {} },
    ]);

    expect(onEvent.mock.calls.map((call) => call[0] as unknown)).toEqual([
      { type: "connected", properties: {} },
      { type: "heartbeat", properties: {} },
    ]);
  });

  it("ignores events for another session", async () => {
    const onEvent = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeSseResponse([
        {
          type: "message.removed",
          properties: { sessionID: "other-session", messageID: "msg-1" },
        },
      ]),
    );

    subscribeForTest({ onEvent, signal: AbortSignal.timeout(25) });
    await wait(40);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores unsupported session-scoped event types", async () => {
    const onEvent = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeSseResponse([{ type: "session.unrelated", properties: { sessionID: "sess-1" } }]),
    );

    subscribeForTest({ onEvent, signal: AbortSignal.timeout(25) });
    await wait(40);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("maps missing or invalid session status payloads to idle", async () => {
    const onEvent = await collectEvents([
      {
        type: "session.status",
        properties: { sessionID: "sess-1", status: { type: "retry", attempt: "1" } },
      },
    ]);

    expect(onEvent).toHaveBeenCalledWith({
      type: "session.status",
      properties: { sessionID: "sess-1", status: { type: "idle" } },
    });
  });

  it("maps busy session status payloads", async () => {
    const onEvent = await collectEvents([
      { type: "session.status", properties: { sessionID: "sess-1", status: { type: "busy" } } },
    ]);

    expect(onEvent).toHaveBeenCalledWith({
      type: "session.status",
      properties: { sessionID: "sess-1", status: { type: "busy" } },
    });
  });

  it("drops message update events without a valid message id", async () => {
    const onEvent = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeSseResponse([
        { type: "message.updated", properties: { sessionID: "sess-1", info: { role: "user" } } },
      ]),
    );

    subscribeForTest({ onEvent, signal: AbortSignal.timeout(25) });
    await wait(40);

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("maps user message updates with default timestamps", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_010_000);
    const onEvent = await collectEvents([
      {
        type: "message.updated",
        properties: {
          sessionID: "sess-1",
          info: { id: "msg-2", role: "user" },
        },
      },
    ]);

    expect(onEvent).toHaveBeenCalledWith({
      type: "message.updated",
      properties: {
        sessionID: "sess-1",
        message: {
          id: "msg-2",
          conversationId: "",
          role: "user",
          content: "",
          parts: [],
          attachments: [],
          parentId: undefined,
          error: undefined,
          createdAt: new Date(1_700_000_010_000).toISOString(),
          updatedAt: new Date(1_700_000_010_000).toISOString(),
        },
      },
    });
    nowSpy.mockRestore();
  });

  it("maps part update events with the part message id fallback", async () => {
    const onEvent = await collectEvents([
      {
        type: "message.part.updated",
        properties: {
          sessionID: "sess-1",
          part: { id: "part-1", messageID: "msg-1", type: "text", text: "hello" },
        },
      },
    ]);

    expect(onEvent).toHaveBeenCalledWith({
      type: "message.part.updated",
      properties: {
        sessionID: "sess-1",
        messageID: "msg-1",
        part: { id: "part-1", messageID: "msg-1", type: "text", text: "hello" },
      },
    });
  });

  it("passes through malformed part update events", async () => {
    const onEvent = await collectEvents([
      {
        type: "message.part.updated",
        properties: { sessionID: "sess-1", part: { id: "part-1" } },
      },
    ]);

    expect(onEvent).toHaveBeenCalledWith({
      type: "message.part.updated",
      properties: { sessionID: "sess-1", part: { id: "part-1" } },
    });
  });

  it("maps part delta events with safe defaults", async () => {
    const onEvent = await collectEvents([
      { type: "message.part.delta", properties: { sessionID: "sess-1" } },
    ]);

    expect(onEvent).toHaveBeenCalledWith({
      type: "message.part.delta",
      properties: { sessionID: "sess-1", messageID: "", partID: "", field: "text", delta: "" },
    });
  });

  it("maps message and part removal events", async () => {
    const onEvent = await collectEvents([
      {
        type: "message.removed",
        properties: { sessionID: "sess-1", messageID: "msg-1" },
      },
      {
        type: "message.part.removed",
        properties: { sessionID: "sess-1", messageID: "msg-1", partID: "part-1" },
      },
    ]);

    expect(onEvent.mock.calls.map((call) => call[0] as unknown)).toEqual([
      {
        type: "message.removed",
        properties: { sessionID: "sess-1", messageID: "msg-1" },
      },
      {
        type: "message.part.removed",
        properties: { sessionID: "sess-1", messageID: "msg-1", partID: "part-1" },
      },
    ]);
  });

  it("maps permission, question, and todo events with sanitized defaults", async () => {
    const onEvent = await collectEvents([
      {
        type: "permission.asked",
        properties: { sessionID: "sess-1", metadata: "bad", patterns: "bad", always: "bad" },
      },
      { type: "question.asked", properties: { sessionID: "sess-1", questions: "bad" } },
      { type: "todo.updated", properties: { sessionID: "sess-1", todos: "bad" } },
    ]);

    expect(onEvent.mock.calls.map((call) => call[0] as unknown)).toEqual([
      {
        type: "permission.asked",
        properties: {
          id: "",
          sessionID: "sess-1",
          permission: "",
          patterns: [],
          metadata: {},
          always: [],
        },
      },
      {
        type: "question.asked",
        properties: { id: "", sessionID: "sess-1", questions: [] },
      },
      {
        type: "todo.updated",
        properties: { sessionID: "sess-1", todos: [] },
      },
    ]);
  });

  it("forwards title updates from matching session.updated events", async () => {
    const onTitleUpdate = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeSseResponse([
        {
          type: "session.updated",
          properties: {
            sessionID: "sess-1",
            info: { title: "New title" },
          },
        },
      ]),
    );

    subscribeForTest({
      onEvent: vi.fn(),
      onTitleUpdate,
      signal: AbortSignal.timeout(25),
    });

    await vi.waitFor(() => {
      expect(onTitleUpdate).toHaveBeenCalledWith("New title");
    });
  });

  it("skips malformed SSE blocks", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: not-json\n\n"));
        controller.enqueue(encoder.encode('data: {"type":"server.connected","properties":{}}\n\n'));
        controller.close();
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );
    const onEvent = vi.fn();

    subscribeForTest({ onEvent, signal: AbortSignal.timeout(25) });

    await vi.waitFor(() => {
      expect(onEvent).toHaveBeenCalledWith({ type: "connected", properties: {} });
    });
  });

  it("logs and retries failed SSE responses until aborted", async () => {
    const logger = createLogger();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));

    createOpenCodeEventService({
      config: { opencode: { baseUrl: "http://opencode.test:1234" } } as never,
      logger,
    }).subscribe({
      directory: "/work/agent-a",
      sessionID: "sess-1",
      signal: AbortSignal.timeout(25),
      onEvent: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});

function makeSseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function collectEvents(events: unknown[]) {
  const onEvent = vi.fn();
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeSseResponse(events));
  subscribeForTest({ onEvent, signal: AbortSignal.timeout(50) });

  await vi.waitFor(() => {
    expect(onEvent).toHaveBeenCalledTimes(events.length);
  });

  return onEvent;
}

function subscribeForTest(options: {
  onEvent: (event: unknown) => void;
  signal: AbortSignal;
  onTitleUpdate?: (title: string) => void;
}) {
  createOpenCodeEventService({
    config: { opencode: { baseUrl: "http://opencode.test:1234" } } as never,
    logger: createLogger(),
  }).subscribe({
    directory: "/work/agent-a",
    sessionID: "sess-1",
    signal: options.signal,
    onEvent: options.onEvent,
    onTitleUpdate: options.onTitleUpdate,
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createLogger() {
  return {
    level: "info",
    silent: vi.fn(),
    msgPrefix: "",
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
}
