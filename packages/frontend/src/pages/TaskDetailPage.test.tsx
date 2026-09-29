import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type * as ReactRouter from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Specialist, Task, TaskRun, TaskSubtask } from "@cc/shared/schemas";

import { TaskDetailPage } from "./TaskDetailPage";

let mockParams: Record<string, string | undefined> = {};
let mockLocationSearch = "?status=queued";
const navigateMock = vi.fn();

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouter>();
  return {
    ...actual,
    useParams: () => mockParams,
    useNavigate: () => navigateMock,
    useLocation: () => ({ search: mockLocationSearch, pathname: "/tasks/task-1" }),
  };
});

const mockUseTaskQuery = vi.fn<() => unknown>();
const mockUseTaskRunsQuery = vi.fn<() => unknown>();
const mockUseTaskSubtasksQuery = vi.fn<() => unknown>();
const mockUseTaskRunQuery = vi.fn<() => unknown>();
const mockUseTaskRunSessionQuery = vi.fn<() => unknown>();
const mockUseTaskUsageQuery = vi.fn<() => unknown>();
const getMessagePartsMock = vi.fn();
const getOlderMessagesMock = vi.fn();
const duplicateMutateAsync = vi.fn();
const updateMutate = vi.fn();
const triggerMutate = vi.fn();
const restoreMutateAsync = vi.fn();
const removeMutateAsync = vi.fn();
const openInChatMutateAsync = vi.fn();
let openInChatIsPending = false;

vi.mock("@/lib/api/conversations", () => ({
  getMessageParts: (...args: unknown[]) => getMessagePartsMock(...args) as unknown,
  getOlderMessages: (...args: unknown[]) => getOlderMessagesMock(...args) as unknown,
}));

vi.mock("@/hooks/use-tasks-query", () => ({
  useTaskQuery: () => mockUseTaskQuery(),
  useTaskRunsQuery: () => mockUseTaskRunsQuery(),
  useTaskSubtasksQuery: () => mockUseTaskSubtasksQuery(),
  useTaskRunQuery: () => mockUseTaskRunQuery(),
  useTaskRunSessionQuery: () => mockUseTaskRunSessionQuery(),
  useArtifactDeliveryUrlsQuery: () => ({ data: undefined }),
  useTaskUsageQuery: () => mockUseTaskUsageQuery(),
  useTaskMutations: () => ({
    duplicate: { mutateAsync: duplicateMutateAsync },
    update: { mutate: updateMutate, isPending: false },
    trigger: { mutate: triggerMutate },
    restore: { mutateAsync: restoreMutateAsync, isPending: false },
    remove: { mutateAsync: removeMutateAsync, isPending: false },
    openInChat: { mutateAsync: openInChatMutateAsync, isPending: openInChatIsPending },
    createArtifactShareLink: { isPending: false, mutateAsync: vi.fn() },
    revokeArtifactShareLink: { isPending: false, mutateAsync: vi.fn() },
  }),
}));

const mockUseSpecialistsQuery = vi.fn<() => unknown>();
vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistsQuery: () => mockUseSpecialistsQuery(),
}));

// The feedback section pulls its own data; stub it so this test stays focused on
// the detail page's own branches.
vi.mock("@/components/tasks/task-feedback-section", () => ({
  TaskFeedbackPanelSection: () => <div data-testid="feedback-section" />,
  RunReplyPanel: () => <div data-testid="run-reply-panel" />,
}));

function buildAgent(): Specialist {
  return { id: "agent-1", slug: "planner", name: "Planner" } as Specialist;
}

function buildRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id: "run-1",
    taskId: "task-1",
    agentId: "agent-1",
    status: "completed",
    outcome: "success",
    triggerSource: "manual",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:02:30.000Z",
    updatedAt: "2026-01-01T00:02:30.000Z",
    finalMessage: "All done successfully.",
    opencodeSessionId: "sess-1",
    needsHumanReview: true,
    humanReviewReason: "Please double-check the output.",
    artifacts: [
      {
        id: "artifact-1",
        conversationId: "conversation-1",
        type: "file",
        link: "output.txt",
        title: "output.txt",
        description: "Generated file",
        createdAt: "2026-01-01T00:02:30.000Z",
        shareLinks: [],
      },
    ],
    ...overrides,
  } as TaskRun;
}

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Ship the feature",
    agentId: "agent-1",
    status: "review",
    enabled: true,
    archived: false,
    sourceTemplateId: "tmpl-1",
    sourceOccurrenceAt: "2026-01-01T00:00:00.000Z",
    scheduledAt: "2026-02-01T00:00:00.000Z",
    permissionProfile: { mode: "inherit" },
    todos: [
      { id: "td-1", text: "Do the thing", status: "completed" },
      { id: "td-2", text: "Verify", status: "pending" },
    ],
    context: {
      text: "Some context",
      attachments: [
        {
          id: "att-1",
          filename: "brief.pdf",
          mimeType: "application/pdf",
          storageKey: "tasks/task-1/brief.pdf",
        },
      ],
    },
    ...overrides,
  } as Task;
}

function renderPage(mode?: "task" | "run") {
  return render(
    <MemoryRouter>
      <TaskDetailPage mode={mode} />
    </MemoryRouter>,
  );
}

function buildConvertedRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return buildRun({
    conversation: {
      id: "conversation-1",
      source: "task_run",
      isCurrent: false,
      convertedAt: "2026-08-26T08:00:00.000Z",
    },
    ...overrides,
  });
}

function mockOpenableRun(): void {
  mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
  mockUseTaskRunQuery.mockReturnValue({ data: buildRun(), isLoading: false, error: null });
  mockUseTaskRunSessionQuery.mockReturnValue({
    data: { canOpenInChat: true, conversation: { messages: [] }, diagnostics: [] },
    isLoading: false,
    error: null,
  });
}

