import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Specialist,
  ChatEvent,
  ConversationDetail,
  ConversationSnapshot,
} from "@cc/shared/schemas";

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistQuery: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  abortConversation: vi.fn(),
  cancelLiveRequest: vi.fn(),
  connectConversationEvents: vi.fn(),
  getActiveConversation: vi.fn(),
  getConversation: vi.fn(),
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

async function* emptyEvents(): AsyncGenerator<ChatEvent> {}

async function* oneEvent(event: ChatEvent): AsyncGenerator<ChatEvent> {
  await Promise.resolve();
  yield event;
}

describe("useConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(useSpecialistQuery).mockReturnValue({
      data: makeAgent(),
      error: null,
    } as ReturnType<typeof useSpecialistQuery>);
    vi.mocked(connectConversationEvents).mockImplementation(() => emptyEvents());
    vi.mocked(getActiveConversation).mockResolvedValue(makeSnapshot());
    vi.mocked(getConversation).mockResolvedValue(makeConversation({ id: "conv-specific" }));
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
    vi.mocked(connectConversationEvents).mockImplementation(() =>
      oneEvent({
        type: "session.error",
        properties: {
          sessionID: "sess-1",
          error: {
            name: "APIError",
            message: "Provider rejected the attachment.",
          },
        },
      }),
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
    vi.mocked(connectConversationEvents).mockImplementation(() =>
      oneEvent({
        type: "permission.asked",
        properties: {
          id: "perm-1",
          sessionID: "sess-1",
          permission: "bash",
          patterns: [],
          metadata: {},
          always: [],
        },
      }),
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
});
