import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Agent, AgentCatalog, ConversationDetail, Task, TaskRun } from "@cc/shared/schemas";

import { formatDate } from "@/components/tasks/task-format";
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
  latestFinalMessage: "Ready to publish.",
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
  context: { text: "Use changelog." },
  renderedContext: { taskTitle: "Ship release" },
  effectivePermissions: { toolPermissions: [{ pattern: "bash_*", action: "allow" }] },
  finalMessage: "Done.",
  artifacts: [],
  needsHumanReview: false,
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

const catalog: AgentCatalog = {
  builtInSkills: [
    {
      name: "Screen requirements writing",
      slug: "screen-requirements-writing",
      description: "Write screen requirements",
      category: "design",
      metadata: {},
      detailsMarkdown: "Write requirements.",
      files: [],
    },
  ],
  workspaceSkills: [],
  providerModels: [],
  mcpServers: [],
  appMcpServers: [],
  customTools: [],
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
  catalogPayload?: AgentCatalog;
  runsPayload?: TaskRun[];
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

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
    await user.type(screen.getByLabelText(/Run context/i), "Use changelog.");
    await user.click(screen.getByRole("button", { name: "Run task" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/trigger",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ triggerSource: "manual", context: { text: "Use changelog." } }),
        }),
      );
    });
  });

  it("duplicates a task from the task list", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Duplicate" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/duplicate",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("edit:task-2")).toBeInTheDocument();
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

  it("creates a task prompt with selected file and skill mentions", async () => {
    const skilledAgent: Agent = {
      ...agent,
      capabilities: {
        ...agent.capabilities,
        builtInSkills: ["screen-requirements-writing"],
      },
    };
    const fetchMock = mockFetch({ agentsPayload: [skilledAgent] });

    renderWithRouter(<TasksPage mode="create" />, "/tasks/new");

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /Assigned agent/i });
    await user.type(screen.getByLabelText(/Title/i), "Requirements review");
    await user.selectOptions(screen.getByLabelText(/Assigned agent/i), "agent-1");
    await user.type(screen.getByLabelText(/Task prompt/i), "#PRD");
    await user.click(await screen.findByRole("button", { name: /PRD.md/i }));
    await user.type(screen.getByLabelText(/Task prompt/i), "/screen");
    await user.click(await screen.findByRole("button", { name: /screen-requirements-writing/i }));
    await user.type(screen.getByLabelText(/Task prompt/i), "Update requirements");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            '"description":"Use skill \\"screen-requirements-writing\\". #PRD.md Update requirements"',
          ),
        }),
      );
    });
  });

  it("prefills task creation from converted user message state", async () => {
    const skilledAgent: Agent = {
      ...agent,
      capabilities: {
        ...agent.capabilities,
        builtInSkills: ["screen-requirements-writing"],
      },
    };
    const fetchMock = mockFetch({ agentsPayload: [skilledAgent] });

    renderWithRouter(<TasksPage mode="create" />, "/tasks/new", {
      taskPrefill: {
        agentId: "agent-1",
        prompt: {
          text: "Update requirements",
          mentionedFiles: [{ path: "PRD.md", filename: "PRD.md" }],
          selectedSkill: {
            slug: "screen-requirements-writing",
            description: "Write screen requirements",
          },
        },
      },
    });

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /Assigned agent/i });

    expect(screen.getByLabelText(/Assigned agent/i)).toHaveValue("agent-1");
    expect(screen.getByLabelText(/Task prompt/i)).toHaveValue("Update requirements");
    expect(screen.getByText("/screen-requirements-writing")).toBeInTheDocument();
    expect(screen.getByText("PRD.md")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Title/i), "Requirements review");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            '"description":"Use skill \\"screen-requirements-writing\\". #PRD.md Update requirements"',
          ),
        }),
      );
    });
  });

  it("clears converted message references when assigned agent changes", async () => {
    const skilledAgent: Agent = {
      ...agent,
      capabilities: {
        ...agent.capabilities,
        builtInSkills: ["screen-requirements-writing"],
      },
    };
    const otherAgent: Agent = {
      ...agent,
      id: "agent-2",
      slug: "writer",
      name: "Writer",
      capabilities: { ...agent.capabilities },
    };
    const fetchMock = mockFetch({ agentsPayload: [skilledAgent, otherAgent] });

    renderWithRouter(<TasksPage mode="create" />, "/tasks/new", {
      taskPrefill: {
        agentId: "agent-1",
        prompt: {
          text: "Update requirements",
          mentionedFiles: [{ path: "PRD.md", filename: "PRD.md" }],
          selectedSkill: {
            slug: "screen-requirements-writing",
            description: "Write screen requirements",
          },
        },
      },
    });

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /Assigned agent/i });

    await user.selectOptions(screen.getByLabelText(/Assigned agent/i), "agent-2");

    expect(screen.getByLabelText(/Task prompt/i)).toHaveValue("Update requirements");
    expect(screen.queryByText("/screen-requirements-writing")).not.toBeInTheDocument();
    expect(screen.queryByText("PRD.md")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Title/i), "Requirements review");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"description":"Update requirements"'),
        }),
      );
    });
  });

  it("creates a custom hourly recurring task from the form", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage mode="create" />, "/tasks/new");

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /Assigned agent/i });
    await user.type(screen.getByLabelText(/Title/i), "Hourly review");
    await user.selectOptions(screen.getByLabelText(/Assigned agent/i), "agent-1");
    await user.selectOptions(screen.getByLabelText(/Trigger mode/i), "recurring");
    await user.selectOptions(screen.getByLabelText(/Repeat/i), "custom");
    await user.clear(screen.getByLabelText(/Every/i));
    await user.type(screen.getByLabelText(/Every/i), "4");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"frequency":"hour"'),
        }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks",
      expect.objectContaining({ body: expect.stringContaining('"interval":4') }),
    );
  });
});