beforeEach(() => {
  mockParams = { id: "task-1" };
  mockLocationSearch = "?status=queued";
  vi.clearAllMocks();
  openInChatIsPending = false;
  openInChatMutateAsync.mockReset();
  openInChatMutateAsync.mockResolvedValue({ current: { id: "conversation-1" } });
  mockUseSpecialistsQuery.mockReturnValue({ data: [buildAgent()] });
  mockUseTaskRunsQuery.mockReturnValue({ data: [buildRun()], isLoading: false, error: null });
  mockUseTaskSubtasksQuery.mockReturnValue({ data: [], isLoading: false, error: null });
  mockUseTaskRunQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockUseTaskRunSessionQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockUseTaskUsageQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("TaskDetailPage overview", () => {
  it("renders a fully populated task and lets the user edit the title", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByTestId("task-detail-page")).toBeInTheDocument();
    expect(screen.getByText("Review needed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create signed links" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit task title" }));
    const input = screen.getByLabelText("Task title");
    await user.clear(input);
    await user.type(input, "Renamed task");
    await user.click(screen.getByRole("button", { name: "Save title" }));

    expect(updateMutate).toHaveBeenCalledWith(
      { id: "task-1", input: { title: "Renamed task" } },
      expect.anything(),
    );
  });

  it("navigates through the detail section tabs", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskSubtasksQuery.mockReturnValue({
      data: [{ id: "sub-1", agentId: "agent-1", description: "Investigate" } as TaskSubtask],
      isLoading: false,
      error: null,
    });
    mockUseTaskRunsQuery.mockReturnValue({
      data: [buildRun({ subtaskId: "sub-1" })],
      isLoading: false,
      error: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("task-detail-tab-subtasks"));
    expect(screen.getByText("Investigate")).toBeInTheDocument();

    await user.click(screen.getByTestId("task-detail-tab-runs"));
    expect(screen.getByTestId("task-run-row-run-1")).toBeInTheDocument();

    await user.click(screen.getByTestId("task-detail-tab-context"));
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
  });

  it("shows per-run token totals in the run history", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunsQuery.mockReturnValue({
      data: [buildRun({ id: "run-1" }), buildRun({ id: "run-2" })],
      isLoading: false,
      error: null,
    });
    mockUseTaskUsageQuery.mockReturnValue({
      data: {
        taskId: "task-1",
        runCount: 2,
        total: {
          totalTokens: 1_500,
          messageCount: 4,
          assistantMessageCount: 2,
          countedMessageCount: 2,
        },
        runs: {
          "run-1": {
            totalTokens: 1_200,
            messageCount: 2,
            assistantMessageCount: 1,
            countedMessageCount: 1,
          },
          // run-2 has a conversation but nothing recorded yet.
          "run-2": {
            totalTokens: 0,
            messageCount: 2,
            assistantMessageCount: 1,
            countedMessageCount: 0,
          },
        },
      },
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByTestId("task-detail-tab-runs"));

    expect(screen.getByTestId("task-run-row-run-1")).toHaveTextContent("1.2k tokens");
    // Unrecorded reads as a dash, never as a confident zero.
    expect(screen.getByTestId("task-run-row-run-2")).toHaveTextContent("—");
  });

  it("duplicates a task and navigates to the copy's editor", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    duplicateMutateAsync.mockResolvedValue({ id: "task-2" });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/tasks/task-2/edit");
    });
  });

  it("surfaces a duplicate failure as an action error", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    duplicateMutateAsync.mockRejectedValue(new Error("duplicate failed"));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(await screen.findByText("duplicate failed")).toBeInTheDocument();
  });

  it("triggers a run from the Run now button", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Run now" }));
    expect(triggerMutate).toHaveBeenCalledWith({ id: "task-1" });
  });

  it("renders archived task history without active-only mutations", async () => {
    mockLocationSearch = "?view=archive";
    mockUseTaskQuery.mockReturnValue({
      data: buildTask({ archived: true, status: "archived" }),
      isLoading: false,
      error: null,
    });
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit task title" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duplicate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave comment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create signed links" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

    await user.click(screen.getByTestId("task-detail-tab-runs"));
    expect(screen.getByTestId("task-run-inspect-run-1")).toHaveAttribute(
      "href",
      "/tasks/task-1/runs/run-1?view=archive",
    );
    expect(screen.queryByTestId("task-run-reply-run-1")).not.toBeInTheDocument();
  });

  it("closes an open title editor when the task becomes archived", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(screen.getByRole("button", { name: "Edit task title" }));
    mockUseTaskQuery.mockReturnValue({
      data: buildTask({ archived: true, status: "archived" }),
      isLoading: false,
      error: null,
    });
    view.rerender(
      <MemoryRouter>
        <TaskDetailPage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("closes an open run reply when the task becomes archived", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(screen.getByTestId("task-detail-tab-runs"));
    await user.click(screen.getByTestId("task-run-reply-run-1"));
    expect(screen.getByTestId("run-reply-panel")).toBeInTheDocument();
    mockUseTaskQuery.mockReturnValue({
      data: buildTask({ archived: true, status: "archived" }),
      isLoading: false,
      error: null,
    });
    view.rerender(
      <MemoryRouter>
        <TaskDetailPage />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("run-reply-panel")).not.toBeInTheDocument();
  });

  it("restores an archived task into its active detail path", async () => {
    const archivedTask = buildTask({ archived: true, status: "archived" });
    mockUseTaskQuery.mockReturnValue({ data: archivedTask, isLoading: false, error: null });
    restoreMutateAsync.mockResolvedValue(buildTask({ archived: false, status: "backlog" }));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(restoreMutateAsync).toHaveBeenCalledWith("task-1");
      expect(navigateMock).toHaveBeenCalledWith("/tasks/task-1");
    });
  });

  it("confirms deletion and returns to the preserved archive view", async () => {
    mockLocationSearch = "?view=archive";
    mockUseTaskQuery.mockReturnValue({
      data: buildTask({ archived: true, status: "archived" }),
      isLoading: false,
      error: null,
    });
    removeMutateAsync.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete task" }));

    await waitFor(() => {
      expect(removeMutateAsync).toHaveBeenCalledWith("task-1");
      expect(navigateMock).toHaveBeenCalledWith("/tasks?view=archive");
    });
  });

  it("returns a directly opened archived task to the archive view", () => {
    mockLocationSearch = "";
    mockUseTaskQuery.mockReturnValue({
      data: buildTask({ archived: true, status: "archived" }),
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getByRole("link", { name: "All tasks" })).toHaveAttribute(
      "href",
      "/tasks?view=archive",
    );
  });

  it("labels execution after a converted latest run as Start new run", async () => {
    mockUseTaskQuery.mockReturnValue({
      data: buildTask({
        latestRunId: "run-1",
        latestRunConversation: {
          id: "conversation-1",
          source: "task_run",
          isCurrent: true,
          convertedAt: "2026-08-26T08:00:00.000Z",
        },
      }),
      isLoading: false,
      error: null,
    });
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("button", { name: "Run now" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start new run" }));
    expect(triggerMutate).toHaveBeenCalledWith({ id: "task-1" });
  });

  it("opens a converted run from history instead of offering a reply", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunsQuery.mockReturnValue({
      data: [buildConvertedRun()],
      isLoading: false,
      error: null,
    });
    openInChatMutateAsync.mockResolvedValue({ current: { id: "conversation-1" } });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("task-detail-tab-runs"));
    expect(screen.queryByTestId("task-run-reply-run-1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open chat" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/chat/planner/conversation-1");
    });
  });

  it("disables a converted history chat action while it is opening", async () => {
    openInChatIsPending = true;
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunsQuery.mockReturnValue({
      data: [buildConvertedRun()],
      isLoading: false,
      error: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("task-detail-tab-runs"));

    expect(screen.getByRole("button", { name: "Opening..." })).toBeDisabled();
  });

  it("surfaces a converted history chat failure", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunsQuery.mockReturnValue({
      data: [buildConvertedRun()],
      isLoading: false,
      error: null,
    });
    openInChatMutateAsync.mockRejectedValue(new Error("chat failed"));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("task-detail-tab-runs"));
    await user.click(screen.getByRole("button", { name: "Open chat" }));

    expect(await screen.findByText("chat failed")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("disables a converted history chat action without a specialist slug", async () => {
    mockUseSpecialistsQuery.mockReturnValue({ data: [] });
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunsQuery.mockReturnValue({
      data: [buildConvertedRun()],
      isLoading: false,
      error: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId("task-detail-tab-runs"));

    expect(screen.getByRole("button", { name: "Open chat" })).toBeDisabled();
  });

  it("renders a minimal task without optional fields", async () => {
    mockUseTaskQuery.mockReturnValue({
      data: buildTask({
        status: "queued",
        sourceTemplateId: undefined,
        sourceOccurrenceAt: undefined,
        scheduledAt: undefined,
        scheduledFor: undefined,
        dueAt: undefined,
        enabled: false,
        todos: [],
        context: { text: "", attachments: [] },
      }),
      isLoading: false,
      error: null,
    });
    mockUseTaskRunsQuery.mockReturnValue({ data: [], isLoading: false, error: null });
    const user = userEvent.setup();
    renderPage();

    // No decision summary for a queued task.
    expect(screen.queryByText("Review needed")).not.toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();

    await user.click(screen.getByTestId("task-detail-tab-runs"));
    expect(screen.getAllByText("No runs yet").length).toBeGreaterThan(0);

    await user.click(screen.getByTestId("task-detail-tab-context"));
    expect(screen.getByText("No context provided.")).toBeInTheDocument();
  });

  it("shows the loading state", () => {
    mockUseTaskQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderPage();
    expect(screen.getByTestId("task-detail-loading")).toBeInTheDocument();
  });

  it("shows the error state", () => {
    mockUseTaskQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("load failed"),
    });
    renderPage();
    expect(screen.getByText("load failed")).toBeInTheDocument();
  });

  it("shows the not-found state when the task is missing", () => {
    mockUseTaskQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
    renderPage();
    expect(screen.getByText("Task not found")).toBeInTheDocument();
  });
});

