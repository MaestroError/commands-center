import { afterEach, describe, expect, it, vi } from "vitest";

import { createOpenCodeEventService } from "../../src/services/opencode-event-service";
import type { RuntimeConfig } from "../../src/lib/runtime-config";

const config = { opencode: { baseUrl: "http://opencode.test" } } as unknown as RuntimeConfig;
const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never;

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  // Add a trailing malformed block that must be skipped.
  const full = `${payload}data: {not json}\n\n`;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(full));
      controller.close();
    },
  });
}

async function collectEvents(events: unknown[], sessionID = "sess-1") {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(sseStream(events), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    ),
  );

  const received: Array<{ type: string; properties: Record<string, unknown> }> = [];
  const titles: string[] = [];
  const controller = new AbortController();
  const service = createOpenCodeEventService({ config, logger });

  service.subscribe({
    directory: "/work",
    sessionID,
    signal: controller.signal,
    onEvent: (event) => received.push(event),
    onTitleUpdate: (title) => titles.push(title),
  });

  await vi.waitFor(() => expect(received.length).toBeGreaterThan(0));
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  return { received, titles };
}

describe("opencode event service mapping", () => {
  it("maps the full range of session-scoped events for the subscribed session", async () => {
    const { received, titles } = await collectEvents([
      { type: "server.connected", properties: {} },
      { type: "server.heartbeat", properties: {} },
      {
        type: "session.updated",
        properties: { sessionID: "sess-1", info: { title: "New title" } },
      },
      {
        type: "message.updated",
        properties: {
          sessionID: "sess-1",
          info: { id: "m1", role: "assistant", time: { created: 1, completed: 2 } },
        },
      },
      {
        type: "message.part.updated",
        properties: { sessionID: "sess-1", part: { id: "p1", type: "text", text: "hi" } },
      },
      {
        type: "message.part.delta",
        properties: { sessionID: "sess-1", messageID: "m1", partID: "p1", delta: "chunk" },
      },
      { type: "message.removed", properties: { sessionID: "sess-1", messageID: "m1" } },
      {
        type: "message.part.removed",
        properties: { sessionID: "sess-1", messageID: "m1", partID: "p1" },
      },
      { type: "session.status", properties: { sessionID: "sess-1", status: { type: "busy" } } },
      {
        type: "session.status",
        properties: {
          sessionID: "sess-1",
          status: { type: "retry", attempt: 1, message: "rate", next: 5 },
        },
      },
      { type: "session.status", properties: { sessionID: "sess-1", status: "weird" } },
      {
        type: "session.error",
        properties: { sessionID: "sess-1", error: { name: "E", message: "boom" } },
      },
      {
        type: "permission.asked",
        properties: { sessionID: "sess-1", id: "perm", permission: "edit", patterns: ["*"] },
      },
      {
        type: "question.asked",
        properties: { sessionID: "sess-1", id: "q", questions: [{ q: "?" }] },
      },
      { type: "todo.updated", properties: { sessionID: "sess-1", todos: [] } },
      { type: "permission.replied", properties: { sessionID: "sess-1" } },
      // Filtered out: not a session event, and wrong session.
      { type: "unknown.event", properties: { sessionID: "sess-1" } },
      { type: "message.updated", properties: { sessionID: "other", info: { id: "x" } } },
    ]);

    const types = received.map((event) => event.type);
    expect(titles).toEqual(["New title"]);
    expect(types).toEqual(
      expect.arrayContaining([
        "upstream.connected",
        "heartbeat",
        "message.updated",
        "message.part.updated",
        "message.part.delta",
        "message.removed",
        "message.part.removed",
        "session.status",
        "session.error",
        "permission.asked",
        "question.asked",
        "todo.updated",
        "permission.replied",
      ]),
    );
    expect(types).not.toContain("unknown.event");
  });

  it("drops session.error events without a usable error payload", async () => {
    const { received } = await collectEvents([
      { type: "server.connected", properties: {} },
      { type: "session.error", properties: { sessionID: "sess-1", error: null } },
    ]);
    expect(received.some((event) => event.type === "session.error")).toBe(false);
  });

  it("forwards the tool link on permission/question asked events when present and well-formed", async () => {
    const { received } = await collectEvents([
      {
        type: "permission.asked",
        properties: {
          sessionID: "sess-1",
          id: "perm",
          permission: "edit",
          patterns: ["*"],
          tool: { messageID: "msg-1", callID: "call-1" },
        },
      },
      {
        type: "question.asked",
        properties: {
          sessionID: "sess-1",
          id: "q",
          questions: [{ question: "?", options: [] }],
          tool: { messageID: "msg-2", callID: "call-2" },
        },
      },
      // Malformed tool link (missing callID) — dropped rather than forwarded.
      {
        type: "permission.asked",
        properties: {
          sessionID: "sess-1",
          id: "perm-2",
          permission: "bash",
          tool: { messageID: "msg-3" },
        },
      },
      // Empty tool ids — dropped, since the client requires non-empty (min(1)).
      {
        type: "permission.asked",
        properties: {
          sessionID: "sess-1",
          id: "perm-3",
          permission: "bash",
          tool: { messageID: "", callID: "" },
        },
      },
    ]);

    const permission = received.find((event) => event.properties["id"] === "perm");
    const question = received.find((event) => event.properties["id"] === "q");
    const malformed = received.find((event) => event.properties["id"] === "perm-2");
    const emptyIds = received.find((event) => event.properties["id"] === "perm-3");

    expect(permission?.properties["tool"]).toEqual({ messageID: "msg-1", callID: "call-1" });
    expect(question?.properties["tool"]).toEqual({ messageID: "msg-2", callID: "call-2" });
    expect(malformed?.properties).not.toHaveProperty("tool");
    expect(emptyIds?.properties).not.toHaveProperty("tool");
  });
});
