import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type {
  Agent,
  AgentCatalog,
  ConversationDetail,
  Task,
  TaskFeedbackThread,
  TaskRun,
  TaskSubtaskProgress,
  TaskTemplate,
} from "@cc/shared/schemas";

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

const reviewerAgent: Agent = {
  ...agent,
  id: "agent-2",
  slug: "reviewer",
  name: "Reviewer",
};

const task: Task = {
  id: "task-1",
  agentId: "agent-1",
  title: "Ship release",
  description: "Prepare release notes.",
  context: { attachments: [] },
  todos: [
    {
      id: "todo-1",
      content: "Read changelog",
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  status: "backlog",
  triggerMode: "manual",
  schedule: { mode: "manual" },
  enabled: true,
  archived: false,
  latestFinalMessage: "Ready to publish.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const archivedTask: Task = {
  ...task,
  id: "task-archived",
  title: "Archived release",
  status: "archived",
  archived: true,
  archivedAt: "2026-01-08T00:00:00.000Z",
};

const generatedTask: Task = {
  ...task,
  id: "generated-task-1",
  title: "Weekly release notes",
  sourceTemplateId: "template-1",
  sourceOccurrenceAt: "2026-01-01T00:00:00.000Z",
};

const taskTemplate: TaskTemplate = {
  id: "template-1",
  defaultAgentId: "agent-1",
  title: "Weekly release notes",
  description: "Generate release note draft every week.",
  todos: [],
  recurrence: {
    mode: "recurring",
    anchorAt: "2026-01-01T00:00:00.000Z",
    timezone: "UTC",
    repeatRule: { frequency: "week", interval: 1, weekdays: [1] },
  },
  enabled: true,
  latestTaskId: "task-1",
  nextOccurrenceAt: "2026-01-08T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const manualTaskTemplate: TaskTemplate = {
  ...taskTemplate,
  id: "template-manual",
  title: "Reusable release checklist",
  recurrence: undefined,
  latestTaskId: undefined,
  nextOccurrenceAt: undefined,
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
  resultText: "Saved all 24 available tools to `tools-23.md`.",
  artifacts: [
    {
      title: "Tool list",
      path: "tools-23.md",
      description: "Generated tool inventory.",
    },
  ],
  needsHumanReview: true,
  humanReviewReason: "Confirm the generated tool list is complete.",
  result: { messageCount: 2 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const feedbackThread: TaskFeedbackThread = {
  id: "feedback-1",
  taskId: "task-1",
  body: "Please retest the release flow.",
  targetAgentIds: ["agent-1"],
  subtasks: [
    {
      id: "subtask-1",
      taskId: "task-1",
      feedbackId: "feedback-1",
      agentId: "agent-1",
      description: "Please retest the release flow.",
      status: "review",
      latestRun: {
        ...run,
        id: "run-subtask-1",
        subtaskId: "subtask-1",
        status: "failed",
        finalMessage: undefined,
        resultText: undefined,
        errorMessage: "Tests failed.",
      },
      replies: [
        {
          run: {
            ...run,
            id: "run-subtask-1",
            subtaskId: "subtask-1",
            status: "failed",
            finalMessage: undefined,
            resultText: undefined,
            errorMessage: "Tests failed.",
          },
          status: "review",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
};

const subtaskProgress: TaskSubtaskProgress = {
  taskId: "task-1",
  total: 2,
  completed: 1,
  active: 1,
  review: 0,
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
  activeRunsPayload?: TaskRun[];
  archivedTasksPayload?: Task[];
  templatesPayload?: TaskTemplate[];
  templateTasksPayload?: Task[];
  feedbackPayload?: TaskFeedbackThread[];
  subtaskProgressPayload?: TaskSubtaskProgress[];
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TasksPage", () => {
  it("renders board columns by default", async () => {
    mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByTestId("tasks-board")).toHaveClass("overflow-x-auto");
    expect(await screen.findByRole("heading", { name: "Backlog" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scheduled" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Queued" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready to Check" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Done" })).toBeInTheDocument();
  });

  it("lists board tasks and supports queueing", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    await screen.findByRole("link", { name: "Ship release" });
    expect(screen.getByLabelText("Assignee: Planner")).toHaveAttribute("title", "Planner");
    expect(screen.getByText("Planner", { selector: '[role="tooltip"]' })).toBeInTheDocument();
    expect(screen.getByText("PL")).toBeInTheDocument();
    expect(screen.queryByText("Prepare release notes.")).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Queue" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/queue",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ triggerSource: "manual" }),
        }),
      );
    });
  });

  it("shows subtask progress on board cards", async () => {
    mockFetch({ subtaskProgressPayload: [subtaskProgress] });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByText("Subtasks: 1/2 active 1")).toBeInTheDocument();
  });

  it("keeps ready-to-check cards constrained inside the board column", async () => {
    const finalMessage = "ReadyToCheckResultWithoutNaturalBreaks".repeat(4);
    mockFetch({
      taskPayload: { ...task, status: "ready_to_check", latestFinalMessage: finalMessage },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const taskLink = await screen.findByRole("link", { name: "Ship release" });
    expect(screen.getByRole("heading", { name: "Ready to Check" })).toBeInTheDocument();
    expect(taskLink.closest("article")).toHaveClass("min-w-0", "max-w-full");
    expect(taskLink).toHaveClass("min-w-0", "[overflow-wrap:anywhere]");
    expect(screen.getByLabelText("Latest result message")).toBeInTheDocument();
  });

  it("opens task detail in a board panel", async () => {
    mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const panel = await screen.findByRole("complementary", { name: "Task detail panel" });
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass("bg-surface-elevated");
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Runs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open full page" })).toHaveAttribute(
      "href",
      "/tasks/task-1",
    );

    await user.click(screen.getByRole("button", { name: "Back to board" }));
    expect(
      screen.queryByRole("complementary", { name: "Task detail panel" }),
    ).not.toBeInTheDocument();
  });

  it("previews queue context in the board panel", async () => {
    const fetchMock = mockFetch({ feedbackPayload: [feedbackThread] });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("button", { name: "Preview context" }));

    expect(await screen.findByText("Next run context preview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("Preview prompt for Ship release")).toBeInTheDocument();
    expect(screen.getByText(/Please retest the release flow/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-1/queue/preview",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders feedback replies as comments without subtask run actions", async () => {
    mockFetch({ feedbackPayload: [feedbackThread] });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("tab", { name: "Feedback" }));

    expect(await screen.findByText("Please retest the release flow.")).toBeInTheDocument();
    expect(screen.getByText("Tests failed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry subtask" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Inspect run" })).not.toBeInTheDocument();
  });

  it("opens subtask runs from the subtask tab", async () => {
    mockFetch({
      feedbackPayload: [feedbackThread],
      runsPayload: feedbackThread.subtasks[0]?.latestRun
        ? [feedbackThread.subtasks[0].latestRun]
        : [],
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("tab", { name: "Subtasks" }));

    expect(await screen.findByText("Please retest the release flow.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open run" })).toHaveAttribute(
      "href",
      "/tasks/task-1/runs/run-subtask-1",
    );
    expect(screen.queryByRole("button", { name: "Retry subtask" })).not.toBeInTheDocument();
  });

  it("submits feedback with file, skill, and agent mentions from the board panel", async () => {
    const fetchMock = mockFetch({
      agentsPayload: [
        {
          ...agent,
          capabilities: { ...agent.capabilities, builtInSkills: ["screen-requirements-writing"] },
        },
        reviewerAgent,
      ],
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("tab", { name: "Feedback" }));

    const feedbackInput = await screen.findByLabelText("Feedback");
    await user.type(feedbackInput, "/screen");
    await user.click(await screen.findByRole("button", { name: /\/screen-requirements-writing/i }));
    await user.type(feedbackInput, "#PRD");
    await user.click(await screen.findByRole("button", { name: /PRD\.md/i }));
    await user.type(feedbackInput, "Please coordinate with @review");
    await user.click(await screen.findByRole("button", { name: "@Reviewer" }));
    await user.click(screen.getByRole("button", { name: "Add feedback" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/search/files?query=PRD", { method: "GET" });
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/agents/agent-1/workspace/find/file?query=PRD",
        { method: "GET" },
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            body: 'Use skill "screen-requirements-writing". #PRD.md Please coordinate with',
            mentionedAgentIds: ["agent-2"],
          }),
        }),
      );
    });
  });

  it("searches mentioned agent files after feedback is delegated", async () => {
    const fetchMock = mockFetch({ agentsPayload: [agent, reviewerAgent] });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("tab", { name: "Feedback" }));

    const feedbackInput = await screen.findByLabelText("Feedback");
    await user.type(feedbackInput, "Delegate to @review");
    await user.click(await screen.findByRole("button", { name: "@Reviewer" }));
    await user.type(feedbackInput, " #REVIEW");

    expect(await screen.findByRole("button", { name: /REVIEW\.md/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/agents/agent-2/workspace/find/file?query=REVIEW", {
      method: "GET",
    });
  });

  it("updates persistent task context from the context tab", async () => {
    const fetchMock = mockFetch({
      taskPayload: { ...task, context: { text: "Old context", attachments: [] } },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("tab", { name: "Context" }));
    const contextInput = screen.getByLabelText(/Task context/i);
    await user.clear(contextInput);
    await user.type(contextInput, "Use the release checklist.");
    await user.click(screen.getByRole("button", { name: "Save context" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/context",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ text: "Use the release checklist.", attachments: [] }),
        }),
      );
    });
  });

  it("shows templates separately from the board", async () => {
    mockFetch({ templatesPayload: [taskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    expect(await screen.findByRole("button", { name: "Weekly release notes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Backlog" })).not.toBeInTheDocument();
  });

  it("shows templates without user-visible status badges", async () => {
    mockFetch({ templatesPayload: [taskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    expect(await screen.findByText("Template")).toBeInTheDocument();
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
    expect(screen.queryByText("Enabled")).not.toBeInTheDocument();
  });

  it("saves a board task as a reusable template", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Save as template" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/templates",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            defaultAgentId: "agent-1",
            title: "Ship release",
            description: "Prepare release notes.",
            todos: [{ content: "Read changelog", status: "pending" }],
            enabled: true,
          }),
        }),
      );
    });
    expect(
      await screen.findByRole("complementary", { name: "Task template detail panel" }),
    ).toBeInTheDocument();
  });

  it("moves a board task by dropping it into another column", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const card = (await screen.findByRole("link", { name: "Ship release" })).closest("article");
    const reviewColumn = screen.getByRole("heading", { name: "Review" }).closest(".cc-panel");
    expect(card).not.toBeNull();
    expect(reviewColumn).not.toBeNull();

    if (!card || !reviewColumn) {
      throw new Error("Expected board card and review column.");
    }

    fireDragEvent(card, "dragStart");
    expect(reviewColumn).toHaveAttribute("data-drop-state", "ready");
    fireDragEvent(reviewColumn, "dragOver");
    expect(reviewColumn).toHaveAttribute("data-drop-state", "active");
    fireDragEvent(reviewColumn, "drop");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "review" }),
        }),
      );
    });
  });

  it("queues a board task when dropped into the queued column", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const card = (await screen.findByRole("link", { name: "Ship release" })).closest("article");
    const queuedColumn = screen.getByRole("heading", { name: "Queued" }).closest(".cc-panel");
    expect(card).not.toBeNull();
    expect(queuedColumn).not.toBeNull();

    if (!card || !queuedColumn) {
      throw new Error("Expected board card and queued column.");
    }

    fireDragEvent(card, "dragStart");
    fireDragEvent(queuedColumn, "dragOver");
    fireDragEvent(queuedColumn, "drop");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/queue",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ triggerSource: "manual" }),
        }),
      );
    });
  });

  it("accepts ready-to-check tasks when dropped into done", async () => {
    const fetchMock = mockFetch({ taskPayload: { ...task, status: "ready_to_check" } });

    renderWithRouter(<TasksPage />, "/tasks");

    const card = (await screen.findByRole("link", { name: "Ship release" })).closest("article");
    const doneColumn = screen.getByRole("heading", { name: "Done" }).closest(".cc-panel");
    expect(card).not.toBeNull();
    expect(doneColumn).not.toBeNull();

    if (!card || !doneColumn) {
      throw new Error("Expected board card and done column.");
    }

    fireDragEvent(card, "dragStart");
    fireDragEvent(doneColumn, "dragOver");
    fireDragEvent(doneColumn, "drop");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/accept",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("accepts review tasks when dropped into done", async () => {
    const fetchMock = mockFetch({ taskPayload: { ...task, status: "review" } });

    renderWithRouter(<TasksPage />, "/tasks");

    const card = (await screen.findByRole("link", { name: "Ship release" })).closest("article");
    const doneColumn = screen.getByRole("heading", { name: "Done" }).closest(".cc-panel");
    expect(card).not.toBeNull();
    expect(doneColumn).not.toBeNull();

    if (!card || !doneColumn) {
      throw new Error("Expected board card and done column.");
    }

    fireDragEvent(card, "dragStart");
    expect(doneColumn).toHaveAttribute("data-drop-state", "ready");
    fireDragEvent(doneColumn, "dragOver");
    fireDragEvent(doneColumn, "drop");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/accept",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows the latest card result behind a message tooltip preview", async () => {
    const longMessage = `${"A".repeat(200)} extra text`;
    mockFetch({
      taskPayload: {
        ...task,
        latestFinalMessage: longMessage,
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByLabelText("Latest result message")).toBeInTheDocument();
    expect(screen.getByText(`${"A".repeat(200)}...`)).toBeInTheDocument();
    expect(screen.queryByText(longMessage)).not.toBeInTheDocument();
  });

  it("deletes a template from the templates view", async () => {
    const fetchMock = mockFetch({ templatesPayload: [taskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete template" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/template-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("runs a template immediately and opens the generated task", async () => {
    const fetchMock = mockFetch({ templatesPayload: [taskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Run now" }));
    await user.type(screen.getByLabelText(/Run context/i), "Use changelog.");
    await user.upload(
      screen.getByLabelText(/Add attachments/i),
      new File(["hello"], "notes.txt", { type: "text/plain" }),
    );
    expect(await screen.findByText(/notes.txt/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run task" }));

    await waitFor(() => {
      const runNowCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/tasks/templates/template-1/run-now" && init?.method === "POST",
      );
      expect(runNowCall).toBeDefined();
      const requestBody = runNowCall?.[1]?.body;
      expect(typeof requestBody).toBe("string");
      if (typeof requestBody !== "string") {
        throw new TypeError("Expected run-now request body to be a string.");
      }
      expect(JSON.parse(requestBody)).toEqual({
        context: { text: "Use changelog.", attachments: [] },
        contextAttachmentUploads: [
          {
            filename: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 5,
            dataUrl: "data:text/plain;base64,aGVsbG8=",
          },
        ],
      });
    });
    expect(
      await screen.findByRole("complementary", { name: "Task detail panel" }),
    ).toBeInTheDocument();
  });

  it("creates a task from a non-repeating template", async () => {
    const fetchMock = mockFetch({ templatesPayload: [manualTaskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    expect(await screen.findByText("Manual template")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/templates/template-manual/tasks",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(
      await screen.findByRole("complementary", { name: "Task detail panel" }),
    ).toBeInTheDocument();
  });

  it("creates a template without enabling repetition", async () => {
    const fetchMock = mockFetch({ templatesPayload: [] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create template" }));
    await user.type(screen.getByLabelText("Title"), "Reusable release checklist");
    await user.selectOptions(screen.getByLabelText("Default agent"), "agent-1");
    await user.type(screen.getByLabelText("Task prompt"), "Draft release notes.");
    const createButtons = screen.getAllByRole("button", { name: "Create template" });
    expect(createButtons[1]).toBeDefined();
    await user.click(createButtons[1] as HTMLElement);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/templates",
        expect.objectContaining({
          method: "POST",
          body: expect.not.stringContaining("recurrence"),
        }),
      );
    });
  });

  it("shows template detail with generated task history", async () => {
    mockFetch({ templatesPayload: [taskTemplate], templateTasksPayload: [generatedTask] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates&template=template-1");

    expect(
      await screen.findByRole("complementary", { name: "Task template detail panel" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Generated tasks" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Weekly release notes" }).length).toBeGreaterThan(
      0,
    );
  });

  it("deletes a template from the template detail panel", async () => {
    const fetchMock = mockFetch({ templatesPayload: [taskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates&template=template-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete template" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/template-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("links task context attachments to the workspace file manager", async () => {
    mockFetch({
      taskPayload: {
        ...task,
        context: {
          text: "Use release notes.",
          attachments: [
            {
              id: "attachment-1",
              filename: "notes.txt",
              mimeType: "text/plain",
              sizeBytes: 5,
              storageKey: "ship-release-task-1/attachment-1.txt",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("tab", { name: "Context" }));

    const link = await screen.findByRole("link", { name: "notes.txt" });
    const params = new URLSearchParams(link.getAttribute("href")?.replace("/files?", ""));

    expect(link).toHaveAttribute("target", "_blank");
    expect(params.get("root")).toBe("workspace");
    expect(params.get("path")).toBe("task-context-attachments/ship-release-task-1");
    expect(params.get("select")).toBe(
      "task-context-attachments/ship-release-task-1/attachment-1.txt",
    );
  });

  it("shows archived tasks separately from the board", async () => {
    mockFetch({ archivedTasksPayload: [archivedTask] });

    renderWithRouter(<TasksPage />, "/tasks?view=archive");

    expect(await screen.findByRole("link", { name: "Archived release" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Backlog" })).not.toBeInTheDocument();
  });

  it("shows scheduled card timing and queue-now action", async () => {
    mockFetch({
      taskPayload: {
        ...task,
        status: "scheduled",
        scheduledAt: "2026-01-02T12:00:00.000Z",
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByRole("button", { name: "Queue now" })).toBeInTheDocument();
    expect(screen.getAllByText(/Scheduled/).length).toBeGreaterThan(0);
    expect(screen.getByText("Todos: 0/1")).toBeInTheDocument();
  });

  it("shows active run actions for queued cards", async () => {
    const fetchMock = mockFetch({
      activeRunsPayload: [{ ...run, status: "running" }],
      taskPayload: { ...task, status: "queued", latestRunId: "run-1" },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByRole("link", { name: "View run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel run" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Queue" })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancel run" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/runs/run-1/cancel",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("does not show a running badge for queued-only cards", async () => {
    mockFetch({
      activeRunsPayload: [{ ...run, status: "queued" }],
      taskPayload: { ...task, status: "queued", latestRunId: "run-1" },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByRole("link", { name: "View run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel run" })).toBeInTheDocument();
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
    expect(screen.getAllByText("Queued").length).toBeGreaterThan(0);
  });

  it("accepts ready-to-check cards", async () => {
    const fetchMock = mockFetch({
      taskPayload: {
        ...task,
        status: "ready_to_check",
        latestRunId: "run-1",
        latestFinalMessage: "Release notes are ready.",
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByText("Release notes are ready.")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "Ship release" }));
    expect(await screen.findByRole("tab", { name: "Runs", selected: true })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("complementary", { name: "Task detail panel" })).getByRole("button", {
        name: "Accept",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/accept",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("retries review cards", async () => {
    const fetchMock = mockFetch({
      taskPayload: {
        ...task,
        status: "review",
        latestRunId: "run-1",
        latestFinalMessage: "Confirm the generated tool list is complete.",
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/queue",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows generated recurring task context on cards", async () => {
    mockFetch({
      taskPayload: {
        ...task,
        sourceTemplateId: "template-1",
        sourceOccurrenceAt: "2026-01-08T00:00:00.000Z",
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByText(/Generated/)).toBeInTheDocument();
  });

  it("reopens done cards", async () => {
    const fetchMock = mockFetch({
      taskPayload: { ...task, status: "done", doneAt: "2026-01-02T00:00:00.000Z" },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Reopen" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "backlog" }),
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
          mentionedAgents: [],
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
          mentionedAgents: [],
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
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Runs" }));
    await waitFor(() => {
      expect(screen.queryByTestId("task-runs-loading")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });

  it("preserves tasks view context from full-page detail", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1?view=archive");

    expect(await screen.findByRole("link", { name: "All tasks" })).toHaveAttribute(
      "href",
      "/tasks?view=archive",
    );
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

  it("queues a task from the task detail page without run context", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Run now" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/queue",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ triggerSource: "manual" }),
        }),
      );
    });
  });

  it("links full-page task context attachments to the workspace file manager", async () => {
    mockFetch({
      taskPayload: {
        ...task,
        context: {
          text: "Use release notes.",
          attachments: [
            {
              id: "attachment-1",
              filename: "notes.txt",
              mimeType: "text/plain",
              sizeBytes: 5,
              storageKey: "ship-release-task-1/attachment-1.txt",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      },
    });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Context" }));

    const link = await screen.findByRole("link", { name: "notes.txt" });
    const params = new URLSearchParams(link.getAttribute("href")?.replace("/files?", ""));

    expect(link).toHaveAttribute("target", "_blank");
    expect(params.get("root")).toBe("workspace");
    expect(params.get("path")).toBe("task-context-attachments/ship-release-task-1");
    expect(params.get("select")).toBe(
      "task-context-attachments/ship-release-task-1/attachment-1.txt",
    );
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
    expect(screen.getByText("Saved all 24 available tools to `tools-23.md`.")).toBeInTheDocument();
    expect(screen.getByText("Confirm the generated tool list is complete.")).toBeInTheDocument();
    expect(screen.getByText(/"path": "tools-23.md"/)).toBeInTheDocument();
    expect(screen.queryByText("Rendered prompt")).not.toBeInTheDocument();
  });

  it("shows run internals in the details tab", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Details" }));

    expect(screen.getByText("Rendered prompt")).toBeInTheDocument();
    expect(screen.getByText("Result text")).toBeInTheDocument();
    expect(screen.getAllByText("Artifacts").length).toBeGreaterThan(0);
    expect(screen.getByText("Human review")).toBeInTheDocument();
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
  const activeRunsPayload = options.activeRunsPayload ?? [];
  const archivedTasksPayload = options.archivedTasksPayload ?? [];
  const templatesPayload = options.templatesPayload ?? [];
  const templateTasksPayload = options.templateTasksPayload ?? [generatedTask];
  const feedbackPayload = options.feedbackPayload ?? [];
  const subtaskProgressPayload = options.subtaskProgressPayload ?? [];

  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url === "/api/agents") return Promise.resolve(jsonResponse(200, agentsPayload));
    if (url === "/api/agents/catalog") return Promise.resolve(jsonResponse(200, catalogPayload));
    if (url.startsWith("/api/search/files")) {
      return Promise.resolve(
        jsonResponse(200, { nameMatches: [{ path: "PRD.md" }], contentMatches: [] }),
      );
    }
    if (url.startsWith("/api/agents/agent-1/workspace/find/file")) {
      return Promise.resolve(jsonResponse(200, ["PRD.md"]));
    }
    if (url.startsWith("/api/agents/agent-2/workspace/find/file")) {
      return Promise.resolve(jsonResponse(200, ["REVIEW.md"]));
    }
    if (url.startsWith("/api/agents/agent-1/workspace/file")) {
      return Promise.resolve(
        jsonResponse(200, [{ name: "PRD.md", path: "PRD.md", type: "file", ignored: false }]),
      );
    }
    if (url === "/api/tasks/archive")
      return Promise.resolve(jsonResponse(200, archivedTasksPayload));
    if (url === "/api/tasks/templates") {
      const method = input instanceof Request ? input.method : init?.method;
      return Promise.resolve(
        method === "POST" ? jsonResponse(201, taskTemplate) : jsonResponse(200, templatesPayload),
      );
    }
    if (url === "/api/tasks/templates/template-1")
      return Promise.resolve(jsonResponse(200, taskTemplate));
    if (url === "/api/tasks/templates/template-1/tasks") {
      const method = input instanceof Request ? input.method : init?.method;
      return Promise.resolve(
        method === "POST"
          ? jsonResponse(201, generatedTask)
          : jsonResponse(200, templateTasksPayload),
      );
    }
    if (url === "/api/tasks/templates/template-manual/tasks") {
      return Promise.resolve(jsonResponse(201, generatedTask));
    }
    if (url === "/api/tasks/templates/template-1/run-now") {
      return Promise.resolve(
        jsonResponse(200, { ...run, taskId: "task-1", triggerSource: "template" }),
      );
    }
    if (url === "/api/tasks/runs/active")
      return Promise.resolve(jsonResponse(200, activeRunsPayload));
    if (url.startsWith("/api/tasks/subtask-progress")) {
      return Promise.resolve(jsonResponse(200, subtaskProgressPayload));
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
    if (url === "/api/tasks/task-1/context") return Promise.resolve(jsonResponse(200, taskPayload));
    if (url === "/api/tasks/task-1/feedback") {
      const method = input instanceof Request ? input.method : init?.method;
      return Promise.resolve(
        method === "POST" ? jsonResponse(201, feedbackThread) : jsonResponse(200, feedbackPayload),
      );
    }
    if (url === "/api/tasks/task-1/subtasks") {
      return Promise.resolve(
        jsonResponse(
          200,
          feedbackPayload.flatMap((entry) =>
            entry.subtasks.map((subtask) => ({
              id: subtask.id,
              taskId: subtask.taskId,
              feedbackId: subtask.feedbackId,
              agentId: subtask.agentId,
              description: subtask.description,
              createdAt: subtask.createdAt,
              updatedAt: subtask.updatedAt,
            })),
          ),
        ),
      );
    }
    if (url === "/api/tasks/task-1") return Promise.resolve(jsonResponse(200, taskPayload));
    if (url === "/api/tasks/template-1") return Promise.resolve(jsonResponse(204, null));
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
    if (url === "/api/tasks/task-1/queue") return Promise.resolve(jsonResponse(200, run));
    if (url === "/api/tasks/task-1/queue/preview") {
      return Promise.resolve(
        jsonResponse(200, {
          taskId: "task-1",
          subtask: feedbackThread.subtasks[0],
          feedback: feedbackThread,
          runAgentId: "agent-1",
          renderedPrompt: "Preview prompt for Ship release",
          renderedContext: { feedback: { body: feedbackThread.body } },
        }),
      );
    }
    if (url === "/api/tasks/task-1/accept") return Promise.resolve(jsonResponse(200, taskPayload));
    if (url === "/api/tasks/task-1/runs/run-1/cancel")
      return Promise.resolve(jsonResponse(200, { ...run, status: "cancelled" }));
    return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fireDragEvent(element: Element, eventName: "dragStart" | "dragOver" | "drop") {
  const store = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "move",
    getData: (key: string) => store.get(key) ?? "task-1",
    setData: vi.fn((key: string, value: string) => store.set(key, value)),
  };

  fireEvent[eventName](element, { dataTransfer });
}
