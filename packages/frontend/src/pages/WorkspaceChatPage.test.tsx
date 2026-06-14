import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceChatPage } from "./WorkspaceChatPage";

const navigateMock = vi.fn();
const useConversationMock = vi.fn();
const useSpecialistCatalogQueryMock = vi.fn();
const useMediaQueryMock = vi.fn();

let mockParams: { agentId?: string; conversationId?: string } = {};

vi.mock("react-router-dom", () => ({
  useParams: () => mockParams,
  useNavigate: () => navigateMock,
}));

vi.mock("@/hooks/use-conversation", () => ({
  useConversation: (...args: unknown[]) => useConversationMock(...args) as unknown,
}));

vi.mock("@/hooks/use-agents-query", () => ({
  useSpecialistCatalogQuery: () => useSpecialistCatalogQueryMock() as unknown,
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: (query: string) => Boolean(useMediaQueryMock(query)),
}));

vi.mock("@/components/layout/WorkspaceLayout", () => ({
  WorkspaceLayout: ({
    primary,
    contextPane,
    bottomPane,
  }: {
    primary: React.ReactNode;
    contextPane?: {
      activeTabId?: string;
      onTabChange?: (tabId: string) => void;
      tabs: Array<{ id: string; label: string; content: React.ReactNode }>;
    };
    bottomPane?: {
      tabs: Array<{ id: string; label: string; content: React.ReactNode }>;
    };
  }) => (
    <div data-testid="layout">
      <div data-testid="active-context-tab">{contextPane?.activeTabId}</div>
      <div data-testid="context-tabs">{contextPane?.tabs.map((tab) => tab.label).join(",")}</div>
      <div data-testid="context-content">
        {contextPane?.tabs.map((tab) => (
          <div key={tab.id}>{tab.content}</div>
        ))}
      </div>
      <div data-testid="bottom-pane-content">
        {bottomPane?.tabs.map((tab) => (
          <div key={tab.id}>{tab.content}</div>
        ))}
      </div>
      {primary}
    </div>
  ),
}));

vi.mock("@/components/chat/ChatHeader", () => ({
  ChatHeader: ({
    onToggleTerminal,
    onToggleQuickEditor,
  }: {
    onToggleTerminal?: () => void;
    onToggleQuickEditor?: () => void;
  }) => (
    <div>
      <button data-testid="chat-terminal-toggle" onClick={onToggleTerminal} type="button">
        Toggle terminal
      </button>
      <button data-testid="chat-quick-editor-toggle" onClick={onToggleQuickEditor} type="button">
        Toggle quick editor
      </button>
      <div data-testid="chat-header">ChatHeader</div>
    </div>
  ),
}));

vi.mock("@/components/chat/WorkspaceTerminalPane", () => ({
  WorkspaceTerminalPane: ({ defaultCwd }: { defaultCwd?: string }) => (
    <div data-testid="workspace-terminal-pane">WorkspaceTerminalPane:{defaultCwd ?? ""}</div>
  ),
}));

vi.mock("@/components/chat/MessageTimeline", () => ({
  MessageTimeline: ({
    messages,
    onAttachmentClick,
    onConvertUserMessageToTask,
    parts,
  }: {
    messages: Array<{ id: string; role: string; content: string }>;
    onAttachmentClick?: (filename: string) => void;
    onConvertUserMessageToTask?: (message: unknown, parts: unknown[]) => void;
    parts: Record<string, unknown[]>;
  }) => (
    <div>
      <button
        data-testid="message-attachment-pill"
        onClick={() => onAttachmentClick?.("Carpenter Vacancy Redberry.pdf")}
        type="button"
      >
        Attachment pill
      </button>
      {messages.map((message) =>
        message.role === "user" ? (
          <button
            data-testid={`convert-message-${message.id}`}
            key={message.id}
            onClick={() => onConvertUserMessageToTask?.(message, parts[message.id] ?? [])}
            type="button"
          >
            Convert message
          </button>
        ) : null,
      )}
      <div data-testid="message-timeline">MessageTimeline</div>
    </div>
  ),
}));

vi.mock("@/components/chat/ChatComposer", () => ({
  ChatComposer: () => <div data-testid="chat-composer">ChatComposer</div>,
}));

vi.mock("@/components/chat/PermissionDock", () => ({
  PermissionDock: () => <div data-testid="permission-dock">PermissionDock</div>,
}));

vi.mock("@/components/chat/QuestionDock", () => ({
  QuestionDock: () => <div data-testid="question-dock">QuestionDock</div>,
}));

vi.mock("@/components/chat/TodoDock", () => ({
  TodoDock: () => <div data-testid="todo-dock">TodoDock</div>,
}));