describe("TaskDetailPage run mode", () => {
  beforeEach(() => {
    mockParams = { id: "task-1", runId: "run-1" };
  });

  it.each([
    ["archived", buildTask({ archived: true, status: "archived" })],
    ["not yet loaded", undefined],
  ])("hides chat continuation when the task is %s", (_label, task) => {
    mockUseTaskQuery.mockReturnValue({ data: task, isLoading: !task, error: null });
    mockUseTaskRunQuery.mockReturnValue({ data: buildRun(), isLoading: false, error: null });
    mockUseTaskRunSessionQuery.mockReturnValue({
      data: { canOpenInChat: true, diagnostics: [] },
      isLoading: false,
      error: null,
    });
    renderPage("run");
    expect(screen.queryByRole("button", { name: "Continue in chat" })).not.toBeInTheDocument();
  });

  it("shows a converted run chat action while session inspection is loading", () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunQuery.mockReturnValue({
      data: buildConvertedRun(),
      isLoading: false,
      error: null,
    });
    mockUseTaskRunSessionQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });

    renderPage("run");

    expect(screen.getByRole("button", { name: "Open chat" })).toBeInTheDocument();
    expect(screen.getByText(/^Continued /)).toBeInTheDocument();
  });

  it("shows a converted run chat action when session inspection fails", () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunQuery.mockReturnValue({
      data: buildConvertedRun(),
      isLoading: false,
      error: null,
    });
    mockUseTaskRunSessionQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("session unavailable"),
    });

    renderPage("run");

    expect(screen.getByRole("button", { name: "Open chat" })).toBeInTheDocument();
    expect(screen.getByText(/^Continued /)).toBeInTheDocument();
  });

  it("disables the run-detail chat action while it is opening", () => {
    openInChatIsPending = true;
    mockOpenableRun();

    renderPage("run");

    expect(screen.getByRole("button", { name: "Opening..." })).toBeDisabled();
  });

  it("surfaces a run-detail chat failure", async () => {
    mockOpenableRun();
    openInChatMutateAsync.mockRejectedValue(new Error("conversion failed"));
    const user = userEvent.setup();
    renderPage("run");

    await user.click(screen.getByRole("button", { name: "Continue in chat" }));

    expect(await screen.findByText("conversion failed")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("disables the run-detail chat action without a specialist slug", () => {
    mockUseSpecialistsQuery.mockReturnValue({ data: [] });
    mockOpenableRun();

    renderPage("run");

    expect(screen.getByRole("button", { name: "Continue in chat" })).toBeDisabled();
  });

  it("shows the run loading state", () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderPage("run");
    expect(screen.getByTestId("task-run-loading")).toBeInTheDocument();
  });

  it("shows the full session message count for a paginated run", () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunQuery.mockReturnValue({ data: buildRun(), isLoading: false, error: null });
    mockUseTaskRunSessionQuery.mockReturnValue({
      data: {
        conversation: { id: "paged", messageCount: 125, messages: [], hasMoreMessages: true },
        diagnostics: [],
      },
      isLoading: false,
      error: null,
    });
    renderPage("run");
    expect(screen.getByText("Messages").parentElement).toHaveTextContent("125");
  });

  it("shows the run error state", () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("run boom"),
    });
    renderPage("run");
    expect(screen.getByText("run boom")).toBeInTheDocument();
  });

  it("renders the session and details tabs for a completed run and opens it in chat", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunQuery.mockReturnValue({
      data: buildRun({
        errorMessage: "a warning",
        errorDetails: { code: "E1" },
        renderedPrompt: "Do the work",
        renderedContext: { foo: "bar" },
        result: { messageCount: 2 },
        effectivePermissions: { mode: "inherit" } as never,
        resultText: "the result",
      }),
      isLoading: false,
      error: null,
    });
    mockUseTaskRunSessionQuery.mockReturnValue({
      data: {
        canOpenInChat: true,
        conversation: {
          convertedAt: "2026-01-03T00:00:00.000Z",
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "Working on it",
              parts: [
                {
                  id: "p1",
                  type: "tool",
                  tool: "read",
                  state: { status: "completed", input: { path: "a.ts" }, output: "ok" },
                },
              ],
              attachments: [],
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        diagnostics: [{ code: "warn", message: "heads up" }],
      },
      isLoading: false,
      error: null,
    });
    openInChatMutateAsync.mockResolvedValue({ current: { id: "conv-9" } });

    const user = userEvent.setup();
    renderPage("run");

    expect(screen.getByTestId("task-run-inspector")).toBeInTheDocument();

    // Expand the session log.
    await user.click(screen.getByTestId("task-run-session-log"));
    expect(screen.getByText("Working on it")).toBeInTheDocument();

    // Switch to the details tab and expand its collapsible blocks.
    await user.click(screen.getByTestId("task-run-tab-details"));
    await user.click(screen.getByRole("button", { name: /Rendered prompt/ }));
    await user.click(screen.getByRole("button", { name: /Rendered context/ }));
    expect(screen.getByText("Do the work")).toBeInTheDocument();

    // Continue in chat navigates to the recovered conversation.
    await user.click(screen.getByRole("button", { name: "Continue in chat" }));
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/chat/planner/conv-9");
    });
  });

  it("offers the full output when the run log's tool output was trimmed", async () => {
    // The session log renders projected parts, so long tool output arrives cut
    // to a preview. Without the notice it would be silently truncated.
    getMessagePartsMock.mockResolvedValue({
      messageId: "m1",
      parts: [
        {
          id: "p1",
          type: "tool",
          tool: "read",
          messageID: "m1",
          state: { status: "completed", input: { path: "a.ts" }, output: "THE COMPLETE OUTPUT" },
        },
      ],
    });
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunQuery.mockReturnValue({ data: buildRun(), isLoading: false, error: null });
    mockUseTaskRunSessionQuery.mockReturnValue({
      data: {
        canOpenInChat: false,
        conversation: {
          id: "conv-1",
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "",
              parts: [
                {
                  id: "p1",
                  type: "tool",
                  tool: "read",
                  messageID: "m1",
                  state: {
                    status: "completed",
                    input: { path: "a.ts" },
                    output: "truncated preview",
                    outputTruncated: true,
                    outputLength: 12_345,
                  },
                },
              ],
              attachments: [],
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
        diagnostics: [],
      },
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    renderPage("run");
    await user.click(screen.getByTestId("task-run-session-log"));

    expect(screen.getByText(/12,345 characters/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show full output" }));

    expect(getMessagePartsMock).toHaveBeenCalledWith("conv-1", "m1");
    expect(await screen.findByText(/THE COMPLETE OUTPUT/)).toBeInTheDocument();
  });

  it("shows token and timing figures in the run session log", async () => {
    mockUseTaskQuery.mockReturnValue({ data: buildTask(), isLoading: false, error: null });
    mockUseTaskRunQuery.mockReturnValue({ data: buildRun(), isLoading: false, error: null });
    mockUseTaskRunSessionQuery.mockReturnValue({
      data: {
        canOpenInChat: false,
        conversation: {
          messages: [
            {
              id: "m1",
              role: "assistant",
              content: "Working on it",
              parts: [
                {
                  id: "p1",
                  type: "tool",
                  tool: "read",
                  state: {
                    status: "completed",
                    input: { path: "a.ts" },
                    output: "ok",
                    time: { start: 1_782_898_078_071, end: 1_782_898_078_075 },
                  },
                },
              ],
              attachments: [],
              tokens: {
                input: 46_890,
                output: 232,
                reasoning: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 47_122,
              },
              modelId: "claude-opus-5",
              providerId: "anthropic",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:12.500Z",
            },
          ],
        },
        diagnostics: [],
      },
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    renderPage("run");

    await user.click(screen.getByTestId("task-run-session-log"));

    // Message-level usage.
    await user.click(screen.getByRole("button", { name: "Message tokens and timing" }));
    const messageDialog = await screen.findByRole("dialog");
    expect(messageDialog).toHaveTextContent("47,122");
    expect(messageDialog).toHaveTextContent("anthropic/claude-opus-5");
    await user.click(screen.getByRole("button", { name: "Close" }));

    // Per-tool timing on the same run log.
    await user.click(screen.getByRole("button", { name: "Timing for read" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("4ms");
  });
});