describe("TaskDetailPage", () => {
  it("renders a scheduled-once task in overview mode", async () => {
    const runAt = "2026-02-14T12:30:00.000Z";
    mockFetch({
      taskPayload: {
        ...task,
        schedule: { mode: "scheduled_once", runAt },
      },
    });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    await screen.findByText(formatDate(runAt));
    expect(screen.getByText("Ready to publish.")).toBeInTheDocument();
  });

  it("renders a recurring task with an empty run history in overview mode", async () => {
    mockFetch({
      taskPayload: {
        ...task,
        schedule: {
          mode: "recurring",
          anchorAt: "2026-06-01T09:00:00.000Z",
          timezone: "UTC",
          repeatRule: { frequency: "week", interval: 1, weekdays: [1] },
        },
      },
      runsPayload: [],
    });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    await screen.findByText("Every 1 week on Mon");
    await waitFor(() => {
      expect(screen.queryByTestId("task-runs-loading")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });

  it("duplicates a task from the task detail page", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Duplicate" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/duplicate",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(await screen.findByText("edit:task-2")).toBeInTheDocument();
  });

  it("does not show duplicate on task run pages", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    await screen.findByRole("tab", { name: "Session" });
    expect(screen.queryByRole("button", { name: "Duplicate" })).not.toBeInTheDocument();
  });

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

  it("renders an empty text placeholder for messages without text or tool parts", async () => {
    mockFetch({
      sessionPayload: {
        conversation: {
          ...conversation,
          messages: [
            {
              id: "msg-empty",
              conversationId: "conv-1",
              role: "assistant",
              content: "",
              parts: [],
              attachments: [],
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

    expect(screen.getByText("(no text content)")).toBeInTheDocument();
  });

  it("renders tool call fallbacks when recorded tool metadata is incomplete", async () => {
    mockFetch({
      sessionPayload: {
        conversation: {
          ...conversation,
          messages: [
            {
              id: "msg-tool-call",
              conversationId: "conv-1",
              role: "assistant",
              content: "",
              parts: [
                {
                  id: "tool-call-name",
                  type: "tool_call",
                  name: "grep",
                  state: [],
                },
                {
                  id: "tool-call-default",
                  type: "tool_call",
                  name: "",
                  state: { status: "   " },
                },
              ],
              attachments: [],
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

    expect(screen.getByText("grep")).toBeInTheDocument();
    expect(screen.getByText("Tool")).toBeInTheDocument();
    expect(screen.getAllByText("No tool details recorded.")).toHaveLength(2);
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

function renderWithRouter(element: React.ReactElement, initialPath: string, state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[state ? { pathname: initialPath, state } : initialPath]}>
        <Routes>
          <Route element={element} path="/tasks" />
          <Route element={element} path="/tasks/new" />
          <Route element={<EditRouteProbe />} path="/tasks/:id/edit" />
          <Route element={element} path="/tasks/:id" />
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

function EditRouteProbe() {
  const params = useParams();
  return <div>{`edit:${params["id"]}`}</div>;
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
  const catalogPayload = options.catalogPayload ?? catalog;
  const runsPayload = options.runsPayload ?? [sessionRun];

  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url === "/api/agents") return Promise.resolve(jsonResponse(200, agentsPayload));
    if (url === "/api/agents/catalog") return Promise.resolve(jsonResponse(200, catalogPayload));
    if (url.startsWith("/api/agents/agent-1/workspace/find/file")) {
      return Promise.resolve(jsonResponse(200, ["PRD.md"]));
    }
    if (url.startsWith("/api/agents/agent-1/workspace/file")) {
      return Promise.resolve(
        jsonResponse(200, [{ name: "PRD.md", path: "PRD.md", type: "file", ignored: false }]),
      );
    }
    if (url === "/api/tasks") {
      const method = input instanceof Request ? input.method : init?.method;
      return Promise.resolve(
        method === "POST"
          ? jsonResponse(201, { ...task, id: "task-2", title: "Nightly review" })
          : jsonResponse(200, [taskPayload]),
      );
    }
    if (url.startsWith("/api/tasks?")) return Promise.resolve(jsonResponse(200, [taskPayload]));
    if (url === "/api/tasks/task-1/duplicate") {
      return Promise.resolve(
        jsonResponse(201, {
          ...taskPayload,
          id: "task-2",
          title: `${taskPayload.title} copy`,
          enabled: false,
          status: "disabled",
          latestFinalMessage: undefined,
        }),
      );
    }
    if (url === "/api/tasks/task-1") return Promise.resolve(jsonResponse(200, taskPayload));
    if (url === "/api/tasks/task-1/runs") return Promise.resolve(jsonResponse(200, runsPayload));
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
