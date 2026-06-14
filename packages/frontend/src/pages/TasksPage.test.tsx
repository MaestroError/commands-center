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
  TaskSchedulerState,
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
  fallbackModels: [],
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
  fallbackModels: [],
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
  fallbackModels: [],
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
  subtasks: [
    { id: "subtask-1", description: "Implement the docs updates.", status: "done" },
    {
      id: "subtask-2",
      description: `${"Review generated content. ".repeat(6)}Confirm it is complete.`,
      status: "running",
    },
  ],
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
      name: "Code reviewer",
      slug: "code-reviewer",
      description: "Review code changes for bugs and style issues.",
      category: "quality",
      metadata: {},
      detailsMarkdown: "Review code changes.",
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
  schedulerStatePayload?: TaskSchedulerState[];
  archivedTasksPayload?: Task[];
  templatesPayload?: TaskTemplate[];
  templateTasksPayload?: Task[];
  feedbackPayload?: TaskFeedbackThread[];
  subtaskProgressPayload?: TaskSubtaskProgress[];
  duplicateResponse?: Response;
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
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
    expect(screen.queryByRole("heading", { name: "Review" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByLabelText("Queued info")).toBeInTheDocument();
    expect(screen.getByText("Tasks with queued or running AI work.")).toHaveAttribute(
      "role",
      "tooltip",
    );
  });

  it("shows review before ready-to-check when review tasks exist", async () => {
    mockFetch({ taskPayload: { ...task, status: "review" } });

    renderWithRouter(<TasksPage />, "/tasks");

    await screen.findByTestId("tasks-board");
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Backlog",
      "Scheduled",
      "Queued",
      "Review",
      "Ready to Check",
      "Done",
    ]);
  });

  it("filters board cards by status suggestions", async () => {
    mockFetch({
      taskPayload: { ...task, status: "scheduled", scheduledAt: "2026-01-02T12:00:00.000Z" },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Toggle task filter" }));
    await user.click(screen.getByRole("button", { name: "queued" }));

    expect(screen.queryByRole("link", { name: "Ship release" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "scheduled" }));
    expect(await screen.findByRole("link", { name: "Ship release" })).toBeInTheDocument();
  });

  it("filters board cards by free-text keywords", async () => {
    mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Toggle task filter" }));
    await user.type(screen.getByLabelText("Filter tasks"), "missing keyword");

    expect(screen.queryByRole("link", { name: "Ship release" })).not.toBeInTheDocument();
  });

  it("clears the task filter when the filter panel is hidden", async () => {
    mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", { name: "Toggle task filter" });
    await user.click(toggle);
    await user.type(screen.getByLabelText("Filter tasks"), "missing keyword");

    expect(screen.queryByRole("link", { name: "Ship release" })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(screen.queryByLabelText("Filter tasks")).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Ship release" })).toBeInTheDocument();
  });

  it("lists board tasks and supports queueing", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    await screen.findByRole("link", { name: "Ship release" });
    expect(screen.getByLabelText("Assignee: Planner")).toHaveAttribute("title", "Planner");
    expect(screen.getByText("Planner", { selector: '[role="tooltip"]' })).toBeInTheDocument();
    expect(screen.getByText("PL")).toBeInTheDocument();
    expect(screen.queryByText("Prepare release notes.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue" })).toBeInTheDocument();
    expect(screen.getByText("Queue", { selector: '[role="tooltip"]' })).toBeInTheDocument();

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

    expect(await screen.findByLabelText("Subtasks")).toBeInTheDocument();
    expect(screen.getByLabelText("Subtask: Implement the docs updates.")).toBeInTheDocument();
    expect(
      screen.getByText(`${"Review generated content. ".repeat(3)}Review generated conte...`),
    ).toBeInTheDocument();
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
    expect(screen.getByTestId("task-detail-backdrop")).toHaveClass("bg-black/40");
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Runs" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Activity" })).not.toBeInTheDocument();
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
    const details = within(panel).getByRole("region", { name: "Overview details" });
    expect(within(details).queryByRole("heading", { name: "Details" })).not.toBeInTheDocument();
    expect(within(details).getByText("Status")).toBeInTheDocument();
    expect(within(details).getByText("Backlog")).toBeInTheDocument();
    expect(within(details).getByText("Agent")).toBeInTheDocument();
    expect(within(details).getByText("Planner")).toBeInTheDocument();
    expect(within(details).getByText("Latest run")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open full page" })).toHaveAttribute(
      "href",
      "/tasks/task-1",
    );
    expect(screen.getByRole("button", { name: "Back to Backlog" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to board" }));
    expect(
      screen.queryByRole("complementary", { name: "Task detail panel" }),
    ).not.toBeInTheDocument();
  });

  it("shows the agent default model in the overview when no override is set", async () => {
    mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const panel = await screen.findByRole("complementary", { name: "Task detail panel" });
    const details = within(panel).getByRole("region", { name: "Overview details" });
    expect(within(details).getByText("Model")).toBeInTheDocument();
    expect(within(details).getByText("openai/gpt-4.1 (agent default)")).toBeInTheDocument();
    // No override → no model pill in the header.
    expect(within(panel).queryByTitle("Model override for this task")).not.toBeInTheDocument();
  });

  it("shows the task model override in the overview and as a header pill", async () => {
    mockFetch({ taskPayload: { ...task, model: "anthropic/claude-haiku" } });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const panel = await screen.findByRole("complementary", { name: "Task detail panel" });
    const details = within(panel).getByRole("region", { name: "Overview details" });
    expect(within(details).getByText("anthropic/claude-haiku")).toBeInTheDocument();
    expect(within(panel).getByTitle("Model override for this task")).toHaveTextContent(
      "anthropic/claude-haiku",
    );
  });

  it("renders the latest run result as markdown in the board panel", async () => {
    mockFetch({
      taskPayload: { ...task, latestFinalMessage: "Stale cached result." },
      runsPayload: [
        {
          ...run,
          finalMessage: "## Latest run\n**Done**\nLine two",
        },
      ],
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const panel = await screen.findByRole("complementary", { name: "Task detail panel" });
    expect(within(panel).getAllByRole("heading", { name: "Latest run" }).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Latest update:").length).toBeGreaterThan(0);
    expect(
      within(panel).getAllByText((_, element) => element?.textContent === "Done\nLine two").length,
    ).toBeGreaterThan(0);
    expect(within(panel).queryByText("Stale cached result.")).not.toBeInTheDocument();
  });

  it("shows the explicit result after the last message across the panel", async () => {
    mockFetch({
      runsPayload: [
        {
          ...run,
          finalMessage: "Done.",
          resultText: "The explicit agent result.",
        },
      ],
      feedbackPayload: [],
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const panel = await screen.findByRole("complementary", { name: "Task detail panel" });
    // Latest update box shows the session summary plus the explicit result.
    expect(within(panel).getAllByText("Done.").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("The explicit agent result.").length).toBeGreaterThan(0);

    // Runs history list shows the result too.
    await user.click(within(panel).getByRole("tab", { name: "Runs" }));
    expect(within(panel).getAllByText("The explicit agent result.").length).toBeGreaterThan(0);
  });

  it("keeps overview selected by default for review tasks in the board panel", async () => {
    mockFetch({ taskPayload: { ...task, status: "review" } });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const panel = await screen.findByRole("complementary", { name: "Task detail panel" });
    expect(
      within(panel).getByRole("tab", { name: "Overview", selected: true }),
    ).toBeInTheDocument();
    expect(within(panel).queryByRole("tab", { name: "Activity" })).not.toBeInTheDocument();
    expect(within(panel).getByRole("region", { name: "Overview details" })).toBeInTheDocument();
  });

  it("shows aggregated artifacts after the latest result in the board panel", async () => {
    const olderRun: TaskRun = {
      ...run,
      id: "run-older",
      completedAt: "2026-01-01T00:05:00.000Z",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const newerRun: TaskRun = {
      ...run,
      id: "run-newer",
      finalMessage: "Published release artifacts.",
      artifacts: [
        {
          title: "Tool list update",
          path: "tools-23.md",
          description: "Updated generated tool inventory.",
        },
        {
          title: "Release report",
          path: "reports/release.md",
          description: "Generated release report.",
        },
      ],
      completedAt: "2026-01-01T00:10:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
    };
    mockFetch({ runsPayload: [newerRun, olderRun] });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const panel = await screen.findByRole("complementary", { name: "Task detail panel" });
    const artifacts = within(panel).getByRole("region", { name: "Task artifacts" });
    expect(within(artifacts).getByRole("heading", { name: "Artifacts" })).toBeInTheDocument();
    expect(within(artifacts).getAllByRole("link", { name: "tools-23.md" })).toHaveLength(1);
    expect(within(artifacts).getByText("reports/release.md")).toBeInTheDocument();
    const artifactLink = within(artifacts).getByRole("link", { name: "release.md" });
    const params = new URLSearchParams(artifactLink.getAttribute("href")?.replace("/files?", ""));
    expect(params.get("root")).toBe("workspace");
    expect(params.get("path")).toBe("reports");
    expect(params.get("select")).toBe("reports/release.md");
    expect(within(artifacts).getByText("2 runs")).toBeInTheDocument();
    expect(
      within(panel)
        .getAllByText("Published release artifacts.")[0]
        ?.compareDocumentPosition(artifacts),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("updates the board panel task title from inline edit mode", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("button", { name: "Edit task title" }));

    const titleInput = await screen.findByLabelText("Task title");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated release task");
    await user.click(screen.getByRole("button", { name: "Save title" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ title: "Updated release task" }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
    });
  });

  it("updates the board panel task prompt from the summary description", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("button", { name: "Edit task prompt" }));

    const promptInput = await screen.findByLabelText("Task prompt");
    await user.clear(promptInput);
    await user.type(promptInput, "Prepare release notes and publish the summary.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            description: "Prepare release notes and publish the summary.",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Task prompt")).not.toBeInTheDocument();
    });
  });

  it("cancels board panel task prompt edits without saving", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("button", { name: "Edit task prompt" }));

    const promptInput = await screen.findByLabelText("Task prompt");
    await user.clear(promptInput);
    await user.type(promptInput, "Do not save this prompt.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Task prompt")).not.toBeInTheDocument();
    expect(screen.getByText("Prepare release notes.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/tasks/task-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("updates board panel todos from textarea edit mode", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    const panel = await screen.findByRole("complementary", { name: "Task detail panel" });
    await user.click(within(panel).getByRole("button", { name: "Edit todos" }));

    const todosInput = await within(panel).findByLabelText("Todo items");
    await user.clear(todosInput);
    await user.type(todosInput, "Review changelog\nPublish release notes");
    await user.click(within(panel).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            todos: [
              {
                id: "todo-1",
                content: "Review changelog",
                status: "pending",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
              { content: "Publish release notes", status: "pending" },
            ],
          }),
        }),
      );
    });
  });

  it("moves a task back to backlog from the board panel footer", async () => {
    const fetchMock = mockFetch({ taskPayload: { ...task, status: "scheduled" } });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("button", { name: "Back to Backlog" }));

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

  it("closes task detail when clicking the backdrop", async () => {
    mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    expect(
      await screen.findByRole("complementary", { name: "Task detail panel" }),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("task-detail-backdrop"));
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
    expect(screen.getAllByText(/Please retest the release flow/).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/task-1/queue/preview",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("renders feedback as standalone comments after the detail tabs", async () => {
    const newerFeedbackThread: TaskFeedbackThread = {
      ...feedbackThread,
      id: "feedback-2",
      body: "Newest feedback comment.",
      subtasks: [],
      createdAt: "2026-01-01T00:20:00.000Z",
    };
    mockFetch({ feedbackPayload: [feedbackThread, newerFeedbackThread], runsPayload: [run] });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    expect(screen.queryByRole("tab", { name: "Feedback" })).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Feedback comments" })).toBeInTheDocument();
    expect(screen.getByText("Please retest the release flow.")).toBeInTheDocument();
    expect(screen.getByText("Tests failed.")).toBeInTheDocument();
    expect(screen.getByText("Planner replied")).toBeInTheDocument();
    expect(screen.getByText("Planner commented")).toBeInTheDocument();
    expect(screen.getAllByText("Done.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Retry subtask" })).not.toBeInTheDocument();

    const comments = screen.getByRole("region", { name: "Feedback comments" });
    expect(within(comments).queryByText("Latest update:")).not.toBeInTheDocument();
    expect(within(comments).getAllByRole("list", { name: "Run artifacts" })).toHaveLength(2);
    expect(within(comments).getAllByRole("link", { name: "tools-23.md" })).toHaveLength(2);
    expect(within(comments).getAllByText("tools-23.md").length).toBeGreaterThanOrEqual(2);
    expect(within(comments).getAllByText("Generated tool inventory.")).toHaveLength(2);
    expect(
      within(comments)
        .getByText("Newest feedback comment.")
        .compareDocumentPosition(within(comments).getByText("Done.")),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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

    expect((await screen.findAllByText("Please retest the release flow.")).length).toBeGreaterThan(
      0,
    );
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
          capabilities: { ...agent.capabilities, builtInSkills: ["code-reviewer"] },
        },
        reviewerAgent,
      ],
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("button", { name: "Leave comment" }));

    const feedbackInput = await screen.findByLabelText("Feedback");
    await user.type(feedbackInput, "/code");
    await user.click(await screen.findByRole("button", { name: /\/code-reviewer/i }));
    await user.type(feedbackInput, "#GOAL");
    await user.click(await screen.findByRole("button", { name: /GOAL\.md/i }));
    await user.type(feedbackInput, "Please coordinate with @review");
    await user.click(await screen.findByRole("button", { name: "@Reviewer" }));
    await user.click(screen.getByRole("button", { name: "Add feedback" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/search/files?query=GOAL", { method: "GET" });
      expect(fetchMock).not.toHaveBeenCalledWith(
        "/api/agents/agent-1/workspace/find/file?query=GOAL",
        { method: "GET" },
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            body: 'Use skill "code-reviewer". #GOAL.md Please coordinate with',
            mentionedAgentIds: ["agent-2"],
          }),
        }),
      );
    });
  });

  it("renders newly submitted feedback immediately as a comment", async () => {
    mockFetch({ agentsPayload: [agent, reviewerAgent] });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("button", { name: "Leave comment" }));

    const feedbackInput = await screen.findByLabelText("Feedback");
    await user.type(feedbackInput, "Please coordinate with @review");
    await user.click(await screen.findByRole("button", { name: "@Reviewer" }));
    await user.click(screen.getByRole("button", { name: "Add feedback" }));

    const comments = await screen.findByRole("region", { name: "Feedback comments" });
    expect(within(comments).getByText("Please retest the release flow.")).toBeInTheDocument();
    expect(within(comments).getByText("@Planner")).toBeInTheDocument();
  });

  it("opens and focuses the feedback editor from leave comment", async () => {
    mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    expect(screen.queryByLabelText("Feedback")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Leave comment" }));

    expect(await screen.findByLabelText("Feedback")).toHaveFocus();
  });

  it("hides the feedback editor after feedback is added", async () => {
    mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("button", { name: "Leave comment" }));
    await user.type(await screen.findByLabelText("Feedback"), "Follow up please");
    await user.click(screen.getByRole("button", { name: "Add feedback" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Feedback")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Leave comment" })).toBeInTheDocument();
  });

  it("searches mentioned agent files after feedback is delegated", async () => {
    const fetchMock = mockFetch({ agentsPayload: [agent, reviewerAgent] });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    await user.click(await screen.findByRole("button", { name: "Leave comment" }));

    const feedbackInput = await screen.findByLabelText("Feedback");
    await user.type(feedbackInput, "Delegate to @review");
    await user.click(await screen.findByRole("button", { name: "@Reviewer" }));
    await user.type(feedbackInput, " #REVIEW");

    expect(await screen.findByRole("button", { name: /REVIEW\.md/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/agents/agent-2/workspace/find/file?query=REVIEW", {
      method: "GET",
    });
  });

  it("updates persistent task context from the collapsible context section", async () => {
    const fetchMock = mockFetch({
      taskPayload: { ...task, context: { text: "Old context", attachments: [] } },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    expect(screen.queryByLabelText(/Task context/i)).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /^Context/i }));
    await user.click(screen.getByRole("button", { name: "Edit task context" }));
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

  it("persists the board panel context expanded state per task", async () => {
    mockFetch({
      taskPayload: { ...task, context: { text: "Use release notes.", attachments: [] } },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const contextToggle = await screen.findByRole("button", { name: /^Context/i });
    expect(contextToggle).toHaveAttribute("aria-expanded", "false");
    await user.click(contextToggle);
    expect(contextToggle).toHaveAttribute("aria-expanded", "true");
    expect(window.localStorage.getItem("cc-task-context-expanded:task-1")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Back to board" }));
    await user.click(await screen.findByRole("link", { name: "Ship release" }));
    expect(await screen.findByRole("button", { name: /^Context/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: /^Context/i }));
    expect(window.localStorage.getItem("cc-task-context-expanded:task-1")).toBe("false");
  });

  it("persists the board panel todos expanded state per task", async () => {
    mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const todosToggle = await screen.findByRole("button", { name: /Todos\s+0\/1/i });
    expect(todosToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("[ ] Read changelog")).toBeInTheDocument();

    await user.click(todosToggle);
    expect(todosToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("[ ] Read changelog")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("cc-task-todos-expanded:task-1")).toBe("false");

    await user.click(screen.getByRole("button", { name: "Back to board" }));
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    expect(await screen.findByRole("button", { name: /Todos\s+0\/1/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("hides the board panel todos section when a task has no todos", async () => {
    mockFetch({ taskPayload: { ...task, todos: [] } });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Ship release" }));

    const panel = await screen.findByRole("complementary", { name: "Task detail panel" });
    expect(within(panel).queryByRole("button", { name: /Todos\s+0\/0/i })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Edit todos" })).not.toBeInTheDocument();
    expect(within(panel).queryByText("No todo items.")).not.toBeInTheDocument();
  });

  it("shows templates separately from the board", async () => {
    mockFetch({ templatesPayload: [taskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    expect(await screen.findByRole("button", { name: "Weekly release notes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Backlog" })).not.toBeInTheDocument();
  });

  it("filters templates by suggestion text", async () => {
    mockFetch({ templatesPayload: [manualTaskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Toggle task filter" }));
    await user.click(screen.getByRole("button", { name: "repeating" }));

    expect(
      screen.queryByRole("button", { name: "Reusable release checklist" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "manual template" }));
    expect(
      await screen.findByRole("button", { name: "Reusable release checklist" }),
    ).toBeInTheDocument();
  });

  it("filters archived tasks by archived badge text", async () => {
    mockFetch({ archivedTasksPayload: [archivedTask] });

    renderWithRouter(<TasksPage />, "/tasks?view=archive");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Toggle task filter" }));
    await user.click(screen.getByRole("button", { name: "scheduled" }));

    expect(screen.queryByRole("link", { name: "Archived release" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "archived" }));
    expect(await screen.findByRole("link", { name: "Archived release" })).toBeInTheDocument();
  });

  it("opens template edit from the templates view", async () => {
    mockFetch({ templatesPayload: [taskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit template" }));

    expect(
      (await screen.findAllByRole("heading", { name: "Edit task template" })).length,
    ).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Weekly release notes")).toBeInTheDocument();
  });

  it("updates a template from the edit form", async () => {
    const fetchMock = mockFetch({ templatesPayload: [taskTemplate] });

    renderWithRouter(<TasksPage />, "/tasks/templates/template-1/edit");

    const user = userEvent.setup();
    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Updated template");
    await user.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/templates/template-1",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"title":"Updated template"'),
        }),
      );
    });
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
            fallbackModels: [],
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

  it("marks ready-to-check cards for review", async () => {
    const fetchMock = mockFetch({ taskPayload: { ...task, status: "ready_to_check" } });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Review" }));

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

  it("opens scheduling UI when an unscheduled task is dropped into scheduled", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const card = (await screen.findByRole("link", { name: "Ship release" })).closest("article");
    const scheduledColumn = screen.getByRole("heading", { name: "Scheduled" }).closest(".cc-panel");
    expect(card).not.toBeNull();
    expect(scheduledColumn).not.toBeNull();

    if (!card || !scheduledColumn) {
      throw new Error("Expected board card and scheduled column.");
    }

    fireDragEvent(card, "dragStart");
    fireDragEvent(scheduledColumn, "dragOver");
    fireDragEvent(scheduledColumn, "drop");

    expect(await screen.findByRole("form", { name: "Schedule task" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/tasks/task-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "scheduled" }) }),
    );
  });

  it("schedules a task from the scheduled drop dialog", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage />, "/tasks");

    const card = (await screen.findByRole("link", { name: "Ship release" })).closest("article");
    const scheduledColumn = screen.getByRole("heading", { name: "Scheduled" }).closest(".cc-panel");

    if (!card || !scheduledColumn) {
      throw new Error("Expected board card and scheduled column.");
    }

    fireDragEvent(card, "dragStart");
    fireDragEvent(scheduledColumn, "drop");

    fireEvent.change(await screen.findByLabelText("Schedule for"), {
      target: { value: "2026-01-02T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schedule task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "scheduled",
            scheduledAt: new Date("2026-01-02T12:00").toISOString(),
          }),
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

  it("prefers the explicit result over the session summary in the card tooltip", async () => {
    mockFetch({
      taskPayload: {
        ...task,
        latestFinalMessage: "Session summary text.",
        latestResultText: "Explicit agent result.",
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByLabelText("Latest result message")).toBeInTheDocument();
    expect(screen.getByText("Explicit agent result.")).toBeInTheDocument();
    expect(screen.queryByText("Session summary text.")).not.toBeInTheDocument();
  });

  it("falls back to the session summary in the card tooltip when no result is set", async () => {
    mockFetch({
      taskPayload: {
        ...task,
        latestFinalMessage: "Session summary text.",
        latestResultText: undefined,
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByLabelText("Latest result message")).toBeInTheDocument();
    expect(screen.getByText("Session summary text.")).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: /^Context/i }));

    const link = await screen.findByRole("link", { name: "notes.txt" });
    const params = new URLSearchParams(link.getAttribute("href")?.replace("/files?", ""));

    expect(link).toHaveAttribute("target", "_blank");
    expect(params.get("root")).toBe("workspace");
    expect(params.get("path")).toBe("task-context-attachments/ship-release-task-1");
    expect(params.get("select")).toBe(
      "task-context-attachments/ship-release-task-1/attachment-1.txt",
    );
  });

  it("removes task context attachments from the board panel", async () => {
    const fetchMock = mockFetch({
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
    await user.click(await screen.findByRole("button", { name: /^Context/i }));
    await user.click(await screen.findByRole("button", { name: "Remove notes.txt" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1/context",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ text: "Use release notes.", attachments: [] }),
        }),
      );
    });
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
    expect(
      screen.getByLabelText(`Scheduled: ${formatDate("2026-01-02T12:00:00.000Z")}`),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Todos: 0/1")).toBeInTheDocument();
    expect(screen.queryByText("Updated:")).not.toBeInTheDocument();
  });

  it("hides stale scheduled timing on board cards", async () => {
    mockFetch({
      schedulerStatePayload: [
        {
          taskId: "task-1",
          lastScheduledAt: "2026-01-02T12:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T12:00:00.000Z",
        },
      ],
      taskPayload: {
        ...task,
        status: "scheduled",
        scheduledAt: "2026-01-02T12:00:00.000Z",
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(await screen.findByRole("link", { name: "Ship release" })).toBeInTheDocument();
    expect(
      screen.queryByLabelText(`Scheduled: ${formatDate("2026-01-02T12:00:00.000Z")}`),
    ).not.toBeInTheDocument();
  });

  it("keeps stale schedule details visible in the task detail panel", async () => {
    mockFetch({
      schedulerStatePayload: [
        {
          taskId: "task-1",
          lastScheduledAt: "2026-01-02T12:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T12:00:00.000Z",
        },
      ],
      taskPayload: {
        ...task,
        status: "scheduled",
        scheduledAt: "2026-01-02T12:00:00.000Z",
      },
    });

    renderWithRouter(<TasksPage />, "/tasks?task=task-1");

    expect(
      await screen.findByLabelText(`Scheduled: ${formatDate("2026-01-02T12:00:00.000Z")}`),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(`Scheduled ${formatDate("2026-01-02T12:00:00.000Z")}`).length,
    ).toBeGreaterThan(0);
  });

  it("opens scheduling UI with a blank value for consumed scheduled tasks", async () => {
    mockFetch({
      schedulerStatePayload: [
        {
          taskId: "task-1",
          lastScheduledAt: "2026-01-02T12:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T12:00:00.000Z",
        },
      ],
      taskPayload: {
        ...task,
        status: "backlog",
        scheduledAt: "2026-01-02T12:00:00.000Z",
      },
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const card = (await screen.findByRole("link", { name: "Ship release" })).closest("article");
    const scheduledColumn = screen.getByRole("heading", { name: "Scheduled" }).closest(".cc-panel");

    if (!card || !scheduledColumn) {
      throw new Error("Expected board card and scheduled column.");
    }

    fireDragEvent(card, "dragStart");
    fireDragEvent(scheduledColumn, "drop");

    expect(await screen.findByRole("form", { name: "Schedule task" })).toBeInTheDocument();
    expect(screen.getByLabelText("Schedule for")).toHaveValue("");
  });

  it("shows a date-only due warning for cards due within seven days", async () => {
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    mockFetch({ taskPayload: { ...task, dueAt } });

    renderWithRouter(<TasksPage />, "/tasks");

    expect(
      await screen.findByText(`Due: ${new Date(dueAt).toLocaleDateString()}`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Due: .*:/)).not.toBeInTheDocument();
  });

  it("hides the due warning for cards due after seven days", async () => {
    const dueAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    mockFetch({ taskPayload: { ...task, dueAt } });

    renderWithRouter(<TasksPage />, "/tasks");

    await screen.findByRole("link", { name: "Ship release" });
    expect(screen.queryByText(/Due:/)).not.toBeInTheDocument();
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
    expect(
      await screen.findByRole("tab", { name: "Overview", selected: true }),
    ).toBeInTheDocument();

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

  it("shows duplicate failures from the task list", async () => {
    mockFetch({
      duplicateResponse: jsonResponse(403, {
        error: { code: "csrf_invalid", message: "CSRF token is invalid." },
      }),
    });

    renderWithRouter(<TasksPage />, "/tasks");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Duplicate" }));

    expect(await screen.findByText("Task action failed.")).toBeInTheDocument();
    expect(screen.getByText("CSRF token is invalid.")).toBeInTheDocument();
  });

  it("creates a task from the form", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TasksPage mode="create" />, "/tasks/new");

    const user = userEvent.setup();
    const prompt = "Draft nightly release notes for the platform launch and summarize blockers";
    await screen.findByRole("combobox", { name: /Assigned agent/i });
    await user.selectOptions(screen.getByLabelText(/Assigned agent/i), "agent-1");
    expect(
      screen.queryByText("Browse workspace files and drag relevant files into the task prompt."),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Task prompt/i), prompt);
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(`"title":"${prompt.slice(0, 50)}..."`),
        }),
      );
    });
    expect(await screen.findByRole("heading", { name: "Backlog" })).toBeInTheDocument();
  });

  it("creates a task prompt with selected file and skill mentions", async () => {
    const skilledAgent: Agent = {
      ...agent,
      capabilities: {
        ...agent.capabilities,
        builtInSkills: ["code-reviewer"],
      },
    };
    const fetchMock = mockFetch({ agentsPayload: [skilledAgent] });

    renderWithRouter(<TasksPage mode="create" />, "/tasks/new");

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /Assigned agent/i });
    await user.type(screen.getByLabelText(/Title/i), "Requirements review");
    await user.selectOptions(screen.getByLabelText(/Assigned agent/i), "agent-1");
    await user.type(screen.getByLabelText(/Task prompt/i), "#GOAL");
    await user.click(await screen.findByRole("button", { name: /GOAL.md/i }));
    await user.type(screen.getByLabelText(/Task prompt/i), "/code");
    await user.click(await screen.findByRole("button", { name: /code-reviewer/i }));
    await user.type(screen.getByLabelText(/Task prompt/i), "Update requirements");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            '"description":"Use skill \\"code-reviewer\\". #GOAL.md Update requirements"',
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
        builtInSkills: ["code-reviewer"],
      },
    };
    const fetchMock = mockFetch({ agentsPayload: [skilledAgent] });

    renderWithRouter(<TasksPage mode="create" />, "/tasks/new", {
      taskPrefill: {
        agentId: "agent-1",
        prompt: {
          text: "Update requirements",
          mentionedFiles: [{ path: "GOAL.md", filename: "GOAL.md" }],
          mentionedAgents: [],
          selectedSkill: {
            slug: "code-reviewer",
            description: "Review code changes",
          },
        },
      },
    });

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /Assigned agent/i });

    expect(screen.getByLabelText(/Assigned agent/i)).toHaveValue("agent-1");
    expect(screen.getByLabelText(/Task prompt/i)).toHaveValue("Update requirements");
    expect(screen.getByText("/code-reviewer")).toBeInTheDocument();
    expect(screen.getByText("GOAL.md")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Title/i), "Requirements review");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            '"description":"Use skill \\"code-reviewer\\". #GOAL.md Update requirements"',
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
        builtInSkills: ["code-reviewer"],
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
          mentionedFiles: [{ path: "GOAL.md", filename: "GOAL.md" }],
          mentionedAgents: [],
          selectedSkill: {
            slug: "code-reviewer",
            description: "Review code changes",
          },
        },
      },
    });

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: /Assigned agent/i });

    await user.selectOptions(screen.getByLabelText(/Assigned agent/i), "agent-2");

    expect(screen.getByLabelText(/Task prompt/i)).toHaveValue("Update requirements");
    expect(screen.queryByText("/code-reviewer")).not.toBeInTheDocument();
    expect(screen.queryByText("GOAL.md")).not.toBeInTheDocument();

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

  it("creates a custom hourly recurring template from the template form", async () => {
    const fetchMock = mockFetch({ templatesPayload: [] });

    renderWithRouter(<TasksPage />, "/tasks?view=templates");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create template" }));
    await user.type(screen.getByLabelText("Title"), "Hourly review");
    await user.selectOptions(screen.getByLabelText("Default agent"), "agent-1");
    await user.click(screen.getByLabelText(/Repeat on a schedule/i));
    await user.selectOptions(screen.getByLabelText(/^Repeat$/i), "custom");
    await user.selectOptions(screen.getByLabelText(/Unit/i), "hour");
    await user.clear(screen.getByLabelText(/Every/i));
    await user.type(screen.getByLabelText(/Every/i), "4");
    const createButtons = screen.getAllByRole("button", { name: "Create template" });
    expect(createButtons[1]).toBeDefined();
    await user.click(createButtons[1] as HTMLElement);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/templates",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"frequency":"hour"'),
        }),
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tasks/templates",
      expect.objectContaining({ body: expect.stringContaining('"interval":4') }),
    );
  });
});

describe("TaskDetailPage", () => {
  it("renders a scheduled task in overview mode", async () => {
    const runAt = "2026-02-14T12:30:00.000Z";
    mockFetch({
      taskPayload: {
        ...task,
        scheduledAt: runAt,
      },
    });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    await screen.findByText(`Scheduled ${formatDate(runAt)}`);
    expect(screen.getAllByText("Done.").length).toBeGreaterThan(0);
  });

  it("renders the latest run result as markdown on the task detail page", async () => {
    mockFetch({
      taskPayload: { ...task, latestFinalMessage: "Stale cached result." },
      runsPayload: [
        {
          ...run,
          finalMessage: "## Latest run\n**Done**\nLine two",
        },
      ],
    });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Runs" }));

    expect((await screen.findAllByRole("heading", { name: "Latest run" })).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText((_, element) => element?.textContent === "Done\nLine two").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Stale cached result.")).not.toBeInTheDocument();
  });

  it("renders task detail feedback as standalone comments", async () => {
    mockFetch({ feedbackPayload: [feedbackThread], runsPayload: [run] });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    expect(screen.queryByRole("tab", { name: "Feedback" })).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Feedback comments" })).toBeInTheDocument();
    expect(screen.getByText("Please retest the release flow.")).toBeInTheDocument();
    expect(screen.getByText("Planner replied")).toBeInTheDocument();
    expect(screen.getByText("Tests failed.")).toBeInTheDocument();
    expect(screen.getByText("Planner commented")).toBeInTheDocument();
    expect(screen.getAllByText("Done.").length).toBeGreaterThan(0);
    const comments = screen.getByRole("region", { name: "Feedback comments" });
    expect(within(comments).queryByText("Latest update:")).not.toBeInTheDocument();
    expect(within(comments).getAllByRole("list", { name: "Run artifacts" })).toHaveLength(2);
    expect(within(comments).getAllByRole("link", { name: "tools-23.md" })).toHaveLength(2);
  });

  it("updates the task detail page title from inline edit mode", async () => {
    const fetchMock = mockFetch();

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    const user = userEvent.setup();
    await screen.findByText("Ship release");
    await user.click(screen.getByRole("button", { name: "Edit task title" }));

    const titleInput = await screen.findByLabelText("Task title");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated release task");
    await user.click(screen.getByRole("button", { name: "Save title" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/task-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ title: "Updated release task" }),
        }),
      );
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
    });
  });

  it("aggregates task results and distinct artifacts on the task detail page", async () => {
    const resultTextRun: TaskRun = { ...run, finalMessage: undefined };
    const updatedRun: TaskRun = {
      ...run,
      id: "run-2",
      finalMessage: "Updated tool inventory.",
      artifacts: [
        {
          title: "Tool list update",
          path: "tools-23.md",
          description: "Updated generated tool inventory.",
        },
        {
          title: "Release report",
          path: "reports/release.md",
          description: "Generated release report.",
        },
      ],
      completedAt: "2026-01-01T00:10:00.000Z",
      updatedAt: "2026-01-01T00:10:00.000Z",
    };
    mockFetch({ runsPayload: [updatedRun, resultTextRun] });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    const outcomeSummary = (await screen.findByText("Task results and artifacts")).closest(
      "section",
    );
    expect(outcomeSummary).not.toBeNull();
    expect(screen.getAllByText("Updated tool inventory.").length).toBeGreaterThan(0);
    expect(screen.getByText("Saved all 24 available tools to `tools-23.md`.")).toBeInTheDocument();
    expect(
      within(outcomeSummary as HTMLElement).getAllByRole("link", { name: "tools-23.md" }),
    ).toHaveLength(1);
    const artifactLink = within(outcomeSummary as HTMLElement).getByRole("link", {
      name: "release.md",
    });
    expect(
      within(outcomeSummary as HTMLElement).getByText("reports/release.md"),
    ).toBeInTheDocument();
    const params = new URLSearchParams(artifactLink.getAttribute("href")?.replace("/files?", ""));
    expect(params.get("root")).toBe("workspace");
    expect(params.get("path")).toBe("reports");
    expect(params.get("select")).toBe("reports/release.md");
  });

  it("renders an unscheduled task with an empty run history in overview mode", async () => {
    mockFetch({
      taskPayload: task,
      runsPayload: [],
    });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    await screen.findByText("Not scheduled");
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Runs" }));
    await waitFor(() => {
      expect(screen.queryByTestId("task-runs-loading")).not.toBeInTheDocument();
    });
    const runHistory = screen.getByRole("heading", { name: "Run history" }).closest("section");
    expect(runHistory).not.toBeNull();
    expect(within(runHistory as HTMLElement).getByText("No runs yet")).toBeInTheDocument();
  });

  it("shows run history agent, outcome, target, artifacts, duration, and session availability", async () => {
    mockFetch({
      feedbackPayload: [feedbackThread],
      runsPayload: [
        {
          ...run,
          subtaskId: feedbackThread.subtasks[0]?.id,
          outcome: "needs_human_review",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:01:30.000Z",
        },
      ],
    });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "Runs" }));

    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Outcome")).toBeInTheDocument();
    expect(screen.getByText("Target")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getAllByText("Artifacts").length).toBeGreaterThan(0);
    expect(screen.getByText("Session")).toBeInTheDocument();
    expect(screen.getAllByText("Planner").length).toBeGreaterThan(0);
    expect(screen.getByText("Needs Human Review")).toBeInTheDocument();
    expect(screen.getByText("Subtask: Please retest the release flow.")).toBeInTheDocument();
    expect(screen.getByText("1m 30s")).toBeInTheDocument();
    expect(screen.getByText("Recorded")).toBeInTheDocument();
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

  it("shows duplicate failures from the task detail page", async () => {
    mockFetch({
      duplicateResponse: jsonResponse(403, {
        error: { code: "csrf_invalid", message: "CSRF token is invalid." },
      }),
    });

    renderWithRouter(<TaskDetailPage />, "/tasks/task-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Duplicate" }));

    expect(await screen.findByText("Task action failed.")).toBeInTheDocument();
    expect(screen.getByText("CSRF token is invalid.")).toBeInTheDocument();
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

  it("hides continue in chat when the session cannot be opened in chat", async () => {
    mockFetch({
      sessionPayload: {
        canOpenInChat: false,
      },
    });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    await screen.findByRole("tab", { name: "Session" });
    expect(screen.queryByRole("button", { name: "Continue in chat" })).not.toBeInTheDocument();
  });

  it("hides continue in chat when the agent slug cannot be resolved", async () => {
    mockFetch({ agentsPayload: [] });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    await screen.findByRole("tab", { name: "Session" });
    expect(screen.queryByRole("button", { name: "Continue in chat" })).not.toBeInTheDocument();
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

  it("shows when a task run has already continued in chat", async () => {
    mockFetch({
      sessionPayload: {
        conversation: { ...conversation, source: "chat", convertedAt: "2026-01-01T00:05:00.000Z" },
      },
    });

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    await screen.findByRole("tab", { name: "Session" });
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(
      screen.getByText(`Continued ${formatDate("2026-01-01T00:05:00.000Z")}`),
    ).toBeInTheDocument();
  });

  it("opens chat with the agent slug in the URL", async () => {
    mockFetch();

    renderWithRouter(<TaskDetailPage mode="run" />, "/tasks/task-1/runs/run-1");

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Continue in chat" }));

    await screen.findByText("planner/conv-1");
  });
});

