import { afterEach, describe, expect, it, vi } from "vitest";

import {
  connectConversationEvents,
  deleteConversation,
  readApiError,
  searchWorkspaceFiles,
  sendCommand,
  summarizeConversation,
} from "./api";

function makeSseResponse(chunks: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, { status: 200, ...init });
}

async function collectEvents(chunks: string[]): Promise<unknown[]> {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeSseResponse(chunks));

  const events: unknown[] = [];
  for await (const event of connectConversationEvents("conv-1", new AbortController().signal)) {
    events.push(event);
  }

  return events;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("connectConversationEvents", () => {
  it("yields parsed events from well-formed data blocks", async () => {
    const events = await collectEvents([
      'data: {"type":"connected","properties":{}}\n\n',
      'data: {"type":"heartbeat","properties":{}}\n\n',
    ]);

    expect(events).toEqual([
      { type: "connected", properties: {} },
      { type: "heartbeat", properties: {} },
    ]);
  });

  it("handles block splitting with leftover buffer remainder", async () => {
    const events = await collectEvents([
      'data: {"type":"connected","properties":{}}\n\nda',
      'ta: {"type":"heartbeat","properties":{}}\n\n',
    ]);

    expect(events).toEqual([
      { type: "connected", properties: {} },
      { type: "heartbeat", properties: {} },
    ]);
  });

  it("skips blocks with no data line", async () => {
    const events = await collectEvents([
      "event: ping\n\n",
      'data: {"type":"connected","properties":{}}\n\n',
    ]);

    expect(events).toEqual([{ type: "connected", properties: {} }]);
  });

  it("skips and warns on blocks that fail chatEventSchema validation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const events = await collectEvents([
      'data: {"type":"not-real","properties":{}}\n\n',
      'data: {"type":"connected","properties":{}}\n\n',
    ]);

    expect(events).toEqual([{ type: "connected", properties: {} }]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("joins multi-line data fields with newline", async () => {
    const events = await collectEvents([
      'data: {"type":"heartbeat",\n' + 'data: "properties":{}}\n\n',
    ]);

    expect(events).toEqual([{ type: "heartbeat", properties: {} }]);
  });

  it("throws on non-OK HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );

    await expect(
      connectConversationEvents("conv-1", new AbortController().signal).next(),
    ).rejects.toThrow("SSE connection failed with status 500");
  });

  it("throws when response body is null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(
      connectConversationEvents("conv-1", new AbortController().signal).next(),
    ).rejects.toThrow("SSE response has no body");
  });
});

describe("deleteConversation", () => {
  it("treats HTTP 204 as success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(deleteConversation("agent-1", "conv-1")).resolves.toBeUndefined();
  });
});

describe("sendCommand", () => {
  it("sends arguments as an empty string when args is undefined", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await sendCommand("conv-1", "compact");

    expect(fetchSpy).toHaveBeenCalledWith("/api/conversations/conv-1/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "compact", arguments: "" }),
    });
  });
});

describe("searchWorkspaceFiles", () => {
  it("requests the global workspace file search endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          nameMatches: [{ path: "src/index.ts" }],
          contentMatches: [{ path: "README.md", lineNumber: 3, lineText: "hello world" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(searchWorkspaceFiles("index")).resolves.toEqual({
      nameMatches: [{ path: "src/index.ts" }],
      contentMatches: [{ path: "README.md", lineNumber: 3, lineText: "hello world" }],
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/search/files?query=index", {
      method: "GET",
      headers: undefined,
      body: undefined,
    });
  });
});

describe("summarizeConversation", () => {
  it("posts without sending an empty json content type", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await summarizeConversation("conv-1");

    expect(fetchSpy).toHaveBeenCalledWith("/api/conversations/conv-1/summarize", {
      method: "POST",
    });
  });
});

describe("readApiError", () => {
  it("reads message from a JSON error payload", () => {
    expect(readApiError({ error: { message: "nope" } }, 400, "Bad Request")).toBe("nope");
  });

  it("falls back to status text when message is missing", () => {
    expect(readApiError({ error: {} }, 500, "Server Error")).toBe("Server Error");
  });
});
