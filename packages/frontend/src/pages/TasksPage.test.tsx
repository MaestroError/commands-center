import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Agent, ConversationDetail, Task, TaskRun } from "@cc/shared/schemas";

import { TaskDetailPage } from "@/pages/TaskDetailPage";
import { TasksPage } from "@/pages/TasksPage";

const agent: Agent = {
  id: "agent-1",
  slug: "planner",
  name: "Planner",
  role: "Plans work",
  instructions: "Plan carefully.",
  defaultModel: "openai/gpt-4.1",
  workspacePath: "/tmp/planner",
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
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const task: Task = {
  id: "task-1",
  agentId: "agent-1",
  title: "Ship release",
  description: "Prepare release notes.",
  context: "Use changelog.",
  todos: [
    {
      id: "todo-1",
      content: "Read changelog",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  status: "enabled",
  triggerMode: "manual",
  schedule: { mode: "manual" },
  enabled: true,
  archived: false,
  latestResultSummary: "Ready to publish.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const run: TaskRun = {
  id: "run-1",
  taskId: "task-1",
  agentId: "agent-1",
  opencodeSessionId: "session-1",
  status: "completed",
  triggerSource: "manual",
  renderedPrompt: "Task: Ship release",
  renderedContext: { taskTitle: "Ship release" },
  effectivePermissions: { toolPermissions: [{ pattern: "bash_*", action: "allow" }] },
  resultSummary: "Done.",
  result: { messageCount: 2 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const conversation: ConversationDetail = {
  id: "conv-1",
  agentId: "agent-1",
  opencodeSessionId: "session-1",
  title: "Ship release",
  status: "active",
  source: "task_run",
  isCurrent: false,
  taskId: "task-1",
  taskRunId: "run-1",
  messageCount: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  messages: [
    {
      id: "msg-1",
      conversationId: "conv-1",
      role: "user",
      content: "Task: Ship release",
      parts: [],
      attachments: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "msg-2",
      conversationId: "conv-1",
      role: "assistant",
      content: "",
      parts: [
        {
          id: "tool-1",
          type: "tool",
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "ls -la" },
            output: "tools-2.md",
          },
        },
      ],
      attachments: [],
      createdAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
    },
    {
      id: "msg-3",
      conversationId: "conv-1",
      role: "assistant",
      content: "Release notes drafted.",
      parts: [],
      attachments: [],
      createdAt: "2026-01-01T00:02:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
    },
  ],
};

type MockFetchOptions = {
  sessionPayload?: {
    run?: typeof run;
    conversation?: typeof conversation | undefined;
    diagnostics?: Array<{ code: string; message: string }>;
    canOpenInChat?: boolean;
  };
  taskPayload?: typeof task;
  agentsPayload?: (typeof agent)[];
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TasksPage", () => {
  it("lists tasks and supports manual trigger", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    await screen.findByRole("link", { name: "Ship release" });
    expect(screen.getAllByText("Planner").length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/trigger",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("creates a task from the form", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage mode="create" />, "/tasks/new");

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /Assigned agent/i });
    await user.type(screen.getByLabelText(/Title/i), "Nightly review");
    await user.selectOptions(screen.getByLabelText(/Assigned agent/i), "agent-1");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

describe("TaskDetailPage", () => {
  it("shows task run inspection details", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    await screen.findByRole("tab", { name: "Session" });
    expect(screen.getByText("session-1")).toBeInTheDocument();
    expect(screen.queryByText("Rendered prompt")).not.toBeInTheDocument();
  });

  it("shows run internals in the details tab", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Details" }));

    expect(screen.getByText("Rendered prompt")).toBeInTheDocument();
    expect(screen.getByText("session-1")).toBeInTheDocument();
    expect(screen.getByText(/bash_/)).toBeInTheDocument();
  });

  it("hides open in chat when the session cannot be opened in chat", async () => {
    mockFetch({
      sessionPayload: {
        canOpenInChat: false,
      },
    });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    await screen.findByRole("tab", { name: "Session" });
    expect(screen.queryByRole("button", { name: "Open in chat" })).not.toBeInTheDocument();
  });

  it("hides open in chat when the agent slug cannot be resolved", async () => {
    mockFetch({ agentsPayload: [] });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    await screen.findByRole("tab", { name: "Session" });
    expect(screen.queryByRole("button", { name: "Open in chat" })).not.toBeInTheDocument();
  });

  it("renders the session log without converting the run to chat", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Session log/i }));

    expect(screen.getByText("Release notes drafted.")).toBeInTheDocument();
  });

  it("renders tool-only assistant messages as tool logs", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Session log/i }));

    expect(screen.getByText("Tool call")).toBeInTheDocument();
    expect(screen.getByText("bash")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText(/"command": "ls -la"/)).toBeInTheDocument();
    expect(screen.getByText("tools-2.md")).toBeInTheDocument();
    expect(screen.queryAllByText("(no text content)")).toHaveLength(0);
  });

  it("renders attachments and tool errors inside the session log", async () => {
    mockFetch({
      sessionPayload: {
        conversation: {
          ...conversation,
          messages: [
            {
              id: "msg-attachment",
              conversationId: "conv-1",
              role: "assistant",
              content: "",
              parts: [
                {
                  id: "tool-error",
                  type: "tool",
                  tool: "grep",
                  state: {
                    status: "error",
                    input: { pattern: "TODO" },
                    error: { message: "permission denied" },
                  },
                },
              ],
              attachments: [{ type: "file", mimeType: "text/plain", filename: "tools.md" }],
              error: { name: "ToolError", message: "grep failed" },
              createdAt: "2026-01-01T00:03:00.000Z",
              updatedAt: "2026-01-01T00:03:00.000Z",
            },
          ],
        },
      },
    });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Session log/i }));

    expect(screen.getByText("Attachments: tools.md")).toBeInTheDocument();
    expect(screen.getByText("ToolError: grep failed")).toBeInTheDocument();
    expect(screen.getByText(/"message": "permission denied"/)).toBeInTheDocument();
  });

  it("shows an empty-state when the session has no messages", async () => {
    mockFetch({
      sessionPayload: {
        conversation: {
          ...conversation,
          messages: [],
        },
      },
    });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Session log/i }));

    expect(screen.getByText("No session messages")).toBeInTheDocument();
  });

  it("shows session unavailable when diagnostics exist without a conversation", async () => {
    mockFetch({
      sessionPayload: {
        conversation: undefined,
        diagnostics: [{ code: "session_sync_failed", message: "Session could not be synced." }],
      },
    });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Session log/i }));

    expect(screen.getByText("Session unavailable")).toBeInTheDocument();
    expect(screen.getAllByText("Session diagnostics").length).toBeGreaterThan(0);
  });

  it("renders error details in the sidebar", async () => {
    mockFetch({
      sessionPayload: {
        run: {
          ...run,
          errorMessage: "Command failed",
          errorDetails: { exitCode: 1 },
        },
      },
    });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    await screen.findByRole("tab", { name: "Session" });
    expect(screen.getByText("Command failed")).toBeInTheDocument();
    expect(screen.getByText(/"exitCode": 1/)).toBeInTheDocument();
  });

  it("renders session diagnostics in the details tab", async () => {
    mockFetch({
      sessionPayload: {
        diagnostics: [{ code: "session_sync_failed", message: "Session could not be synced." }],
      },
    });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Details" }));

    expect(screen.getByText("Session diagnostics")).toBeInTheDocument();
    expect(screen.getByText(/session_sync_failed/)).toBeInTheDocument();
  });

  it("opens chat with the agent slug in the URL", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Open in chat" }));

    await screen.findByText("planner/conv-1");
  });
});

