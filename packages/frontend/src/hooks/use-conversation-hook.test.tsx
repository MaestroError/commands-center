import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Specialist,
  ChatEvent,
  ConversationDetail,
  ConversationSnapshot,
  LiveRequest,
  PendingInteractions,
} from "@cc/shared/schemas";
import { ApiRequestError } from "@/lib/api/client";

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistQuery: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  abortConversation: vi.fn(),
  cancelLiveRequest: vi.fn(),
  connectConversationEvents: vi.fn(),
  getActiveConversation: vi.fn(),
  getConversation: vi.fn(),
  getPendingInteractions: vi.fn(),
  rejectQuestion: vi.fn(),
  replyPermission: vi.fn(),
  replyQuestion: vi.fn(),
  resolveLiveRequest: vi.fn(),
  sendCommand: vi.fn(),
  sendPrompt: vi.fn(),
  sendShell: vi.fn(),
  startFreshConversation: vi.fn(),
  summarizeConversation: vi.fn(),
}));

import { useSpecialistQuery } from "@/hooks/use-specialists-query";
import {
  abortConversation,
  cancelLiveRequest,
  connectConversationEvents,
  getActiveConversation,
  getConversation,
  getPendingInteractions,
  rejectQuestion,
  replyPermission,
  replyQuestion,
  resolveLiveRequest,
  sendCommand,
  sendPrompt,
  sendShell,
  startFreshConversation,
  summarizeConversation,
} from "@/lib/api";

