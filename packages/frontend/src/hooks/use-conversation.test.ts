import { describe, it, expect } from "vitest";

import { conversationReducer, initialState, type ConversationState } from "./use-conversation";

import type {
  ConversationDetail,
  ConversationMessage,
  ConversationPart,
  ConversationSummary,
  LiveRequest,
} from "@cc/shared/schemas";
import type { ChatEvent, TodoItem } from "@cc/shared/schemas";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "hello",
    parts: [],
    attachments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePart(overrides: Partial<ConversationPart> = {}): ConversationPart {
  return { id: "part-1", type: "text", text: "initial", ...overrides };
}

function makeLiveRequest(overrides: Partial<LiveRequest> = {}): LiveRequest {
  return {
    id: "live-1",
    conversationId: "conv-1",
    kind: "self_task_template_create_review",
    presentation: { title: "Review task template", cancelLabel: "Cancel" },
    fields: [],
    actions: [],
    metadata: {},
    closable: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeConversation(overrides: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: "conv-1",
    agentId: "agent-1",
    opencodeSessionId: "sess-1",
    title: "Test conv",
    status: "active",
    source: "chat",
    isCurrent: true,
    messageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    ...overrides,
  };
}

function makeSummary(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "conv-2",
    agentId: "agent-1",
    opencodeSessionId: "sess-2",
    title: "Previous",
    status: "active",
    source: "chat",
    isCurrent: false,
    messageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function stateWithConversation(
  messages: ConversationMessage[] = [],
  parts: Record<string, ConversationPart[]> = {},
): ConversationState {
  return {
    ...initialState,
    conversation: makeConversation({ messages }),
    parts,
  };
}

// ---------------------------------------------------------------------------
// HYDRATE
// ---------------------------------------------------------------------------

describe("HYDRATE", () => {
  it("sets conversation and previous from snapshot", () => {
    const conv = makeConversation({ id: "conv-new" });
    const prev = [makeSummary()];
    const next = conversationReducer(initialState, {
      type: "HYDRATE",
      snapshot: { current: conv, previous: prev },
    });
    expect(next.conversation?.id).toBe("conv-new");
    expect(next.previousConversations).toEqual(prev);
  });

  it("builds parts map from messages with parts", () => {
    const part = makePart();
    const msg = makeMessage({ id: "m1", parts: [part] });
    const conv = makeConversation({ messages: [msg] });
    const next = conversationReducer(initialState, {
      type: "HYDRATE",
      snapshot: { current: conv, previous: [] },
    });
    expect(next.parts["m1"]).toEqual([part]);
  });

  it("does not add messages with empty parts to the parts map", () => {
    const msg = makeMessage({ id: "m-empty", parts: [] });
    const conv = makeConversation({ messages: [msg] });
    const next = conversationReducer(initialState, {
      type: "HYDRATE",
      snapshot: { current: conv, previous: [] },
    });
    expect(next.parts["m-empty"]).toBeUndefined();
  });

  it("resets agentStatus, pendingPermission, pendingQuestion, and todos", () => {
    const dirtyState: ConversationState = {
      ...initialState,
      sessionStatus: { type: "busy" },
      pendingPermissions: [
        {
          id: "perm-1",
          sessionID: "s",
          permission: "read",
          patterns: [],
          metadata: {},
          always: [],
        },
      ],
      pendingQuestion: { id: "q-1", sessionID: "s", questions: [] },
      todos: [{ content: "task", status: "pending" }],
    };
    const next = conversationReducer(dirtyState, {
      type: "HYDRATE",
      snapshot: { current: makeConversation(), previous: [] },
    });
    expect(next.sessionStatus).toEqual({ type: "idle" });
    expect(next.pendingPermissions).toEqual([]);
    expect(next.pendingQuestion).toBeNull();
    expect(next.todos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// HYDRATE_DETAIL
// ---------------------------------------------------------------------------

describe("HYDRATE_DETAIL", () => {
  it("sets conversation from detail", () => {
    const conv = makeConversation({ id: "detail-conv" });
    const next = conversationReducer(initialState, {
      type: "HYDRATE_DETAIL",
      detail: conv,
    });
    expect(next.conversation?.id).toBe("detail-conv");
  });

  it("builds parts map from detail messages", () => {
    const part = makePart({ id: "p1" });
    const msg = makeMessage({ id: "m2", parts: [part] });
    const conv = makeConversation({ messages: [msg] });
    const next = conversationReducer(initialState, {
      type: "HYDRATE_DETAIL",
      detail: conv,
    });
    expect(next.parts["m2"]).toEqual([part]);
  });

  it("keeps existing previousConversations when previous not provided", () => {
    const existing = [makeSummary({ id: "old-prev" })];
    const state: ConversationState = { ...initialState, previousConversations: existing };
    const next = conversationReducer(state, {
      type: "HYDRATE_DETAIL",
      detail: makeConversation(),
    });
    expect(next.previousConversations).toEqual(existing);
  });

  it("replaces previousConversations when previous is provided", () => {
    const newPrev = [makeSummary({ id: "new-prev" })];
    const next = conversationReducer(initialState, {
      type: "HYDRATE_DETAIL",
      detail: makeConversation(),
      previous: newPrev,
    });
    expect(next.previousConversations).toEqual(newPrev);
  });

  it("resets agentStatus, pendingPermission, pendingQuestion, and todos", () => {
    const dirtyState: ConversationState = {
      ...initialState,
      sessionStatus: { type: "busy" },
      pendingPermissions: [
        {
          id: "perm-1",
          sessionID: "s",
          permission: "read",
          patterns: [],
          metadata: {},
          always: [],
        },
      ],
      todos: [{ content: "x", status: "in_progress" }],
    };
    const next = conversationReducer(dirtyState, {
      type: "HYDRATE_DETAIL",
      detail: makeConversation(),
    });
    expect(next.sessionStatus).toEqual({ type: "idle" });
    expect(next.pendingPermissions).toEqual([]);
    expect(next.todos).toEqual([]);
  });

  // Pending interactions are live backend state keyed by the conversation, not
  // part of the detail payload. Dropping them on a refetch of the SAME
  // conversation makes an open review form vanish from the UI while the
  // specialist is still blocked on it, and only a page reload brings it back.
  it("keeps pending interactions when rehydrating the same conversation", () => {
    const conversation = makeConversation({ id: "conv-same" });
    const liveRequest = makeLiveRequest({ conversationId: "conv-same" });
    const state: ConversationState = {
      ...initialState,
      conversation,
      liveRequests: [liveRequest],
      pendingPermissions: [
        {
          id: "perm-1",
          sessionID: "s",
          permission: "read",
          patterns: [],
          metadata: {},
          always: [],
        },
      ],
      pendingQuestion: { id: "q-1", sessionID: "s", questions: [] },
    };

    const next = conversationReducer(state, {
      type: "HYDRATE_DETAIL",
      detail: makeConversation({ id: "conv-same", title: "Renamed" }),
    });

    expect(next.conversation?.title).toBe("Renamed");
    expect(next.liveRequests).toEqual([liveRequest]);
    expect(next.pendingPermissions).toHaveLength(1);
    expect(next.pendingQuestion?.id).toBe("q-1");
  });

  it("drops pending interactions when hydrating a different conversation", () => {
    const state: ConversationState = {
      ...initialState,
      conversation: makeConversation({ id: "conv-old" }),
      liveRequests: [makeLiveRequest({ conversationId: "conv-old" })],
      pendingQuestion: { id: "q-1", sessionID: "s", questions: [] },
    };

    const next = conversationReducer(state, {
      type: "HYDRATE_DETAIL",
      detail: makeConversation({ id: "conv-new" }),
    });

    expect(next.liveRequests).toEqual([]);
    expect(next.pendingQuestion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// OPTIMISTIC_USER_MESSAGE
// ---------------------------------------------------------------------------

describe("OPTIMISTIC_USER_MESSAGE", () => {
  it("appends the message to conversation.messages", () => {
    const state = stateWithConversation();
    const msg = makeMessage({ id: "optimistic-123", role: "user" });
    const next = conversationReducer(state, { type: "OPTIMISTIC_USER_MESSAGE", message: msg });
    expect(next.conversation?.messages).toHaveLength(1);
    expect(next.conversation?.messages[0]?.id).toBe("optimistic-123");
  });

  it("adds message parts to the parts map", () => {
    const state = stateWithConversation();
    const part = makePart({ id: "p-opt" });
    const msg = makeMessage({ id: "optimistic-456", parts: [part] });
    const next = conversationReducer(state, { type: "OPTIMISTIC_USER_MESSAGE", message: msg });
    expect(next.parts["optimistic-456"]).toEqual([part]);
  });

  it("is a no-op when conversation is null", () => {
    const msg = makeMessage({ id: "optimistic-789" });
    const next = conversationReducer(initialState, {
      type: "OPTIMISTIC_USER_MESSAGE",
      message: msg,
    });
    expect(next).toBe(initialState);
  });
});

// ---------------------------------------------------------------------------
// SSE_EVENT — session.status
// ---------------------------------------------------------------------------

describe("SSE_EVENT: session.status", () => {
  it("sets agentStatus to busy", () => {
    const event: ChatEvent = {
      type: "session.status",
      properties: { sessionID: "s", status: { type: "busy" } },
    };
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event });
    expect(next.sessionStatus).toEqual({ type: "busy" });
  });

  it("sets agentStatus to idle", () => {
    const state = { ...initialState, sessionStatus: { type: "busy" as const } };
    const event: ChatEvent = {
      type: "session.status",
      properties: { sessionID: "s", status: { type: "idle" } },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.sessionStatus).toEqual({ type: "idle" });
  });

  it("stores retry metadata", () => {
    const event: ChatEvent = {
      type: "session.status",
      properties: {
        sessionID: "s",
        status: { type: "retry", attempt: 2, message: "Rate limited", next: 1_700_000_000_000 },
      },
    };
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event });
    expect(next.sessionStatus).toEqual({
      type: "retry",
      attempt: 2,
      message: "Rate limited",
      next: 1_700_000_000_000,
    });
  });
});

describe("SEND_FAILED", () => {
  it("stores a visible send error and resets session status to idle", () => {
    const state: ConversationState = {
      ...initialState,
      sessionStatus: { type: "busy" },
    };

    const next = conversationReducer(state, {
      type: "SEND_FAILED",
      message: "Rate limit exceeded",
    });

    expect(next.sessionStatus).toEqual({ type: "idle" });
    expect(next.sendError).toBe("Rate limit exceeded");
  });

  it("clears a visible send error", () => {
    const state: ConversationState = {
      ...initialState,
      sendError: "Rate limit exceeded",
    };

    const next = conversationReducer(state, { type: "CLEAR_SEND_ERROR" });

    expect(next.sendError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SSE_EVENT — message.updated
// ---------------------------------------------------------------------------

describe("SSE_EVENT: message.updated", () => {
  it("is a no-op when conversation is null", () => {
    const event: ChatEvent = {
      type: "message.updated",
      properties: {
        sessionID: "s",
        message: {
          id: "m1",
          conversationId: "",
          role: "user",
          content: "",
          parts: [],
          attachments: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    };
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event });
    expect(next).toBe(initialState);
  });

  it("appends a new assistant message that does not yet exist", () => {
    const state = stateWithConversation();
    const event: ChatEvent = {
      type: "message.updated",
      properties: {
        sessionID: "s",
        message: makeMessage({ id: "new-msg", role: "assistant", conversationId: "" }),
      },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.conversation?.messages).toHaveLength(1);
    expect(next.conversation?.messages[0]?.id).toBe("new-msg");
  });

  it("updates metadata of an existing message (preserves parts)", () => {
    const part = makePart({ id: "existing-part" });
    const msg = makeMessage({ id: "msg-exist", role: "assistant", content: "old" });
    const state = stateWithConversation([msg], { "msg-exist": [part] });

    const event: ChatEvent = {
      type: "message.updated",
      properties: {
        sessionID: "s",
        message: makeMessage({
          id: "msg-exist",
          role: "assistant",
          content: "updated",
          conversationId: "",
        }),
      },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    const updated = next.conversation?.messages.find((m) => m.id === "msg-exist");
    expect(updated?.content).toBe("updated");
    // Parts map preserved
    expect(next.parts["msg-exist"]).toEqual([part]);
  });

  it("removes optimistic user messages when a real user message arrives", () => {
    const optimistic = makeMessage({ id: "optimistic-abc", role: "user", content: "hello" });
    const state = stateWithConversation([optimistic]);
    const event: ChatEvent = {
      type: "message.updated",
      properties: {
        sessionID: "s",
        message: makeMessage({
          id: "real-user-1",
          role: "user",
          content: "hello",
          conversationId: "",
        }),
      },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    const ids = next.conversation?.messages.map((m) => m.id);
    expect(ids).not.toContain("optimistic-abc");
    expect(ids).toContain("real-user-1");
  });

  it("does not remove non-optimistic user messages when a new user message arrives", () => {
    const real = makeMessage({ id: "real-1", role: "user" });
    const state = stateWithConversation([real]);
    const event: ChatEvent = {
      type: "message.updated",
      properties: {
        sessionID: "s",
        message: makeMessage({ id: "real-2", role: "user", conversationId: "" }),
      },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    const ids = next.conversation?.messages.map((m) => m.id);
    expect(ids).toContain("real-1");
    expect(ids).toContain("real-2");
  });
});

// ---------------------------------------------------------------------------
// SSE_EVENT — message.removed
// ---------------------------------------------------------------------------

describe("SSE_EVENT: message.removed", () => {
  it("removes the message and its parts map entry", () => {
    const msg = makeMessage({ id: "m-del" });
    const part = makePart({ id: "p-del" });
    const state = stateWithConversation([msg], { "m-del": [part] });
    const event: ChatEvent = {
      type: "message.removed",
      properties: { sessionID: "s", messageID: "m-del" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.conversation?.messages).toHaveLength(0);
    expect(next.parts["m-del"]).toBeUndefined();
  });

  it("is a no-op when conversation is null", () => {
    const event: ChatEvent = {
      type: "message.removed",
      properties: { sessionID: "s", messageID: "ghost" },
    };
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event });
    expect(next).toBe(initialState);
  });

  it("does not remove other messages", () => {
    const m1 = makeMessage({ id: "keep" });
    const m2 = makeMessage({ id: "remove" });
    const state = stateWithConversation([m1, m2]);
    const event: ChatEvent = {
      type: "message.removed",
      properties: { sessionID: "s", messageID: "remove" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.conversation?.messages.map((m) => m.id)).toEqual(["keep"]);
  });
});

// ---------------------------------------------------------------------------
// SSE_EVENT — message.part.updated
// ---------------------------------------------------------------------------

describe("SSE_EVENT: message.part.updated", () => {
  it("appends a part when the parts map entry is empty", () => {
    const state = stateWithConversation([makeMessage({ id: "m1" })]);
    const part = makePart({ id: "p-new", type: "text" });
    const event: ChatEvent = {
      type: "message.part.updated",
      properties: { sessionID: "s", messageID: "m1", part },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.parts["m1"]).toEqual([part]);
  });

  it("appends a part with a new id to an existing list", () => {
    const existingPart = makePart({ id: "p-existing" });
    const state = stateWithConversation([makeMessage({ id: "m1" })], { m1: [existingPart] });
    const newPart = makePart({ id: "p-new2" });
    const event: ChatEvent = {
      type: "message.part.updated",
      properties: { sessionID: "s", messageID: "m1", part: newPart },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.parts["m1"]).toHaveLength(2);
    expect(next.parts["m1"]?.[1]).toEqual(newPart);
  });

  it("updates an existing part in-place by id", () => {
    const original = makePart({ id: "p1", type: "text", text: "old" });
    const state = stateWithConversation([makeMessage({ id: "m1" })], { m1: [original] });
    const updated = makePart({ id: "p1", type: "text", text: "new" });
    const event: ChatEvent = {
      type: "message.part.updated",
      properties: { sessionID: "s", messageID: "m1", part: updated },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.parts["m1"]).toHaveLength(1);
    expect((next.parts["m1"]?.[0] as unknown as { text: string }).text).toBe("new");
  });

  it("is a no-op when conversation is null", () => {
    const event: ChatEvent = {
      type: "message.part.updated",
      properties: { sessionID: "s", messageID: "m1", part: makePart() },
    };
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event });
    expect(next).toBe(initialState);
  });
});

// ---------------------------------------------------------------------------
// SSE_EVENT — message.part.delta
// ---------------------------------------------------------------------------

describe("SSE_EVENT: message.part.delta", () => {
  it("concatenates delta onto the named field", () => {
    const part = makePart({ id: "p1", type: "text", text: "hello" });
    const state = stateWithConversation([], { m1: [part] });
    const event: ChatEvent = {
      type: "message.part.delta",
      properties: { sessionID: "s", messageID: "m1", partID: "p1", field: "text", delta: " world" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect((next.parts["m1"]?.[0] as unknown as { text: string }).text).toBe("hello world");
  });

  it("treats missing field as empty string before concatenating", () => {
    const part: ConversationPart = { id: "p1", type: "text" }; // no `text` field
    const state = stateWithConversation([], { m1: [part] });
    const event: ChatEvent = {
      type: "message.part.delta",
      properties: { sessionID: "s", messageID: "m1", partID: "p1", field: "text", delta: "start" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect((next.parts["m1"]?.[0] as unknown as { text: string }).text).toBe("start");
  });

  it("is a no-op when messageID is not in the parts map", () => {
    const state = stateWithConversation();
    const event: ChatEvent = {
      type: "message.part.delta",
      properties: { sessionID: "s", messageID: "ghost", partID: "p1", field: "text", delta: "x" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.parts).toEqual({});
  });

  it("does not modify unrelated parts", () => {
    const p1 = makePart({ id: "p1", type: "text", text: "do not touch" });
    const p2 = makePart({ id: "p2", type: "text", text: "target" });
    const state = stateWithConversation([], { m1: [p1, p2] });
    const event: ChatEvent = {
      type: "message.part.delta",
      properties: {
        sessionID: "s",
        messageID: "m1",
        partID: "p2",
        field: "text",
        delta: " appended",
      },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect((next.parts["m1"]?.[0] as unknown as { text: string }).text).toBe("do not touch");
    expect((next.parts["m1"]?.[1] as unknown as { text: string }).text).toBe("target appended");
  });
});

// ---------------------------------------------------------------------------
// SSE_EVENT — message.part.removed
// ---------------------------------------------------------------------------

describe("SSE_EVENT: message.part.removed", () => {
  it("removes the matching part from the array", () => {
    const p1 = makePart({ id: "p-keep" });
    const p2 = makePart({ id: "p-remove" });
    const state = stateWithConversation([], { m1: [p1, p2] });
    const event: ChatEvent = {
      type: "message.part.removed",
      properties: { sessionID: "s", messageID: "m1", partID: "p-remove" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.parts["m1"]).toHaveLength(1);
    expect(next.parts["m1"]?.[0]?.id).toBe("p-keep");
  });

  it("is a no-op when messageID is not in the parts map", () => {
    const state = stateWithConversation();
    const event: ChatEvent = {
      type: "message.part.removed",
      properties: { sessionID: "s", messageID: "ghost", partID: "p1" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.parts).toEqual({});
  });

  it("leaves an empty array when the only part is removed", () => {
    const part = makePart({ id: "solo" });
    const state = stateWithConversation([], { m1: [part] });
    const event: ChatEvent = {
      type: "message.part.removed",
      properties: { sessionID: "s", messageID: "m1", partID: "solo" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.parts["m1"]).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SSE_EVENT — permission.asked / permission.replied
// ---------------------------------------------------------------------------

describe("SSE_EVENT: permission.asked / permission.replied", () => {
  it("populates pendingPermission from the event properties", () => {
    const event: ChatEvent = {
      type: "permission.asked",
      properties: {
        id: "perm-42",
        sessionID: "s",
        permission: "bash",
        patterns: ["*.sh"],
        metadata: {},
        always: [],
      },
    };
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event });
    expect(next.pendingPermissions).toHaveLength(1);
    expect(next.pendingPermissions[0]?.id).toBe("perm-42");
    expect(next.pendingPermissions[0]?.permission).toBe("bash");
  });

  it("removes only the replied permission and keeps earlier pending ones", () => {
    const state: ConversationState = {
      ...initialState,
      pendingPermissions: [
        {
          id: "perm-1",
          sessionID: "s",
          permission: "read",
          patterns: [],
          metadata: {},
          always: [],
        },
        {
          id: "perm-2",
          sessionID: "s",
          permission: "write",
          patterns: [],
          metadata: {},
          always: [],
        },
      ],
    };
    const event: ChatEvent = {
      type: "permission.replied",
      properties: { sessionID: "s", requestID: "perm-2", reply: "once" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.pendingPermissions).toEqual([
      {
        id: "perm-1",
        sessionID: "s",
        permission: "read",
        patterns: [],
        metadata: {},
        always: [],
      },
    ]);
  });

  it("keeps multiple permission requests in order instead of overwriting the latest one", () => {
    const first: ChatEvent = {
      type: "permission.asked",
      properties: {
        id: "perm-1",
        sessionID: "s",
        permission: "memory_search_nodes",
        patterns: ["*"],
        metadata: {},
        always: [],
      },
    };
    const second: ChatEvent = {
      type: "permission.asked",
      properties: {
        id: "perm-2",
        sessionID: "s",
        permission: "memory_open_nodes",
        patterns: ["*"],
        metadata: {},
        always: [],
      },
    };

    const next = conversationReducer(
      conversationReducer(initialState, { type: "SSE_EVENT", event: second }),
      { type: "SSE_EVENT", event: first },
    );

    expect(next.pendingPermissions.map((permission) => permission.id)).toEqual([
      "perm-1",
      "perm-2",
    ]);
  });
});

// ---------------------------------------------------------------------------
// SSE_EVENT — question.asked / question.replied / question.rejected
// ---------------------------------------------------------------------------

describe("SSE_EVENT: question.asked / question.replied / question.rejected", () => {
  const askedEvent: ChatEvent = {
    type: "question.asked",
    properties: {
      id: "q-1",
      sessionID: "s",
      questions: [{ question: "Which model?", options: [{ label: "A" }, { label: "B" }] }],
    },
  };

  it("populates pendingQuestion from the event properties", () => {
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event: askedEvent });
    expect(next.pendingQuestion).not.toBeNull();
    expect(next.pendingQuestion?.id).toBe("q-1");
  });

  it("clears pendingQuestion on question.replied", () => {
    const state = conversationReducer(initialState, { type: "SSE_EVENT", event: askedEvent });
    const replied: ChatEvent = {
      type: "question.replied",
      properties: { sessionID: "s", requestID: "q-1" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event: replied });
    expect(next.pendingQuestion).toBeNull();
  });

  it("clears pendingQuestion on question.rejected", () => {
    const state = conversationReducer(initialState, { type: "SSE_EVENT", event: askedEvent });
    const rejected: ChatEvent = {
      type: "question.rejected",
      properties: { sessionID: "s", requestID: "q-1" },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event: rejected });
    expect(next.pendingQuestion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HYDRATE_PENDING / DISCARD_STALE_PERMISSION / DISCARD_STALE_QUESTION
// ---------------------------------------------------------------------------

describe("HYDRATE_PENDING", () => {
  it("adopts the fetched snapshot on a fresh (empty) conversation", () => {
    const next = conversationReducer(initialState, {
      type: "HYDRATE_PENDING",
      pending: {
        permissions: [
          {
            id: "perm-fresh",
            sessionID: "s",
            permission: "bash",
            patterns: ["*.sh"],
            metadata: {},
            always: [],
            tool: { messageID: "m1", callID: "c1" },
          },
        ],
        question: {
          id: "q-fresh",
          sessionID: "s",
          questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
        },
        liveRequests: [],
      },
    });

    expect(next.pendingPermissions.map((permission) => permission.id)).toEqual(["perm-fresh"]);
    expect(next.pendingQuestion?.id).toBe("q-fresh");
  });

  it("merges the fetched snapshot with newer live events instead of dropping them", () => {
    // The fetch is async; a live SSE event can add a NEWER interaction before it
    // resolves. Merging (not replacing) must preserve that live interaction —
    // otherwise the older fetched snapshot would strand the prompt.
    const stateWithLiveEvents: ConversationState = {
      ...initialState,
      pendingPermissions: [
        {
          id: "sse-perm",
          sessionID: "s",
          permission: "write",
          patterns: [],
          metadata: {},
          always: [],
        },
      ],
      pendingQuestion: { id: "sse-q", sessionID: "s", questions: [] },
    };

    const next = conversationReducer(stateWithLiveEvents, {
      type: "HYDRATE_PENDING",
      pending: {
        permissions: [
          {
            id: "fetched-perm",
            sessionID: "s",
            permission: "read",
            patterns: [],
            metadata: {},
            always: [],
          },
        ],
        // Older snapshot predates the live question, so it carries none.
        question: null,
        liveRequests: [],
      },
    });

    expect(next.pendingPermissions.map((permission) => permission.id).sort()).toEqual([
      "fetched-perm",
      "sse-perm",
    ]);
    // The live question is preserved, not overwritten by the fetched null.
    expect(next.pendingQuestion?.id).toBe("sse-q");
  });

  it("leaves existing pending state untouched when the fetched snapshot is empty", () => {
    const stateWithLiveEvents: ConversationState = {
      ...initialState,
      pendingPermissions: [
        {
          id: "sse-perm",
          sessionID: "s",
          permission: "read",
          patterns: [],
          metadata: {},
          always: [],
        },
      ],
      pendingQuestion: { id: "sse-q", sessionID: "s", questions: [] },
    };

    const next = conversationReducer(stateWithLiveEvents, {
      type: "HYDRATE_PENDING",
      pending: { permissions: [], question: null, liveRequests: [] },
    });

    expect(next.pendingPermissions.map((permission) => permission.id)).toEqual(["sse-perm"]);
    expect(next.pendingQuestion?.id).toBe("sse-q");
  });
});

describe("DISCARD_STALE_PERMISSION", () => {
  it("removes only the named permission and keeps the rest", () => {
    const state: ConversationState = {
      ...initialState,
      pendingPermissions: [
        {
          id: "perm-1",
          sessionID: "s",
          permission: "read",
          patterns: [],
          metadata: {},
          always: [],
        },
        {
          id: "perm-2",
          sessionID: "s",
          permission: "write",
          patterns: [],
          metadata: {},
          always: [],
        },
      ],
    };

    const next = conversationReducer(state, {
      type: "DISCARD_STALE_PERMISSION",
      requestId: "perm-1",
    });

    expect(next.pendingPermissions.map((p) => p.id)).toEqual(["perm-2"]);
  });

  it("is a no-op when the id is not pending", () => {
    const next = conversationReducer(initialState, {
      type: "DISCARD_STALE_PERMISSION",
      requestId: "ghost",
    });
    expect(next.pendingPermissions).toEqual([]);
  });
});

describe("DISCARD_STALE_QUESTION", () => {
  it("clears pendingQuestion when the id matches", () => {
    const state: ConversationState = {
      ...initialState,
      pendingQuestion: { id: "q-1", sessionID: "s", questions: [] },
    };
    const next = conversationReducer(state, {
      type: "DISCARD_STALE_QUESTION",
      requestId: "q-1",
    });
    expect(next.pendingQuestion).toBeNull();
  });

  it("leaves an unrelated pendingQuestion untouched", () => {
    const state: ConversationState = {
      ...initialState,
      pendingQuestion: { id: "q-1", sessionID: "s", questions: [] },
    };
    const next = conversationReducer(state, {
      type: "DISCARD_STALE_QUESTION",
      requestId: "some-other-id",
    });
    expect(next.pendingQuestion?.id).toBe("q-1");
  });
});

// ---------------------------------------------------------------------------
// SSE_EVENT — todo.updated
// ---------------------------------------------------------------------------

describe("SSE_EVENT: todo.updated", () => {
  it("replaces the todos array with the event payload", () => {
    const todos: TodoItem[] = [
      { content: "Task A", status: "pending" },
      { content: "Task B", status: "in_progress", activeForm: "Doing Task B" },
      { content: "Task C", status: "completed" },
    ];
    const event: ChatEvent = {
      type: "todo.updated",
      properties: { sessionID: "s", todos },
    };
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event });
    expect(next.todos).toEqual(todos);
  });

  it("replaces a non-empty todos list with a new one", () => {
    const state: ConversationState = {
      ...initialState,
      todos: [{ content: "old", status: "pending" }],
    };
    const event: ChatEvent = {
      type: "todo.updated",
      properties: { sessionID: "s", todos: [{ content: "new", status: "completed" }] },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.todos).toHaveLength(1);
    expect(next.todos[0]?.content).toBe("new");
  });

  it("clears todos when the event payload is empty", () => {
    const state: ConversationState = {
      ...initialState,
      todos: [{ content: "task", status: "pending" }],
    };
    const event: ChatEvent = {
      type: "todo.updated",
      properties: { sessionID: "s", todos: [] },
    };
    const next = conversationReducer(state, { type: "SSE_EVENT", event });
    expect(next.todos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unknown / unhandled events
// ---------------------------------------------------------------------------

describe("unhandled events", () => {
  it("returns state unchanged for heartbeat events", () => {
    const event: ChatEvent = { type: "heartbeat", properties: {} };
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event });
    expect(next).toBe(initialState);
  });

  it("returns state unchanged for connected events", () => {
    const event: ChatEvent = { type: "connected", properties: {} };
    const next = conversationReducer(initialState, { type: "SSE_EVENT", event });
    expect(next).toBe(initialState);
  });
});