vi.mock("@/components/workspace/WorkspaceFilesTab", () => ({
  WorkspaceFilesTab: ({ onOpenFile }: { onOpenFile?: (path: string) => void }) => (
    <div>
      <button
        data-testid="workspace-files-open"
        onClick={() => onOpenFile?.("README.md")}
        type="button"
      >
        Open workspace file
      </button>
      <div data-testid="workspace-files-tab">WorkspaceFilesTab</div>
    </div>
  ),
}));

vi.mock("@/components/workspace/QuickFilePanel", () => ({
  QuickFilePanel: ({ controller }: { controller: { activeKey?: string } }) => (
    <div data-testid="quick-file-panel">{controller.activeKey ?? "closed"}</div>
  ),
}));

vi.mock("@/components/workspace/QuickFileModal", () => ({
  QuickFileModal: ({ controller }: { controller: { activeKey?: string } }) => (
    <div data-testid="quick-file-modal">{controller.activeKey ?? "closed"}</div>
  ),
}));

vi.mock("@/components/chat/MediaTab", () => ({
  MediaTab: ({ conversationId, searchQuery }: { conversationId: string; searchQuery: string }) => (
    <div data-testid="media-tab">
      MediaTab:{conversationId}:{searchQuery}
    </div>
  ),
}));

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    status: "ready",
    error: null,
    agent: {
      id: "agent-1",
      slug: "planner",
      name: "Planner",
      role: "Plans work",
      iconPath: undefined,
      workspacePath: "/workspace/planner",
      capabilities: { builtInSkills: [], mcpServers: [], toolPermissions: [] },
    },
    agentStatus: "idle",
    conversation: {
      id: "conv-1",
      messages: [],
    },
    parts: {},
    previousConversations: [],
    pendingPermissionCount: 0,
    pendingPermission: null,
    pendingQuestion: null,
    liveRequests: [],
    todos: [],
    autoApprove: false,
    setAutoApprove: vi.fn(),
    sendUserPrompt: vi.fn(),
    sendShell: vi.fn(),
    sendCommand: vi.fn(),
    summarize: vi.fn(),
    abort: vi.fn(),
    startFresh: vi.fn(),
    switchConversation: vi.fn(),
    replyPermission: vi.fn(),
    replyQuestion: vi.fn(),
    rejectQuestion: vi.fn(),
    resolveLiveRequest: vi.fn(),
    cancelLiveRequest: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockParams = {};
  navigateMock.mockReset();
  useConversationMock.mockReset();
  useSpecialistCatalogQueryMock.mockReset();
  useMediaQueryMock.mockReset();
  window.sessionStorage.clear();
});