import { useConversation } from "./use-conversation";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeAgent(overrides: Partial<Specialist> = {}): Specialist {
  return {
    id: "agent-1",
    name: "Writer",
    slug: "writer",
    role: "Writes things",
    instructions: "Draft carefully.",
    defaultModel: "openai/gpt-4.1",
    status: "active",
    capabilities: {
      builtInSkills: [],
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    },
    workspacePath: ".cc/specialists/writer",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeConversation(overrides: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: "conv-1",
    agentId: "agent-1",
    opencodeSessionId: "sess-1",
    title: "Current conversation",
    status: "active",
    source: "chat",
    isCurrent: true,
    messageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messages: [],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    current: makeConversation(),
    previous: [],
    ...overrides,
  };
}

function makeLiveRequest(overrides: Partial<LiveRequest> = {}): LiveRequest {
  return {
    id: "live-1",
    conversationId: "conv-1",
    kind: "add_secret",
    presentation: { title: "Add secret", cancelLabel: "Cancel" },
    fields: [],
    actions: [],
    metadata: {},
    closable: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function noPendingInteractions(): PendingInteractions {
  return { permissions: [], question: null, liveRequests: [] };
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

async function* oneEvent(event: ChatEvent, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  await Promise.resolve();
  yield event;
  await waitForAbort(signal);
}

async function* reconnectingUpstream(
  signal: AbortSignal,
  reconnect: Promise<void>,
  eventAfterReconnect?: ChatEvent,
): AsyncGenerator<ChatEvent> {
  yield { type: "connected", properties: {} };
  yield { type: "upstream.connected", properties: { reconnected: false } };
  await reconnect;
  yield { type: "upstream.connected", properties: { reconnected: true } };
  if (eventAfterReconnect) {
    yield eventAfterReconnect;
  }
  await waitForAbort(signal);
}

describe("useConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(useSpecialistQuery).mockReturnValue({
      data: makeAgent(),
      error: null,
    } as ReturnType<typeof useSpecialistQuery>);
    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
      oneEvent({ type: "connected", properties: {} }, signal),
    );
    vi.mocked(getActiveConversation).mockResolvedValue(makeSnapshot());
    vi.mocked(getConversation).mockResolvedValue(makeConversation({ id: "conv-specific" }));
    vi.mocked(getPendingInteractions).mockResolvedValue(noPendingInteractions());
    vi.mocked(startFreshConversation).mockResolvedValue(
      makeSnapshot({ current: makeConversation({ id: "conv-fresh" }) }),
    );
    vi.mocked(sendPrompt).mockResolvedValue(undefined);
    vi.mocked(sendShell).mockResolvedValue(undefined);
    vi.mocked(sendCommand).mockResolvedValue(undefined);
    vi.mocked(summarizeConversation).mockResolvedValue(undefined);
    vi.mocked(abortConversation).mockResolvedValue(undefined);
    vi.mocked(replyPermission).mockResolvedValue(undefined);
    vi.mocked(replyQuestion).mockResolvedValue(undefined);
    vi.mocked(rejectQuestion).mockResolvedValue(undefined);
    vi.mocked(resolveLiveRequest).mockResolvedValue({ ok: true });
    vi.mocked(cancelLiveRequest).mockResolvedValue({ ok: true });
  });

  it("loads the active conversation for the resolved agent", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    expect(getActiveConversation).toHaveBeenCalledWith("agent-1");
    expect(connectConversationEvents).toHaveBeenCalledWith("conv-1", expect.any(AbortSignal));
    expect(result.current.conversation?.id).toBe("conv-1");
  });

  it("loads a specific conversation when an id is provided", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer", "conv-specific"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.conversation?.id).toBe("conv-specific");
    });

    expect(getActiveConversation).not.toHaveBeenCalled();
    expect(getConversation).toHaveBeenCalledWith("agent-1", "conv-specific");
  });

  it("adds an optimistic message and sends the prompt payload", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      result.current.sendUserPrompt("Ship it", [
        {
          type: "file",
          filename: "plan.md",
          mimeType: "text/markdown",
          dataUrl: "data:text/markdown;base64,cGxhbg==",
          sizeBytes: 42,
        },
      ]);
    });

    expect(result.current.conversation?.messages[0]).toMatchObject({
      role: "user",
      content: "Ship it",
      attachments: [
        { type: "file", filename: "plan.md", mimeType: "text/markdown", sizeBytes: 42 },
      ],
    });
    expect(sendPrompt).toHaveBeenCalledWith("conv-1", {
      text: "Ship it",
      attachments: [
        {
          type: "file",
          filename: "plan.md",
          mimeType: "text/markdown",
          dataUrl: "data:text/markdown;base64,cGxhbg==",
          sizeBytes: 42,
        },
      ],
    });
  });

  it("shows and clears send errors from failed prompt requests", async () => {
    vi.mocked(sendPrompt).mockRejectedValueOnce(new Error("CSRF token is invalid."));
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      result.current.sendUserPrompt("Try again");
    });

    await waitFor(() => {
      expect(result.current.sendError).toBe("CSRF token is invalid.");
    });

    act(() => {
      result.current.clearSendError();
    });

    expect(result.current.sendError).toBeNull();
  });

  it("shows session errors from async prompt event failures", async () => {
    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
      oneEvent(
        {
          type: "session.error",
          properties: {
            sessionID: "sess-1",
            error: {
              name: "APIError",
              message: "Provider rejected the attachment.",
            },
          },
        },
        signal,
      ),
    );
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.sendError).toBe("Provider rejected the attachment.");
    });
    expect(result.current.sessionStatus).toEqual({ type: "idle" });
  });

  it("resumes event delivery after applying a live request on a closed stream", async () => {
    let closeFirstStream: (() => void) | undefined;
    const firstStreamClosed = new Promise<void>((resolve) => {
      closeFirstStream = resolve;
    });
    let connectionAttempt = 0;

    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) => {
      connectionAttempt += 1;

      if (connectionAttempt === 1) {
        return (async function* (): AsyncGenerator<ChatEvent> {
          yield {
            type: "cc.live_request.opened",
            properties: { request: makeLiveRequest() },
          };
          await firstStreamClosed;
        })();
      }

      return oneEvent({ type: "connected", properties: {} }, signal);
    });
    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({
        messages: [
          {
            id: "assistant-after-apply",
            conversationId: "conv-1",
            role: "assistant",
            content: "Applied successfully.",
            parts: [{ id: "part-after-apply", type: "text", text: "Applied successfully." }],
            attachments: [],
            createdAt: "2026-01-01T00:01:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
          },
        ],
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.liveRequests).toHaveLength(1);
    });

    await act(async () => {
      closeFirstStream?.();
      await result.current.resolveLiveRequest("live-1", "approve", {});
    });

    expect(resolveLiveRequest).toHaveBeenCalledWith("conv-1", "live-1", {
      action: "approve",
      values: {},
    });
    await waitFor(() => {
      expect(result.current.conversation?.messages).toContainEqual(
        expect.objectContaining({ id: "assistant-after-apply" }),
      );
    });
    expect(connectConversationEvents).toHaveBeenCalledTimes(2);
  });

  it("keeps a reconnected stream active when state reconciliation fails", async () => {
    let connectionAttempt = 0;

    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) => {
      connectionAttempt += 1;

      if (connectionAttempt === 1) {
        return (async function* (): AsyncGenerator<ChatEvent> {
          await Promise.resolve();
          yield { type: "connected", properties: {} };
        })();
      }

      return (async function* (): AsyncGenerator<ChatEvent> {
        yield { type: "connected", properties: {} };
        yield {
          type: "message.updated",
          properties: {
            sessionID: "sess-1",
            message: {
              id: "assistant-after-failed-refresh",
              conversationId: "",
              role: "assistant",
              content: "",
              parts: [],
              attachments: [],
              createdAt: "2026-01-01T00:02:00.000Z",
              updatedAt: "2026-01-01T00:02:00.000Z",
            },
          },
        };
        await waitForAbort(signal);
      })();
    });
    vi.mocked(getConversation).mockRejectedValue(new Error("refresh failed"));

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.conversation?.messages).toContainEqual(
        expect.objectContaining({ id: "assistant-after-failed-refresh" }),
      );
    });
    expect(connectConversationEvents).toHaveBeenCalledTimes(2);
  });

  it("restores messages missed during an upstream reconnect without closing browser SSE", async () => {
    let reconnectUpstream: (() => void) | undefined;
    const reconnect = new Promise<void>((resolve) => {
      reconnectUpstream = resolve;
    });
    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
      reconnectingUpstream(signal, reconnect),
    );
    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({
        messages: [
          {
            id: "assistant-missed-during-outage",
            conversationId: "conv-1",
            role: "assistant",
            content: "Recovered.",
            parts: [{ id: "part-recovered", type: "text", text: "Recovered." }],
            attachments: [],
            createdAt: "2026-01-01T00:03:00.000Z",
            updatedAt: "2026-01-01T00:03:00.000Z",
          },
        ],
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });
    expect(getConversation).not.toHaveBeenCalled();

    reconnectUpstream?.();

    await waitFor(() => {
      expect(result.current.conversation?.messages).toContainEqual(
        expect.objectContaining({ id: "assistant-missed-during-outage" }),
      );
    });
    expect(connectConversationEvents).toHaveBeenCalledTimes(1);
  });

  it("rehydrates pending interactions after an upstream reconnect", async () => {
    let reconnectUpstream: (() => void) | undefined;
    const reconnect = new Promise<void>((resolve) => {
      reconnectUpstream = resolve;
    });
    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
      reconnectingUpstream(signal, reconnect),
    );
    vi.mocked(getPendingInteractions)
      .mockResolvedValueOnce(noPendingInteractions())
      .mockResolvedValueOnce({
        permissions: [
          {
            id: "permission-missed-during-outage",
            sessionID: "sess-1",
            permission: "bash",
            patterns: [],
            metadata: {},
            always: [],
          },
        ],
        question: null,
        liveRequests: [],
      });

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => {
      expect(getPendingInteractions).toHaveBeenCalledTimes(1);
    });

    reconnectUpstream?.();

    await waitFor(() => {
      expect(result.current.pendingPermission?.id).toBe("permission-missed-during-outage");
    });
  });

  it("keeps a live message delivered after reconnect hydration", async () => {
    let reconnectUpstream: (() => void) | undefined;
    const reconnect = new Promise<void>((resolve) => {
      reconnectUpstream = resolve;
    });
    const liveMessage: ChatEvent = {
      type: "message.updated",
      properties: {
        sessionID: "sess-1",
        message: {
          id: "assistant-live-after-reconnect",
          conversationId: "",
          role: "assistant",
          content: "",
          parts: [],
          attachments: [],
          createdAt: "2026-01-01T00:04:00.000Z",
          updatedAt: "2026-01-01T00:04:00.000Z",
        },
      },
    };
    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
      reconnectingUpstream(signal, reconnect, liveMessage),
    );
    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({
        messages: [
          {
            id: "assistant-hydrated-on-reconnect",
            conversationId: "conv-1",
            role: "assistant",
            content: "Persisted.",
            parts: [{ id: "part-persisted", type: "text", text: "Persisted." }],
            attachments: [],
            createdAt: "2026-01-01T00:03:00.000Z",
            updatedAt: "2026-01-01T00:03:00.000Z",
          },
        ],
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    reconnectUpstream?.();

    await waitFor(() => {
      expect(result.current.conversation?.messages.map((message) => message.id)).toEqual([
        "assistant-hydrated-on-reconnect",
        "assistant-live-after-reconnect",
      ]);
    });
  });

  it("forwards conversation actions to the API layer", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    result.current.sendShell("ls");
    result.current.sendCommand("model", "gpt-4.1");
    result.current.summarize();
    result.current.abort();
    result.current.replyPermission("perm-1", "once");
    result.current.replyQuestion("question-1", [["A"]]);
    result.current.rejectQuestion("question-2");
    await result.current.resolveLiveRequest("live-1", "approve", { path: "README.md" });
    await result.current.cancelLiveRequest("live-2", "No longer needed");

    expect(sendShell).toHaveBeenCalledWith("conv-1", "ls");
    expect(sendCommand).toHaveBeenCalledWith("conv-1", "model", "gpt-4.1");
    expect(summarizeConversation).toHaveBeenCalledWith("conv-1");
    expect(abortConversation).toHaveBeenCalledWith("conv-1");
    expect(replyPermission).toHaveBeenCalledWith("conv-1", "perm-1", "once");
    expect(replyQuestion).toHaveBeenCalledWith("conv-1", "question-1", [["A"]]);
    expect(rejectQuestion).toHaveBeenCalledWith("conv-1", "question-2");
    expect(resolveLiveRequest).toHaveBeenCalledWith("conv-1", "live-1", {
      action: "approve",
      values: { path: "README.md" },
    });
    expect(cancelLiveRequest).toHaveBeenCalledWith("conv-1", "live-2", {
      reason: "No longer needed",
    });
  });

  it("hydrates fresh and switched conversations from action responses", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      result.current.startFresh();
    });

    await waitFor(() => {
      expect(result.current.conversation?.id).toBe("conv-fresh");
    });

    act(() => {
      result.current.switchConversation("conv-specific");
    });

    await waitFor(() => {
      expect(result.current.conversation?.id).toBe("conv-specific");
    });
  });

  it("auto-replies to permission events when auto approve is enabled", async () => {
    window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
      oneEvent(
        {
          type: "permission.asked",
          properties: {
            id: "perm-1",
            sessionID: "sess-1",
            permission: "bash",
            patterns: [],
            metadata: {},
            always: [],
          },
        },
        signal,
      ),
    );
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(replyPermission).toHaveBeenCalledWith("conv-1", "perm-1", "once");
    });

    expect(result.current.autoApprove).toBe(true);
    expect(result.current.pendingPermission).toBeNull();
  });

  it("persists auto approve changes per specialist slug", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    act(() => {
      result.current.setAutoApprove(true);
    });

    expect(window.localStorage.getItem("cc-specialist-auto-approve-writer")).toBe("true");
    expect(result.current.autoApprove).toBe(true);
  });

  describe("pending interaction rehydration", () => {
    it("rehydrates a pending permission, question, and live request on open", async () => {
      vi.mocked(getPendingInteractions).mockResolvedValue({
        permissions: [
          {
            id: "perm-1",
            sessionID: "sess-1",
            permission: "bash",
            patterns: ["rm *"],
            metadata: {},
            always: [],
          },
        ],
        question: {
          id: "q-1",
          sessionID: "sess-1",
          questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
        },
        liveRequests: [makeLiveRequest()],
      });
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(getPendingInteractions).toHaveBeenCalledWith("conv-1");
      });
      await waitFor(() => {
        expect(result.current.pendingPermission?.id).toBe("perm-1");
      });

      expect(result.current.pendingQuestion?.id).toBe("q-1");
      expect(result.current.liveRequests).toHaveLength(1);
      expect(result.current.liveRequests[0]?.id).toBe("live-1");
    });

    it("auto-replies to rehydrated permissions when auto approve is enabled, without surfacing them", async () => {
      window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
      vi.mocked(getPendingInteractions).mockResolvedValue({
        permissions: [
          {
            id: "perm-rehydrated",
            sessionID: "sess-1",
            permission: "bash",
            patterns: [],
            metadata: {},
            always: [],
          },
        ],
        question: null,
        liveRequests: [],
      });
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(replyPermission).toHaveBeenCalledWith("conv-1", "perm-rehydrated", "once");
      });

      expect(result.current.pendingPermission).toBeNull();
    });

    it("surfaces a rehydrated permission when its auto-approve reply fails", async () => {
      window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
      vi.mocked(replyPermission).mockRejectedValue(new Error("network down"));
      vi.mocked(getPendingInteractions).mockResolvedValue({
        permissions: [
          {
            id: "perm-flaky-approve",
            sessionID: "sess-1",
            permission: "bash",
            patterns: [],
            metadata: {},
            always: [],
          },
        ],
        question: null,
        liveRequests: [],
      });
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });

      // The auto-reply was attempted but failed, so the permission must not
      // silently vanish — it's surfaced for the operator to act on.
      await waitFor(() => {
        expect(result.current.pendingPermission?.id).toBe("perm-flaky-approve");
      });
    });

    it("drops a stale permission reply from local state on a 404", async () => {
      vi.mocked(getPendingInteractions).mockResolvedValue({
        permissions: [
          {
            id: "perm-stale",
            sessionID: "sess-1",
            permission: "bash",
            patterns: [],
            metadata: {},
            always: [],
          },
        ],
        question: null,
        liveRequests: [],
      });
      vi.mocked(replyPermission).mockRejectedValue(
        new ApiRequestError('Pending request "perm-stale" no longer exists.', 404),
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.pendingPermission?.id).toBe("perm-stale");
      });

      act(() => {
        result.current.replyPermission("perm-stale", "once");
      });

      await waitFor(() => {
        expect(result.current.pendingPermission).toBeNull();
      });
    });

    it("keeps a permission pending when the reply fails for a non-stale reason", async () => {
      vi.mocked(getPendingInteractions).mockResolvedValue({
        permissions: [
          {
            id: "perm-flaky",
            sessionID: "sess-1",
            permission: "bash",
            patterns: [],
            metadata: {},
            always: [],
          },
        ],
        question: null,
        liveRequests: [],
      });
      vi.mocked(replyPermission).mockRejectedValue(new ApiRequestError("Internal error.", 500));
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.pendingPermission?.id).toBe("perm-flaky");
      });

      act(() => {
        result.current.replyPermission("perm-flaky", "once");
      });

      await waitFor(() => {
        expect(replyPermission).toHaveBeenCalledWith("conv-1", "perm-flaky", "once");
      });

      expect(result.current.pendingPermission?.id).toBe("perm-flaky");
    });

    it("drops a stale question on reply and reject 404s", async () => {
      vi.mocked(getPendingInteractions).mockResolvedValue({
        permissions: [],
        question: {
          id: "q-stale",
          sessionID: "sess-1",
          questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
        },
        liveRequests: [],
      });
      vi.mocked(replyQuestion).mockRejectedValue(
        new ApiRequestError('Pending request "q-stale" no longer exists.', 404),
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.pendingQuestion?.id).toBe("q-stale");
      });

      act(() => {
        result.current.replyQuestion("q-stale", [["Yes"]]);
      });

      await waitFor(() => {
        expect(result.current.pendingQuestion).toBeNull();
      });
    });

    it("does not rehydrate when getPendingInteractions fails", async () => {
      vi.mocked(getPendingInteractions).mockRejectedValue(new Error("network down"));
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.status).toBe("ready");
      });
      await waitFor(() => {
        expect(getPendingInteractions).toHaveBeenCalled();
      });

      expect(result.current.pendingPermission).toBeNull();
      expect(result.current.pendingQuestion).toBeNull();
    });
  });
});