function renderWithRouter(element: React.ReactElement, initialPath: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={element} path="/tasks" />
          <Route element={element} path="/tasks/new" />
          <Route element={element} path="/tasks/:id/runs/:runId" />
          <Route element={<ChatRouteProbe />} path="/chat/:agentId/:conversationId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ChatRouteProbe() {
  const params = useParams();
  return <div>{`${params["agentId"]}/${params["conversationId"]}`}</div>;
}

function mockFetch(options: MockFetchOptions = {}) {
  const sessionRun = options.sessionPayload?.run ?? run;
  const sessionConversation =
    options.sessionPayload && "conversation" in options.sessionPayload
      ? options.sessionPayload.conversation
      : conversation;
  const sessionDiagnostics = options.sessionPayload?.diagnostics ?? [];
  const canOpenInChat =
    options.sessionPayload?.canOpenInChat ??
    (sessionDiagnostics.length === 0 && sessionConversation !== undefined);
  const taskPayload = options.taskPayload ?? task;
  const agentsPayload = options.agentsPayload ?? [agent];

  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url === "/api/agents") return Promise.resolve(jsonResponse(200, agentsPayload));
    if (url === "/api/tasks") {
      const method = input instanceof Request ? input.method : init?.method;
      return Promise.resolve(
        method === "POST"
          ? jsonResponse(201, { ...task, id: "task-2", title: "Nightly review" })
          : jsonResponse(200, [taskPayload]),
      );
    }
    if (url.startsWith("/api/tasks?")) return Promise.resolve(jsonResponse(200, [taskPayload]));
    if (url === "/api/tasks/task-1") return Promise.resolve(jsonResponse(200, taskPayload));
    if (url === "/api/tasks/task-1/runs") return Promise.resolve(jsonResponse(200, [sessionRun]));
    if (url === "/api/tasks/task-1/runs/run-1")
      return Promise.resolve(jsonResponse(200, sessionRun));
    if (url === "/api/tasks/task-1/runs/run-1/session") {
      return Promise.resolve(
        jsonResponse(200, {
          run: sessionRun,
          conversation: sessionConversation,
          diagnostics: sessionDiagnostics,
          canOpenInChat,
        }),
      );
    }
    if (url === "/api/tasks/task-1/runs/run-1/open-in-chat") {
      return Promise.resolve(
        jsonResponse(200, {
          current: sessionConversation,
          previous: [],
        }),
      );
    }
    if (url === "/api/tasks/task-1/trigger") return Promise.resolve(jsonResponse(200, run));
    return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
