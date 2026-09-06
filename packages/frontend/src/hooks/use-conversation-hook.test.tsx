import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Specialist,
  ChatEvent,
  ConversationDetail,
  ConversationMessagePage,
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
  getOlderMessages: vi.fn(),
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
  getOlderMessages,
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

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function* connectedThen(event: ChatEvent, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  yield { type: "connected", properties: {} };
  yield event;
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

  it.each(["success", "failure"] as const)(
    "keeps paging available after navigation with a late %s",
    async (outcome) => {
      const firstPage = createDeferred<ConversationMessagePage>();
      const secondPage = createDeferred<ConversationMessagePage>();
      const message = {
        id: "newest",
        conversationId: "conv-1",
        role: "assistant" as const,
        content: "Reply",
        parts: [],
        attachments: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
      vi.mocked(getActiveConversation).mockResolvedValue(
        makeSnapshot({
          current: makeConversation({ messages: [message], hasMoreMessages: true }),
        }),
      );
      vi.mocked(getConversation).mockResolvedValue(
        makeConversation({
          id: "conv-2",
          messages: [{ ...message, conversationId: "conv-2" }],
          hasMoreMessages: true,
        }),
      );
      vi.mocked(getOlderMessages)
        .mockReturnValueOnce(firstPage.promise)
        .mockReturnValueOnce(secondPage.promise);
      const { result, unmount } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(createQueryClient()),
      });
      await waitFor(() => expect(result.current.status).toBe("ready"));
      act(() => {
        void result.current.loadOlderMessages();
      });
      act(() => {
        result.current.switchConversation("conv-2");
      });
      await waitFor(() => expect(result.current.conversation?.id).toBe("conv-2"));
      expect(result.current.loadingOlderMessages).toBe(false);
      act(() => {
        void result.current.loadOlderMessages();
      });
      expect(getOlderMessages).toHaveBeenLastCalledWith("conv-2", "newest");
      await act(async () => {
        if (outcome === "success") firstPage.resolve({ messages: [], hasMore: false });
        else firstPage.reject(new Error("Old conversation request failed"));
        await firstPage.promise.catch(() => {});
      });
      expect(result.current.loadingOlderMessages).toBe(true);
      expect(result.current.olderMessagesError).toBeNull();
      await act(async () => {
        secondPage.resolve({ messages: [], hasMore: false });
        await secondPage.promise;
      });
      expect(result.current.loadingOlderMessages).toBe(false);
      unmount();
    },
  );

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
          yield { type: "connected", properties: {} };
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
      expect(connectConversationEvents).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(result.current.conversation?.messages).toContainEqual(
        expect.objectContaining({ id: "assistant-after-apply" }),
      );
    });
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

  it("ignores a reconnect detail snapshot superseded by message, part, and status events", async () => {
    const reconnect = createDeferred<void>();
    const detail = createDeferred<ConversationDetail>();
    vi.mocked(getConversation).mockReturnValue(detail.promise);
    vi.mocked(connectConversationEvents).mockImplementation(
      async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
        yield { type: "connected", properties: {} };
        await reconnect.promise;
        yield { type: "connected", properties: { reconnected: true } };
        yield {
          type: "message.updated",
          properties: {
            sessionID: "sess-1",
            message: {
              id: "assistant-race",
              conversationId: "conv-1",
              role: "assistant",
              content: "New message",
              parts: [],
              attachments: [],
              createdAt: "2026-01-01T00:01:00.000Z",
              updatedAt: "2026-01-01T00:01:00.000Z",
            },
          },
        };
        yield {
          type: "message.part.updated",
          properties: {
            sessionID: "sess-1",
            messageID: "assistant-race",
            part: { id: "part-race", type: "text", text: "New part" },
          },
        };
        yield {
          type: "session.status",
          properties: { sessionID: "sess-1", status: { type: "busy" } },
        };
        await waitForAbort(signal);
      },
    );
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    reconnect.resolve();
    await waitFor(() => expect(result.current.sessionStatus).toEqual({ type: "busy" }));
    detail.resolve(
      makeConversation({
        messages: [
          {
            id: "assistant-race",
            conversationId: "conv-1",
            role: "assistant",
            content: "Stale message",
            parts: [{ id: "part-race", type: "text", text: "Stale part" }],
            attachments: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    await act(async () => Promise.resolve());

    expect(result.current.conversation?.messages[0]?.content).toBe("New message");
    expect(result.current.parts["assistant-race"]?.[0]).toMatchObject({ text: "New part" });
    expect(result.current.sessionStatus).toEqual({ type: "busy" });
  });

  it("preserves a replayed watchdog error after reconnect detail hydration resolves", async () => {
    const reconnect = createDeferred<void>();
    const detail = createDeferred<ConversationDetail>();
    vi.mocked(getConversation).mockReturnValue(detail.promise);
    vi.mocked(connectConversationEvents).mockImplementation(
      async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
        yield { type: "connected", properties: {} };
        await reconnect.promise;
        yield { type: "connected", properties: { reconnected: true } };
        yield {
          type: "session.error",
          properties: {
            sessionID: "sess-1",
            error: {
              name: "ChatNoProgressError",
              message: "Response stopped automatically.",
            },
          },
        };
        await waitForAbort(signal);
      },
    );
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    reconnect.resolve();
    await waitFor(() => expect(result.current.sendError).toBe("Response stopped automatically."));
    detail.resolve(makeConversation());
    await act(async () => Promise.resolve());

    expect(result.current.sendError).toBe("Response stopped automatically.");
  });

  it("keeps the newest of overlapping reconnect detail snapshots", async () => {
    const firstReconnect = createDeferred<void>();
    const secondReconnect = createDeferred<void>();
    const firstDetail = createDeferred<ConversationDetail>();
    const secondDetail = createDeferred<ConversationDetail>();
    vi.mocked(getConversation)
      .mockReturnValueOnce(firstDetail.promise)
      .mockReturnValueOnce(secondDetail.promise);
    vi.mocked(connectConversationEvents).mockImplementation(
      async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
        yield { type: "connected", properties: {} };
        await firstReconnect.promise;
        yield { type: "connected", properties: { reconnected: true } };
        await secondReconnect.promise;
        yield { type: "connected", properties: { reconnected: true } };
        await waitForAbort(signal);
      },
    );
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    firstReconnect.resolve();
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(1));
    secondReconnect.resolve();
    await waitFor(() => expect(getConversation).toHaveBeenCalledTimes(2));
    secondDetail.resolve(makeConversation({ title: "Newest detail" }));
    await waitFor(() => expect(result.current.conversation?.title).toBe("Newest detail"));
    firstDetail.resolve(makeConversation({ title: "Older detail" }));
    await act(async () => Promise.resolve());

    expect(result.current.conversation?.title).toBe("Newest detail");
  });

  it("removes interactions resolved while the event stream was disconnected", async () => {
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
            type: "permission.asked",
            properties: {
              id: "resolved-permission",
              sessionID: "sess-1",
              permission: "bash",
              patterns: [],
              metadata: {},
              always: [],
            },
          };
          yield {
            type: "question.asked",
            properties: {
              id: "resolved-question",
              sessionID: "sess-1",
              questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
            },
          };
          await firstStreamClosed;
        })();
      }

      return oneEvent({ type: "connected", properties: {} }, signal);
    });
    vi.mocked(getPendingInteractions).mockResolvedValue(noPendingInteractions());
    vi.mocked(getConversation).mockResolvedValue(makeConversation());
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.pendingPermission?.id).toBe("resolved-permission"));
    expect(result.current.pendingQuestion?.id).toBe("resolved-question");

    closeFirstStream?.();

    await waitFor(() => expect(connectConversationEvents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.pendingPermission).toBeNull());
    expect(result.current.pendingQuestion).toBeNull();
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

  it("surfaces a live permission when its auto-approve reply fails", async () => {
    window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
    vi.mocked(replyPermission).mockRejectedValue(new Error("network down"));
    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
      oneEvent(
        {
          type: "permission.asked",
          properties: {
            id: "perm-descendant",
            sessionID: "child-session",
            permission: "external_directory",
            patterns: ["/shared/*"],
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
      expect(result.current.pendingPermission?.id).toBe("perm-descendant");
    });
  });

  it("does not resurface a stale live permission after auto-approve", async () => {
    window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
    vi.mocked(replyPermission).mockRejectedValue(
      new ApiRequestError('Pending request "perm-stale" no longer exists.', 404),
    );
    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
      oneEvent(
        {
          type: "permission.asked",
          properties: {
            id: "perm-stale",
            sessionID: "child-session",
            permission: "external_directory",
            patterns: ["/shared/*"],
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

    await waitFor(() => expect(replyPermission).toHaveBeenCalled());

    expect(result.current.pendingPermission).toBeNull();
  });

  it("does not resurrect a live permission when its reply response fails after terminal SSE", async () => {
    window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
    const reply = createDeferred<void>();
    const publishTerminal = createDeferred<void>();
    const terminalConsumed = createDeferred<void>();
    vi.mocked(replyPermission).mockReturnValue(reply.promise);
    vi.mocked(connectConversationEvents).mockImplementation(
      async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
        yield { type: "connected", properties: {} };
        yield {
          type: "permission.asked",
          properties: {
            id: "perm-live-terminal",
            sessionID: "child-session",
            permission: "external_directory",
            patterns: ["/shared/*"],
            metadata: {},
            always: [],
          },
        };
        await publishTerminal.promise;
        yield {
          type: "permission.replied",
          properties: {
            sessionID: "child-session",
            requestID: "perm-live-terminal",
            reply: "once",
          },
        };
        terminalConsumed.resolve();
        await waitForAbort(signal);
      },
    );
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(replyPermission).toHaveBeenCalled());

    publishTerminal.resolve();
    await terminalConsumed.promise;
    reply.reject(new ApiRequestError("response lost", 500));
    await act(async () => Promise.resolve());

    expect(result.current.pendingPermission).toBeNull();
  });

  it("does not resurrect a live permission when its reply fails after reconnect reconciliation", async () => {
    window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
    const reply = createDeferred<void>();
    const closeFirstStream = createDeferred<void>();
    let connectionAttempt = 0;
    vi.mocked(replyPermission).mockReturnValue(reply.promise);
    vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) => {
      connectionAttempt += 1;
      if (connectionAttempt === 1) {
        return (async function* (): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          yield {
            type: "permission.asked",
            properties: {
              id: "perm-live-reconnected",
              sessionID: "child-session",
              permission: "external_directory",
              patterns: ["/shared/*"],
              metadata: {},
              always: [],
            },
          };
          await closeFirstStream.promise;
        })();
      }

      return oneEvent({ type: "connected", properties: {} }, signal);
    });
    vi.mocked(getConversation).mockResolvedValue(
      makeConversation({ title: "Reconnected conversation" }),
    );
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(replyPermission).toHaveBeenCalledTimes(1));

    closeFirstStream.resolve();
    await waitFor(() => expect(connectConversationEvents).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.conversation?.title).toBe("Reconnected conversation"),
    );
    reply.reject(new ApiRequestError("response lost", 500));
    await act(async () => Promise.resolve());

    expect(result.current.pendingPermission).toBeNull();
  });

  it("reconciles a live permission after an upstream reconnect when detail refresh fails", async () => {
    window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
    const reply = createDeferred<void>();
    const reconnect = createDeferred<void>();
    vi.mocked(replyPermission).mockReturnValue(reply.promise);
    vi.mocked(getConversation).mockRejectedValue(new Error("refresh failed"));
    vi.mocked(connectConversationEvents).mockImplementation(
      async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
        yield { type: "connected", properties: {} };
        yield {
          type: "permission.asked",
          properties: {
            id: "perm-live-upstream-reconnected",
            sessionID: "child-session",
            permission: "external_directory",
            patterns: ["/shared/*"],
            metadata: {},
            always: [],
          },
        };
        await reconnect.promise;
        yield { type: "connected", properties: { reconnected: true } };
        await waitForAbort(signal);
      },
    );
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useConversation("writer"), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(replyPermission).toHaveBeenCalledTimes(1));

    reconnect.resolve();
    await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledTimes(2));
    reply.reject(new ApiRequestError("response lost", 500));
    await act(async () => Promise.resolve());

    expect(connectConversationEvents).toHaveBeenCalledTimes(1);
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
    it("waits for the event stream readiness before initial hydration", async () => {
      const ready = createDeferred<void>();
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          await ready.promise;
          yield { type: "connected", properties: {} };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(connectConversationEvents).toHaveBeenCalled());

      expect(getPendingInteractions).not.toHaveBeenCalled();

      ready.resolve();
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledWith("conv-1"));
    });

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

    it("does not resurrect a permission resolved during initial hydration", async () => {
      const pending = createDeferred<PendingInteractions>();
      vi.mocked(getPendingInteractions).mockReturnValueOnce(pending.promise);
      vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
        connectedThen(
          {
            type: "permission.replied",
            properties: { sessionID: "sess-1", requestID: "perm-race", reply: "once" },
          },
          signal,
        ),
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(connectConversationEvents).toHaveBeenCalled());

      pending.resolve({
        permissions: [
          {
            id: "perm-race",
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

      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalled());
      expect(result.current.pendingPermission).toBeNull();
    });

    it("does not resurrect a question rejected during initial hydration", async () => {
      const pending = createDeferred<PendingInteractions>();
      vi.mocked(getPendingInteractions).mockReturnValueOnce(pending.promise);
      vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
        connectedThen(
          {
            type: "question.rejected",
            properties: { sessionID: "sess-1", requestID: "question-race" },
          },
          signal,
        ),
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(connectConversationEvents).toHaveBeenCalled());

      const question = {
        id: "question-race",
        sessionID: "sess-1",
        questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
      };
      pending.resolve({ permissions: [], question, questions: [question], liveRequests: [] });

      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalled());
      expect(result.current.pendingQuestion).toBeNull();
    });

    it("does not resurrect a live request resolved during initial hydration", async () => {
      const pending = createDeferred<PendingInteractions>();
      vi.mocked(getPendingInteractions).mockReturnValueOnce(pending.promise);
      vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) =>
        connectedThen(
          {
            type: "cc.live_request.resolved",
            properties: { requestId: "live-1" },
          },
          signal,
        ),
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(connectConversationEvents).toHaveBeenCalled());

      pending.resolve({ permissions: [], question: null, liveRequests: [makeLiveRequest()] });

      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalled());
      expect(result.current.liveRequests).toEqual([]);
    });

    it("ignores an initial snapshot superseded by reconnect reconciliation", async () => {
      const initialPending = createDeferred<PendingInteractions>();
      const reconnectPending = createDeferred<PendingInteractions>();
      const reconnect = createDeferred<void>();
      vi.mocked(getPendingInteractions)
        .mockReturnValueOnce(initialPending.promise)
        .mockReturnValueOnce(reconnectPending.promise);
      vi.mocked(getConversation).mockResolvedValue(makeConversation());
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await reconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledOnce());

      reconnect.resolve();
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledTimes(2));
      reconnectPending.resolve(noPendingInteractions());
      await act(async () => Promise.resolve());
      initialPending.resolve({
        permissions: [
          {
            id: "stale-permission",
            sessionID: "sess-1",
            permission: "bash",
            patterns: [],
            metadata: {},
            always: [],
          },
        ],
        question: {
          id: "stale-question",
          sessionID: "sess-1",
          questions: [{ question: "Stale?", options: [{ label: "Yes" }] }],
        },
        liveRequests: [makeLiveRequest({ id: "stale-live" })],
      });
      await act(async () => Promise.resolve());

      expect(result.current.pendingPermission).toBeNull();
      expect(result.current.pendingQuestion).toBeNull();
      expect(result.current.liveRequests).toEqual([]);
    });

    it("applies an older successful snapshot when a newer reconnect snapshot fails", async () => {
      const initialPending = createDeferred<PendingInteractions>();
      const reconnect = createDeferred<void>();
      vi.mocked(getPendingInteractions)
        .mockReturnValueOnce(initialPending.promise)
        .mockRejectedValueOnce(new Error("reconnect failed"));
      vi.mocked(getConversation).mockResolvedValue(makeConversation());
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await reconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledOnce());

      reconnect.resolve();
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledTimes(2));
      initialPending.resolve({
        permissions: [
          {
            id: "initial-permission",
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

      await waitFor(() => expect(result.current.pendingPermission?.id).toBe("initial-permission"));
    });

    it("keeps the newest of overlapping reconnect snapshots", async () => {
      const firstReconnectPending = createDeferred<PendingInteractions>();
      const secondReconnectPending = createDeferred<PendingInteractions>();
      const firstReconnect = createDeferred<void>();
      const secondReconnect = createDeferred<void>();
      vi.mocked(getPendingInteractions)
        .mockResolvedValueOnce(noPendingInteractions())
        .mockReturnValueOnce(firstReconnectPending.promise)
        .mockReturnValueOnce(secondReconnectPending.promise);
      vi.mocked(getConversation).mockResolvedValue(makeConversation());
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await firstReconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          await secondReconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledOnce());

      firstReconnect.resolve();
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledTimes(2));
      secondReconnect.resolve();
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledTimes(3));
      secondReconnectPending.resolve({
        permissions: [
          {
            id: "new-permission",
            sessionID: "sess-1",
            permission: "bash",
            patterns: [],
            metadata: {},
            always: [],
          },
        ],
        question: {
          id: "new-question",
          sessionID: "sess-1",
          questions: [{ question: "New?", options: [{ label: "Yes" }] }],
        },
        liveRequests: [makeLiveRequest({ id: "new-live" })],
      });
      await waitFor(() => expect(result.current.pendingPermission?.id).toBe("new-permission"));
      firstReconnectPending.resolve(noPendingInteractions());
      await act(async () => Promise.resolve());

      expect(result.current.pendingPermission?.id).toBe("new-permission");
      expect(result.current.pendingQuestion?.id).toBe("new-question");
      expect(result.current.liveRequests[0]?.id).toBe("new-live");
    });

    it("keeps a descendant permission opened after reconnect hydration began", async () => {
      const reconnectPending = createDeferred<PendingInteractions>();
      const reconnect = createDeferred<void>();
      vi.mocked(getPendingInteractions)
        .mockResolvedValueOnce(noPendingInteractions())
        .mockReturnValueOnce(reconnectPending.promise);
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await reconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          yield {
            type: "permission.asked",
            properties: {
              id: "permission-newer-than-snapshot",
              sessionID: "nested-session",
              permission: "external_directory",
              patterns: ["/shared/*"],
              metadata: {},
              always: [],
            },
          };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledOnce());

      reconnect.resolve();
      await waitFor(() =>
        expect(result.current.pendingPermission?.id).toBe("permission-newer-than-snapshot"),
      );
      reconnectPending.resolve(noPendingInteractions());
      await act(async () => Promise.resolve());

      expect(result.current.autoApprove).toBe(false);
      expect(result.current.pendingPermission?.id).toBe("permission-newer-than-snapshot");
      expect(replyPermission).not.toHaveBeenCalled();
    });

    it("keeps a question opened after reconnect hydration began", async () => {
      const reconnectPending = createDeferred<PendingInteractions>();
      const reconnect = createDeferred<void>();
      vi.mocked(getPendingInteractions)
        .mockResolvedValueOnce(noPendingInteractions())
        .mockReturnValueOnce(reconnectPending.promise);
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await reconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          yield {
            type: "question.asked",
            properties: {
              id: "question-newer-than-snapshot",
              sessionID: "nested-session",
              questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
            },
          };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledOnce());

      reconnect.resolve();
      await waitFor(() =>
        expect(result.current.pendingQuestion?.id).toBe("question-newer-than-snapshot"),
      );
      reconnectPending.resolve(noPendingInteractions());
      await act(async () => Promise.resolve());

      expect(result.current.pendingQuestion?.id).toBe("question-newer-than-snapshot");
    });

    it("keeps a live request opened after reconnect hydration began", async () => {
      const reconnectPending = createDeferred<PendingInteractions>();
      const reconnect = createDeferred<void>();
      vi.mocked(getPendingInteractions)
        .mockResolvedValueOnce(noPendingInteractions())
        .mockReturnValueOnce(reconnectPending.promise);
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await reconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          yield {
            type: "cc.live_request.opened",
            properties: { request: makeLiveRequest({ id: "live-newer-than-snapshot" }) },
          };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledOnce());

      reconnect.resolve();
      await waitFor(() =>
        expect(result.current.liveRequests[0]?.id).toBe("live-newer-than-snapshot"),
      );
      reconnectPending.resolve(noPendingInteractions());
      await act(async () => Promise.resolve());

      expect(result.current.liveRequests[0]?.id).toBe("live-newer-than-snapshot");
    });

    it("surfaces an auto-approved permission opened during reconnect after a transient failure", async () => {
      window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
      const reconnectPending = createDeferred<PendingInteractions>();
      const reconnect = createDeferred<void>();
      const reply = createDeferred<void>();
      vi.mocked(replyPermission).mockReturnValue(reply.promise);
      vi.mocked(getConversation).mockResolvedValue(makeConversation());
      vi.mocked(getPendingInteractions)
        .mockResolvedValueOnce(noPendingInteractions())
        .mockReturnValueOnce(reconnectPending.promise);
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await reconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          yield {
            type: "permission.asked",
            properties: {
              id: "permission-auto-newer-than-snapshot",
              sessionID: "nested-session",
              permission: "external_directory",
              patterns: ["/shared/*"],
              metadata: {},
              always: [],
            },
          };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledOnce());

      reconnect.resolve();
      await waitFor(() => expect(replyPermission).toHaveBeenCalledOnce());
      reconnectPending.resolve(noPendingInteractions());
      await act(async () => Promise.resolve());
      reply.reject(new ApiRequestError("response lost", 500));

      await waitFor(() =>
        expect(result.current.pendingPermission?.id).toBe("permission-auto-newer-than-snapshot"),
      );
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

    it("does not surface a stale rehydrated permission after auto-approve", async () => {
      window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
      vi.mocked(replyPermission).mockRejectedValue(
        new ApiRequestError('Pending request "perm-stale" no longer exists.', 410),
      );
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
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(replyPermission).toHaveBeenCalled());

      expect(result.current.pendingPermission).toBeNull();
    });

    it("does not resurrect a hydrated permission when its reply response fails after terminal SSE", async () => {
      window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
      const reply = createDeferred<void>();
      const publishTerminal = createDeferred<void>();
      const terminalConsumed = createDeferred<void>();
      vi.mocked(replyPermission).mockReturnValue(reply.promise);
      vi.mocked(getPendingInteractions).mockResolvedValue({
        permissions: [
          {
            id: "perm-hydrated-terminal",
            sessionID: "child-session",
            permission: "external_directory",
            patterns: ["/shared/*"],
            metadata: {},
            always: [],
          },
        ],
        question: null,
        liveRequests: [],
      });
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await publishTerminal.promise;
          yield {
            type: "permission.replied",
            properties: {
              sessionID: "child-session",
              requestID: "perm-hydrated-terminal",
              reply: "once",
            },
          };
          terminalConsumed.resolve();
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(replyPermission).toHaveBeenCalled());

      publishTerminal.resolve();
      await terminalConsumed.promise;
      reply.reject(new ApiRequestError("response lost", 500));
      await act(async () => Promise.resolve());

      expect(result.current.pendingPermission).toBeNull();
    });

    it("does not resurrect a hydrated permission when its reply fails after reconnect reconciliation", async () => {
      window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
      const reply = createDeferred<void>();
      const closeFirstStream = createDeferred<void>();
      let connectionAttempt = 0;
      vi.mocked(replyPermission).mockReturnValue(reply.promise);
      vi.mocked(getPendingInteractions)
        .mockResolvedValueOnce({
          permissions: [
            {
              id: "perm-hydrated-reconnected",
              sessionID: "child-session",
              permission: "external_directory",
              patterns: ["/shared/*"],
              metadata: {},
              always: [],
            },
          ],
          question: null,
          liveRequests: [],
        })
        .mockResolvedValueOnce(noPendingInteractions());
      vi.mocked(connectConversationEvents).mockImplementation((_conversationId, signal) => {
        connectionAttempt += 1;
        if (connectionAttempt === 1) {
          return (async function* (): AsyncGenerator<ChatEvent> {
            yield { type: "connected", properties: {} };
            await closeFirstStream.promise;
          })();
        }

        return oneEvent({ type: "connected", properties: {} }, signal);
      });
      vi.mocked(getConversation).mockResolvedValue(
        makeConversation({ title: "Reconnected conversation" }),
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(replyPermission).toHaveBeenCalledTimes(1));

      closeFirstStream.resolve();
      await waitFor(() => expect(connectConversationEvents).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(result.current.conversation?.title).toBe("Reconnected conversation"),
      );
      reply.reject(new ApiRequestError("response lost", 500));
      await act(async () => Promise.resolve());

      expect(result.current.pendingPermission).toBeNull();
    });

    it("reconciles a hydrated permission after an upstream reconnect when detail refresh fails", async () => {
      window.localStorage.setItem("cc-specialist-auto-approve-writer", "true");
      const reply = createDeferred<void>();
      const reconnect = createDeferred<void>();
      vi.mocked(replyPermission).mockReturnValue(reply.promise);
      vi.mocked(getConversation).mockRejectedValue(new Error("refresh failed"));
      vi.mocked(getPendingInteractions)
        .mockResolvedValueOnce({
          permissions: [
            {
              id: "perm-hydrated-upstream-reconnected",
              sessionID: "child-session",
              permission: "external_directory",
              patterns: ["/shared/*"],
              metadata: {},
              always: [],
            },
          ],
          question: null,
          liveRequests: [],
        })
        .mockResolvedValueOnce(noPendingInteractions());
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await reconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(replyPermission).toHaveBeenCalledTimes(1));

      reconnect.resolve();
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledTimes(2));
      reply.reject(new ApiRequestError("response lost", 500));
      await act(async () => Promise.resolve());

      expect(connectConversationEvents).toHaveBeenCalledTimes(1);
      expect(result.current.pendingPermission).toBeNull();
    });

    it("rehydrates the next pending question after answering the displayed question", async () => {
      vi.mocked(getPendingInteractions).mockResolvedValueOnce({
        permissions: [],
        question: {
          id: "q-1",
          sessionID: "sess-1",
          questions: [{ question: "First?", options: [{ label: "Yes" }] }],
        },
        questions: [
          {
            id: "q-1",
            sessionID: "sess-1",
            questions: [{ question: "First?", options: [{ label: "Yes" }] }],
          },
          {
            id: "q-2",
            sessionID: "child-session",
            questions: [{ question: "Second?", options: [{ label: "Continue" }] }],
          },
        ],
        liveRequests: [],
      });
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(result.current.pendingQuestion?.id).toBe("q-1"));

      act(() => result.current.replyQuestion("q-1", [["Yes"]]));

      await waitFor(() => expect(result.current.pendingQuestion?.id).toBe("q-2"));
      expect(getPendingInteractions).toHaveBeenCalledOnce();
    });

    it("does not resurrect a replied question from an in-flight reconnect snapshot", async () => {
      const reconnect = createDeferred<void>();
      const reconnectPending = createDeferred<PendingInteractions>();
      const firstQuestion = {
        id: "q-replied",
        sessionID: "sess-1",
        questions: [{ question: "First?", options: [{ label: "Yes" }] }],
      };
      const secondQuestion = {
        id: "q-next",
        sessionID: "child-session",
        questions: [{ question: "Second?", options: [{ label: "Continue" }] }],
      };
      const pending = {
        permissions: [],
        question: firstQuestion,
        questions: [firstQuestion, secondQuestion],
        liveRequests: [],
      };
      vi.mocked(getPendingInteractions)
        .mockResolvedValueOnce(pending)
        .mockReturnValueOnce(reconnectPending.promise);
      vi.mocked(getConversation).mockResolvedValue(makeConversation());
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await reconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(result.current.pendingQuestion?.id).toBe("q-replied"));

      reconnect.resolve();
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledTimes(2));
      act(() => result.current.replyQuestion("q-replied", [["Yes"]]));
      await waitFor(() => expect(result.current.pendingQuestion?.id).toBe("q-next"));
      reconnectPending.resolve(pending);
      await act(async () => Promise.resolve());

      expect(result.current.pendingQuestion?.id).toBe("q-next");
    });

    it("does not resurrect a stale rejected question from an in-flight reconnect snapshot", async () => {
      const reconnect = createDeferred<void>();
      const reconnectPending = createDeferred<PendingInteractions>();
      const firstQuestion = {
        id: "q-rejected",
        sessionID: "sess-1",
        questions: [{ question: "First?", options: [{ label: "Yes" }] }],
      };
      const secondQuestion = {
        id: "q-next",
        sessionID: "child-session",
        questions: [{ question: "Second?", options: [{ label: "Continue" }] }],
      };
      const pending = {
        permissions: [],
        question: firstQuestion,
        questions: [firstQuestion, secondQuestion],
        liveRequests: [],
      };
      vi.mocked(getPendingInteractions)
        .mockResolvedValueOnce(pending)
        .mockReturnValueOnce(reconnectPending.promise);
      vi.mocked(getConversation).mockResolvedValue(makeConversation());
      vi.mocked(rejectQuestion).mockRejectedValueOnce(
        new ApiRequestError('Pending request "q-rejected" no longer exists.', 410),
      );
      vi.mocked(connectConversationEvents).mockImplementation(
        async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
          yield { type: "connected", properties: {} };
          await reconnect.promise;
          yield { type: "connected", properties: { reconnected: true } };
          await waitForAbort(signal);
        },
      );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(result.current.pendingQuestion?.id).toBe("q-rejected"));

      reconnect.resolve();
      await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledTimes(2));
      act(() => result.current.rejectQuestion("q-rejected"));
      await waitFor(() => expect(result.current.pendingQuestion?.id).toBe("q-next"));
      reconnectPending.resolve(pending);
      await act(async () => Promise.resolve());

      expect(result.current.pendingQuestion?.id).toBe("q-next");
    });

    it.each([
      { outcome: "successful", error: undefined },
      {
        outcome: "stale",
        error: new ApiRequestError('Pending request "perm-replied" no longer exists.', 410),
      },
    ])(
      "does not resurrect a $outcome permission reply from an in-flight reconnect snapshot",
      async ({ error }) => {
        const reconnect = createDeferred<void>();
        const reconnectPending = createDeferred<PendingInteractions>();
        const permission = {
          id: "perm-replied",
          sessionID: "sess-1",
          permission: "bash",
          patterns: [],
          metadata: {},
          always: [],
        };
        const pending = { permissions: [permission], question: null, liveRequests: [] };
        vi.mocked(getPendingInteractions)
          .mockResolvedValueOnce(pending)
          .mockReturnValueOnce(reconnectPending.promise);
        vi.mocked(getConversation).mockResolvedValue(makeConversation());
        if (error) vi.mocked(replyPermission).mockRejectedValueOnce(error);
        vi.mocked(connectConversationEvents).mockImplementation(
          async function* (_conversationId, signal): AsyncGenerator<ChatEvent> {
            yield { type: "connected", properties: {} };
            await reconnect.promise;
            yield { type: "connected", properties: { reconnected: true } };
            await waitForAbort(signal);
          },
        );
        const queryClient = createQueryClient();
        const { result } = renderHook(() => useConversation("writer"), {
          wrapper: createWrapper(queryClient),
        });
        await waitFor(() => expect(result.current.pendingPermission?.id).toBe("perm-replied"));

        reconnect.resolve();
        await waitFor(() => expect(getPendingInteractions).toHaveBeenCalledTimes(2));
        act(() => result.current.replyPermission("perm-replied", "once"));
        await waitFor(() => expect(result.current.pendingPermission).toBeNull());
        reconnectPending.resolve(pending);
        await act(async () => Promise.resolve());

        expect(result.current.pendingPermission).toBeNull();
      },
    );

    it("keeps a question actionable when its reply fails transiently", async () => {
      vi.mocked(getPendingInteractions).mockResolvedValue({
        permissions: [],
        question: {
          id: "q-transient",
          sessionID: "sess-1",
          questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
        },
        liveRequests: [],
      });
      vi.mocked(replyQuestion).mockRejectedValueOnce(new ApiRequestError("Internal error.", 500));
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useConversation("writer"), {
        wrapper: createWrapper(queryClient),
      });
      await waitFor(() => expect(result.current.pendingQuestion?.id).toBe("q-transient"));

      act(() => result.current.replyQuestion("q-transient", [["Yes"]]));
      await waitFor(() =>
        expect(replyQuestion).toHaveBeenCalledWith("conv-1", "q-transient", [["Yes"]]),
      );

      expect(result.current.pendingQuestion?.id).toBe("q-transient");
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

    it("retries initial hydration while the event stream remains connected", async () => {
      vi.mocked(getPendingInteractions)
        .mockRejectedValueOnce(new Error("network down"))
        .mockResolvedValueOnce({
          permissions: [
            {
              id: "perm-after-retry",
              sessionID: "child-session",
              permission: "external_directory",
              patterns: ["/shared/*"],
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
        expect(result.current.status).toBe("ready");
      });
      await waitFor(() => {
        expect(getPendingInteractions).toHaveBeenCalledTimes(2);
      });

      expect(result.current.pendingPermission?.id).toBe("perm-after-retry");
    });
  });
});