function renderWithRouter(element: React.ReactElement, initialPath: string, state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[state ? { pathname: initialPath, state } : initialPath]}>
        <Routes>
          <Route element={<TasksPage />} path="/tasks" />
          <Route element={element} path="/tasks/new" />
          <Route element={<TasksPage mode="template-edit" />} path="/tasks/templates/:id/edit" />
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
  const schedulerStatePayload = options.schedulerStatePayload ?? [];
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
        jsonResponse(200, { nameMatches: [{ path: "GOAL.md" }], contentMatches: [] }),
      );
    }
    if (url.startsWith("/api/agents/agent-1/workspace/find/file")) {
      return Promise.resolve(jsonResponse(200, ["GOAL.md"]));
    }
    if (url.startsWith("/api/agents/agent-2/workspace/find/file")) {
      return Promise.resolve(jsonResponse(200, ["REVIEW.md"]));
    }
    if (url.startsWith("/api/agents/agent-1/workspace/file")) {
      return Promise.resolve(
        jsonResponse(200, [{ name: "GOAL.md", path: "GOAL.md", type: "file", ignored: false }]),
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
    if (url === "/api/tasks/templates/template-1") {
      const method = input instanceof Request ? input.method : init?.method;
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Partial<TaskTemplate>) : {};
      return Promise.resolve(
        jsonResponse(200, method === "PATCH" ? { ...taskTemplate, ...body } : taskTemplate),
      );
    }
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
    if (url === "/api/tasks/scheduler/state") {
      return Promise.resolve(jsonResponse(200, schedulerStatePayload));
    }
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
      if (options.duplicateResponse) {
        return Promise.resolve(options.duplicateResponse);
      }

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
    if (url === "/api/tasks/task-1/context") {
      const body =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Partial<Task["context"]>) : {};
      return Promise.resolve(
        jsonResponse(200, { ...taskPayload, context: { ...taskPayload.context, ...body } }),
      );
    }
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
    if (url === "/api/tasks/task-1") {
      const method = input instanceof Request ? input.method : init?.method;
      if (method === "PATCH") {
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Partial<Task>) : {};
        return Promise.resolve(jsonResponse(200, { ...taskPayload, ...body }));
      }

      return Promise.resolve(jsonResponse(200, taskPayload));
    }
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
