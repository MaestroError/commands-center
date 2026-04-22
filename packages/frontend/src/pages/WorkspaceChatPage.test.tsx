import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceChatPage } from "./WorkspaceChatPage";

const navigateMock = vi.fn();
const useConversationMock = vi.fn();
const useAgentCatalogQueryMock = vi.fn();

let mockParams: { agentId?: string; conversationId?: string } = {};

vi.mock("react-router-dom", () => ({
  useParams: () => mockParams,
  useNavigate: () => navigateMock,
}));

vi.mock("@/hooks/use-conversation", () => ({
  useConversation: (...args: unknown[]) => useConversationMock(...args) as unknown,
}));

vi.mock("@/hooks/use-agents-query", () => ({
  useAgentCatalogQuery: () => useAgentCatalogQueryMock() as unknown,
}));

vi.mock("@/components/layout/WorkspaceLayout", () => ({
  WorkspaceLayout: ({
    primary,
    contextPane,
  }: {
    primary: React.ReactNode;
    contextPane?: {
      activeTabId?: string;
      onTabChange?: (tabId: string) => void;
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
      {primary}
    </div>
  ),
}));

vi.mock("@/components/chat/ChatHeader", () => ({
  ChatHeader: () => <div data-testid="chat-header">ChatHeader</div>,
}));

vi.mock("@/components/chat/MessageTimeline", () => ({
  MessageTimeline: ({ onAttachmentClick }: { onAttachmentClick?: (filename: string) => void }) => (
    <div>
      <button
        data-testid="message-attachment-pill"
        onClick={() => onAttachmentClick?.("Carpenter Vacancy Redberry.pdf")}
        type="button"
      >
        Attachment pill
      </button>
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
  WorkspaceFilesTab: () => <div data-testid="workspace-files-tab">WorkspaceFilesTab</div>,
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
      capabilities: { builtInSkills: [], mcpServers: [], toolPermissions: [] },
    },
    agentStatus: "idle",
    conversation: {
      id: "conv-1",
      messages: [],
    },
    parts: {},
    previousConversations: [],
    pendingPermission: null,
    pendingQuestion: null,
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
    ...overrides,
  };
}

afterEach(() => {
  mockParams = {};
  navigateMock.mockReset();
  useConversationMock.mockReset();
  useAgentCatalogQueryMock.mockReset();
});

describe("WorkspaceChatPage", () => {
  it("navigates with replace true on initial load when URL has no conversation id", () => {
    mockParams = { agentId: "planner" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(navigateMock).toHaveBeenCalledWith("/chat/planner/conv-1", { replace: true });
  });

  it("navigates with replace false when the conversation switches", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-2", messages: [] } }),
    );
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(navigateMock).toHaveBeenCalledWith("/chat/planner/conv-2", { replace: false });
  });

  it("does not navigate when the conversation id already matches the URL", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("renders LoadingState when conversation status is loading", () => {
    mockParams = { agentId: "planner" };
    useConversationMock.mockReturnValue(
      makeConversation({ status: "loading", conversation: null }),
    );
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    const { container } = render(<WorkspaceChatPage />);

    expect(container.querySelectorAll(".cc-panel").length).toBeGreaterThan(0);
  });

  it("renders ErrorState when conversation status is error", () => {
    mockParams = { agentId: "planner" };
    useConversationMock.mockReturnValue(
      makeConversation({ status: "error", error: "Boom", conversation: null }),
    );
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

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
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

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
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

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
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    const { rerender } = render(<WorkspaceChatPage />);

    expect(screen.getByTestId("todo-dock")).toBeInTheDocument();
    expect(screen.getByTestId("chat-composer")).toBeInTheDocument();

    useConversationMock.mockReturnValue(makeConversation({ todos: [] }));
    rerender(<WorkspaceChatPage />);

    expect(screen.queryByTestId("todo-dock")).not.toBeInTheDocument();
    expect(screen.getByTestId("chat-composer")).toBeInTheDocument();
  });

  it("wires Files and Media tabs into the context pane", () => {
    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    expect(screen.getByTestId("context-tabs")).toHaveTextContent("Files,Media");
    expect(screen.getByTestId("workspace-files-tab")).toBeInTheDocument();
    expect(screen.getByTestId("media-tab")).toHaveTextContent("MediaTab:conv-1:");
  });

  it("opens the media tab and seeds search when an attachment pill is clicked", async () => {
    const user = userEvent.setup();

    mockParams = { agentId: "planner", conversationId: "conv-1" };
    useConversationMock.mockReturnValue(
      makeConversation({ conversation: { id: "conv-1", messages: [] } }),
    );
    useAgentCatalogQueryMock.mockReturnValue({ data: { builtInSkills: [] } });

    render(<WorkspaceChatPage />);

    await user.click(screen.getByTestId("message-attachment-pill"));

    expect(screen.getByTestId("active-context-tab")).toHaveTextContent("media");
    expect(screen.getByTestId("media-tab")).toHaveTextContent(
      "MediaTab:conv-1:Carpenter Vacancy Redberry.pdf",
    );
  });
});