describe("WorkspaceChatPage", () => {
  beforeEach(() => {
    useMediaQueryMock.mockReturnValue(true);
  });

  it("navigates with replace true on initial load when URL has no conversation id", () => {
    mockParams = { agentId: "planner" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(navigateMock).toHaveBeenCalledWith("/chat/planner/conv-1", { replace: true });
  });

  it("navigates with replace false when the conversation switches", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-2", messages: [] } }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(navigateMock).toHaveBeenCalledWith("/chat/planner/conv-2", { replace: false });
  });

  it("does not navigate when the conversation id already matches the URL", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("renders LoadingState when conversation status is loading", () => {
    mockParams = { agentId: "planner" };
    useConversationMock.mockReturnValue(
      makeConversation({ status: "loading", conversation: null }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    const { container } = render(<WorkspaceChatPage />);

    expect(container.querySelectorAll(".cc-panel").length).toBeGreaterThan(0);
  });

  it("renders ErrorState when conversation status is error", () => {
    mockParams = { agentId: "planner" };
    useConversationMock.mockReturnValue(
      makeConversation({ status: "error", error: "Boom", conversation: null }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(screen.getByText("Failed to load conversation")).toBeInTheDocument();
    expect(screen.getByText("Boom")).toBeInTheDocument();
  });

  it("renders PermissionDock and hides the composer when pendingPermission is set", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({
        pendingPermission: {
          id: "perm-1",
          sessionID: "session-1",
          permission: "read",
          patterns: [],
          metadata: {},
          always: [],
        },
      }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(screen.getByTestId("permission-dock")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-composer")).not.toBeInTheDocument();
  });

  it("renders QuestionDock when pendingQuestion is set and no permission is pending", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({
        pendingQuestion: {
          id: "question-1",
          sessionID: "session-1",
          questions: [],
        },
      }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(screen.getByTestId("question-dock")).toBeInTheDocument();
    expect(screen.queryByTestId("permission-dock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-composer")).not.toBeInTheDocument();
  });

  it("renders TodoDock only when there are todos", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ todos: [{ content: "Task", status: "pending" }] }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    const { rerender } = render(<WorkspaceChatPage />);

    expect(screen.getByTestId("todo-dock")).toBeInTheDocument();
    expect(screen.getByTestId("chat-composer")).toBeInTheDocument();

    useConversationMock.mockReturnValue(makeConversation({ todos: [] }));
    rerender(<WorkspaceChatPage />);

    expect(screen.queryByTestId("todo-dock")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-composer")).toBeInTheDocument();
  });

  it("shows a task run return banner for continued task chats", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({
        conversation: {
          id: "conv-1",
          messages: [],
          taskId: "task-1",
          taskRunId: "run-1",
        },
      }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(screen.getByText("This chat continues task run run-1.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to task run" })).toHaveAttribute(
      "href",
      "/tasks/task-1/runs/run-1",
    );
  });

  it("wires Files, Media, and Settings tabs into the context pane", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(screen.getByTestId("context-tabs")).toHaveTextContent("Files,Uploads");
    expect(screen.getByTestId("workspace-files-tab")).toBeInTheDocument();
    expect(screen.getByTestId("media-tab")).toHaveTextContent("MediaTab:conv-1:");
    expect(screen.queryByTestId("session-settings-tab")).not.toBeInTheDocument();
  });

  it("opens the media tab and seeds search when an attachment pill is clicked", async () => {
    const user = userEvent.setup();

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    await user.click(screen.getByTestId("message-attachment-pill"));

    expect(screen.getByTestId("active-context-tab")).toHaveTextContent("media");
    expect(screen.getByTestId("media-tab")).toHaveTextContent(
      "MediaTab:conv-1:Carpenter Vacancy Redberry.pdf",
    );
  });

  it("navigates to task creation with converted user message state", async () => {
    const user = userEvent.setup();

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({
        conversation: {
          id: "conv-1",
          messages: [
            {
              id: "msg-1",
              conversationId: "conv-1",
              role: "user",
              content: 'Use skill "review". #README.md Check this',
              parts: [],
              attachments: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        agent: {
          id: "agent-1",
          slug: "planner",
          name: "Planner",
          role: "Plans work",
          iconPath: undefined,
          workspacePath: "/workspace/planner",
          capabilities: {
            builtInSkills: ["review"],
            workspaceSkills: [],
            mcpServers: [],
            toolPermissions: [],
          },
        },
      }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({
      data: {
        builtInSkills: [{ slug: "review", description: "Review code" }],
        workspaceSkills: [],
      },
    });

    render(<WorkspaceChatPage />);

    await user.click(screen.getByTestId("convert-message-msg-1"));

    expect(navigateMock).toHaveBeenCalledWith("/tasks/new", {
      state: {
        taskPrefill: {
          agentId: "agent-1",
          prompt: {
            text: "Check this",
            mentionedFiles: [{ path: "README.md", filename: "README.md" }],
            mentionedAgents: [],
            selectedSkill: { slug: "review", description: "Review code" },
          },
        },
      },
    });
  });

  it("preserves converted skill slug before catalog details load", async () => {
    const user = userEvent.setup();

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({
        conversation: {
          id: "conv-1",
          messages: [
            {
              id: "msg-1",
              conversationId: "conv-1",
              role: "user",
              content: 'Use skill "review". Check this',
              parts: [],
              attachments: [],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        agent: {
          id: "agent-1",
          slug: "planner",
          name: "Planner",
          role: "Plans work",
          iconPath: undefined,
          workspacePath: "/workspace/planner",
          capabilities: {
            builtInSkills: ["review"],
            workspaceSkills: [],
            mcpServers: [],
            toolPermissions: [],
          },
        },
      }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: undefined });

    render(<WorkspaceChatPage />);

    await user.click(screen.getByTestId("convert-message-msg-1"));

    expect(navigateMock).toHaveBeenCalledWith("/tasks/new", {
      state: {
        taskPrefill: {
          agentId: "agent-1",
          prompt: {
            text: "Check this",
            mentionedFiles: [],
            mentionedAgents: [],
            selectedSkill: { slug: "review", description: undefined },
          },
        },
      },
    });
  });

  it("warns before converting a user message with attachments", async () => {
    const user = userEvent.setup();

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({
        conversation: {
          id: "conv-1",
          messages: [
            {
              id: "msg-1",
              conversationId: "conv-1",
              role: "user",
              content: "Create follow-up task",
              parts: [],
              attachments: [
                { id: "att-1", type: "file", filename: "notes.txt", mimeType: "text/plain" },
              ],
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({
      data: { builtInSkills: [], workspaceSkills: [] },
    });

    render(<WorkspaceChatPage />);

    await user.click(screen.getByTestId("convert-message-msg-1"));

    expect(
      screen.getByRole("alertdialog", { name: "Attachments cannot be copied" }),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith("/tasks/new", expect.anything());

    await user.click(screen.getByRole("button", { name: "Continue without attachments" }));

    expect(navigateMock).toHaveBeenCalledWith("/tasks/new", {
      state: {
        taskPrefill: {
          agentId: "agent-1",
          prompt: {
            text: "Create follow-up task",
            mentionedFiles: [],
            mentionedAgents: [],
            selectedSkill: null,
          },
        },
      },
    });
  });

  it("lazy-mounts and unmounts the workspace terminal bottom pane from the chat header toggle", async () => {
    const user = userEvent.setup();

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(screen.queryByTestId("workspace-terminal-pane")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("chat-terminal-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("workspace-terminal-pane")).toBeInTheDocument();
    });
    expect(screen.getByTestId("workspace-terminal-pane")).toHaveTextContent(
      "WorkspaceTerminalPane:/workspace/planner",
    );

    await user.click(screen.getByTestId("chat-terminal-toggle"));

    expect(screen.queryByTestId("workspace-terminal-pane")).not.toBeInTheDocument();
  });

  it("opens the inspection pane with an agent-scoped workspace path", async () => {
    const user = userEvent.setup();

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    await user.click(screen.getByTestId("workspace-files-open"));

    expect(screen.getByTestId("quick-file-panel")).toBeInTheDocument();
    expect(screen.getByTestId("quick-file-panel")).toHaveTextContent(
      "file:workspace:agents/planner/README.md",
    );
  });

  it("opens a requested file preview and resolves the live request", async () => {
    const resolveLiveRequest = vi.fn(() => Promise.resolve());

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({
        conversation: { id: "conv-1", messages: [] },
        resolveLiveRequest,
        liveRequests: [
          {
            id: "req-1",
            conversationId: "conv-1",
            kind: "show_file_to_user",
            closable: true,
            metadata: { path: "notes/plan.md" },
            actions: [],
            fields: [],
            createdAt: "2026-05-03T10:00:00.000Z",
            presentation: {
              title: "Opening notes/plan.md",
              cancelLabel: "Dismiss",
            },
          },
        ],
      }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId("quick-file-panel")).toHaveTextContent(
        "file:workspace:agents/planner/notes/plan.md",
      );
    });
    expect(resolveLiveRequest).toHaveBeenCalledWith("req-1", "opened", {});
  });

  it("normalizes a full workspace path from a file preview live request", async () => {
    const resolveLiveRequest = vi.fn(() => Promise.resolve());

    mockParams = { agentId: "testing-agent", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({
        agent: {
          id: "agent-1",
          slug: "testing-agent",
          name: "Testing Specialist",
          role: "Tests work",
          iconPath: undefined,
          workspacePath: "/workspace/testing-agent",
          capabilities: { builtInSkills: [], mcpServers: [], toolPermissions: [] },
        },
        conversation: { id: "conv-1", messages: [] },
        resolveLiveRequest,
        liveRequests: [
          {
            id: "req-1",
            conversationId: "conv-1",
            kind: "show_file_to_user",
            closable: true,
            metadata: {
              path: "/Users/revazgh/cc-dev/.cc/workspace/agents/testing-agent/mermaid.png",
            },
            actions: [],
            fields: [],
            createdAt: "2026-05-03T10:00:00.000Z",
            presentation: {
              title: "Opening mermaid.png",
              cancelLabel: "Dismiss",
            },
          },
        ],
      }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId("quick-file-panel")).toHaveTextContent(
        "file:workspace:agents/testing-agent/mermaid.png",
      );
    });
    expect(resolveLiveRequest).toHaveBeenCalledWith("req-1", "opened", {});
  });

  it("toggles the desktop inspection pane from the chat header", async () => {
    const user = userEvent.setup();

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(screen.queryByTestId("quick-file-panel")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("workspace-files-open"));

    expect(screen.getByTestId("quick-file-panel")).toBeInTheDocument();

    await user.click(screen.getByTestId("chat-quick-editor-toggle"));

    expect(screen.queryByTestId("quick-file-panel")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("chat-quick-editor-toggle"));

    expect(screen.getByTestId("quick-file-panel")).toBeInTheDocument();
  });

  it("keeps the mobile inspection modal closed until toggled open", async () => {
    const user = userEvent.setup();

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useMediaQueryMock.mockReturnValue(false);
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useSpecialistCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(screen.queryByTestId("quick-file-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-file-panel")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("workspace-files-open"));

    expect(screen.queryByTestId("quick-file-modal")).toBeInTheDocument();

    await user.click(screen.getByTestId("chat-quick-editor-toggle"));

    expect(screen.queryByTestId("quick-file-modal")).not.toBeInTheDocument();
  });
});
