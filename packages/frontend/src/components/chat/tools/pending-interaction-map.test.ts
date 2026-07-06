import { describe, expect, it } from "vitest";

import type { ConversationMessage, ConversationPart, LiveRequest } from "@cc/shared/schemas";

import { buildPendingInteractionMap } from "./pending-interaction-map";

function toolPart(callId: string, status: string): ConversationPart {
  return {
    id: `part-${callId}`,
    type: "tool",
    callID: callId,
    state: { status },
  } as ConversationPart;
}

function message(id: string, parts: ConversationPart[]): ConversationMessage {
  return {
    id,
    conversationId: "conv-1",
    role: "assistant",
    content: "",
    parts,
    attachments: [],
    createdAt: "2026-05-02T10:00:00.000Z",
    updatedAt: "2026-05-02T10:00:00.000Z",
  };
}

function liveRequest(id: string, createdAt: string, kind = "add_secret"): LiveRequest {
  return {
    id,
    conversationId: "conv-1",
    kind,
    closable: false,
    metadata: {},
    actions: [],
    createdAt,
    presentation: { title: id, cancelLabel: "Cancel" },
    fields: [],
  };
}

const emptyInput = {
  permissions: [],
  question: null,
  liveRequests: [],
  messages: [],
  parts: {},
};

describe("buildPendingInteractionMap", () => {
  it("maps a permission by its tool call id", () => {
    const map = buildPendingInteractionMap({
      ...emptyInput,
      permissions: [
        {
          id: "perm-1",
          sessionID: "s",
          permission: "bash",
          patterns: [],
          metadata: {},
          always: [],
          tool: { messageID: "m1", callID: "call-1" },
        },
      ],
    });

    expect(map.get("call-1")).toEqual({ kind: "permission", requestId: "perm-1" });
  });

  it("maps a question by its tool call id", () => {
    const map = buildPendingInteractionMap({
      ...emptyInput,
      question: {
        id: "q-1",
        sessionID: "s",
        questions: [],
        tool: { messageID: "m2", callID: "call-2" },
      },
    });

    expect(map.get("call-2")).toEqual({ kind: "question", requestId: "q-1" });
  });

  it("correlates a single live request to the only running tool call", () => {
    const map = buildPendingInteractionMap({
      ...emptyInput,
      liveRequests: [liveRequest("req-1", "2026-05-02T10:00:00.000Z")],
      messages: [message("msg-1", [toolPart("call-live", "running")])],
    });

    expect(map.get("call-live")).toEqual({ kind: "live-request", requestId: "req-1" });
  });

  it("aligns multiple live requests to running tool calls in chronological order", () => {
    const map = buildPendingInteractionMap({
      ...emptyInput,
      liveRequests: [
        liveRequest("req-late", "2026-05-02T10:00:05.000Z"),
        liveRequest("req-early", "2026-05-02T10:00:01.000Z"),
      ],
      messages: [
        message("msg-1", [toolPart("call-a", "running")]),
        message("msg-2", [toolPart("call-b", "running")]),
      ],
    });

    // Earliest request → earliest running tool call.
    expect(map.get("call-a")).toEqual({ kind: "live-request", requestId: "req-early" });
    expect(map.get("call-b")).toEqual({ kind: "live-request", requestId: "req-late" });
  });

  it("uses only the most recent running tool calls when there are more than requests", () => {
    const map = buildPendingInteractionMap({
      ...emptyInput,
      liveRequests: [liveRequest("req-1", "2026-05-02T10:00:05.000Z")],
      messages: [
        message("msg-1", [toolPart("call-old", "running")]),
        message("msg-2", [toolPart("call-recent", "running")]),
      ],
    });

    expect(map.get("call-recent")).toEqual({ kind: "live-request", requestId: "req-1" });
    expect(map.has("call-old")).toBe(false);
  });

  it("maps the running tool call to the newest request when a stale request lingers", () => {
    // A completed tool's live request lingered, so there are more open requests
    // than running tools. The pending tool must map to the NEWEST request (its
    // own), not the stale earlier one — otherwise cancel targets the wrong id.
    const map = buildPendingInteractionMap({
      ...emptyInput,
      liveRequests: [
        liveRequest("req-stale", "2026-05-02T10:00:01.000Z"),
        liveRequest("req-current", "2026-05-02T10:00:09.000Z"),
      ],
      messages: [message("msg-1", [toolPart("call-current", "running")])],
    });

    expect(map.get("call-current")).toEqual({ kind: "live-request", requestId: "req-current" });
  });

  it("does not map completed tool calls or show_file_to_user requests", () => {
    const map = buildPendingInteractionMap({
      ...emptyInput,
      liveRequests: [liveRequest("req-show", "2026-05-02T10:00:00.000Z", "show_file_to_user")],
      messages: [message("msg-1", [toolPart("call-done", "completed")])],
    });

    expect(map.size).toBe(0);
  });

  it("does not double-map a tool call already claimed by a permission", () => {
    const map = buildPendingInteractionMap({
      ...emptyInput,
      permissions: [
        {
          id: "perm-1",
          sessionID: "s",
          permission: "bash",
          patterns: [],
          metadata: {},
          always: [],
          tool: { messageID: "m1", callID: "call-1" },
        },
      ],
      liveRequests: [liveRequest("req-1", "2026-05-02T10:00:00.000Z")],
      messages: [message("msg-1", [toolPart("call-1", "running"), toolPart("call-2", "running")])],
    });

    // call-1 stays with the permission; the live request lands on call-2.
    expect(map.get("call-1")).toEqual({ kind: "permission", requestId: "perm-1" });
    expect(map.get("call-2")).toEqual({ kind: "live-request", requestId: "req-1" });
  });
});
