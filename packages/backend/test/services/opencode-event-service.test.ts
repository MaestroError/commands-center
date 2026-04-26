import { describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";

import { createOpenCodeEventService } from "../../src/services/opencode-event-service.js";

describe("opencode-event-service", () => {
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
