import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Activity, Task } from "@cc/shared/schemas";

import { makeTabKey, parseTabsParam } from "@/hooks/use-editor-tabs";

import { ActivityCard } from "./ActivityCard";

const { updateMutate } = vi.hoisted(() => ({ updateMutate: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const task: Task = {
  id: "t1",
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
    {
      id: "todo-2",
      content: "Tag the release",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  status: "review",
  enabled: true,
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@/hooks/use-tasks-query", () => ({
  useTaskQuery: (taskId?: string) => ({ data: taskId === "t1" ? task : undefined }),
  useTaskRunFollowupsQuery: () => ({ data: [] }),
  useTaskMutations: () => ({
    accept: { mutate: vi.fn(), isPending: false, isError: false },
    continueRun: { mutateAsync: vi.fn(), isPending: false, isError: false },
    createRunFollowup: { mutateAsync: vi.fn(), isPending: false, isError: false },
    deleteRunFollowup: { mutateAsync: vi.fn(), isPending: false, isError: false },
    update: { mutate: updateMutate, isPending: false, isError: false },
    updateRunFollowup: { mutateAsync: vi.fn(), isPending: false, isError: false },
  }),
}));

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistsQuery: () => ({
    data: [
      {
        id: "agent-1",
        slug: "tonny",
        name: "Tonny",
        iconPath: "emoji:🧑‍💻",
      },
    ],
  }),
}));

function activity(overrides: Partial<Activity> & { id: string; kind: Activity["kind"] }): Activity {
  return {
    level: "action_required",
    status: "pending",
    title: "Activity",
    body: null,
    payload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

function renderCard(value: Activity, props: Partial<Parameters<typeof ActivityCard>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ActivityCard activity={value} onMarkRead={vi.fn()} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ActivityCard acceptance criteria", () => {
  it("task_completed: shows the task's acceptance criteria", () => {
    renderCard(activity({ id: "a1", kind: "task_completed", payload: { taskId: "t1" } }));

    fireEvent.click(screen.getByRole("button", { name: /Acceptance criteria/ }));

    expect(screen.getByRole("list", { name: "Acceptance criteria" })).toBeInTheDocument();
    expect(screen.getByText("Read changelog")).toBeInTheDocument();
    expect(screen.getByText("Tag the release")).toBeInTheDocument();
  });

  it("task_needs_review: criteria are interactive (operator can toggle)", () => {
    renderCard(activity({ id: "a1", kind: "task_needs_review", payload: { taskId: "t1" } }));

    fireEvent.click(screen.getByRole("button", { name: /Acceptance criteria/ }));

    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("task_needs_review: shows both the reason and question", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_needs_review",
        body: "Internal reason only.",
        payload: {
          taskId: "t1",
          taskRunId: "r1",
          question: "Should this be published?",
          suggestedReplies: ["Publish", "Revise"],
        },
      }),
    );

    expect(screen.getByText("Should this be published?")).toBeInTheDocument();
    expect(screen.getByText("Internal reason only.")).toBeInTheDocument();
  });

  it("task_needs_review: groups the question and reply controls", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_needs_review",
        payload: {
          taskId: "t1",
          taskRunId: "r1",
          question: "Should this be published?",
          suggestedReplies: ["Publish", "Revise"],
        },
      }),
    );

    const reviewSection = screen.getByRole("region", { name: "Review question and reply" });

    expect(within(reviewSection).getByText("Should this be published?")).toBeInTheDocument();
    expect(
      within(reviewSection).getByRole("button", { name: "Use suggested reply: Publish" }),
    ).toBeInTheDocument();
    expect(within(reviewSection).getByLabelText("Review reply")).toBeInTheDocument();
    expect(within(reviewSection).getByRole("button", { name: "Reply" })).toBeInTheDocument();
  });

  it("task_needs_review: emphasizes the question with a Q prefix", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_needs_review",
        payload: {
          taskId: "t1",
          taskRunId: "r1",
          question: "Should this be published?",
        },
      }),
    );

    const prefix = screen.getByText("Q:");

    expect(prefix).toHaveClass("text-accent");
    expect(prefix.parentElement).toHaveClass("text-sm", "font-semibold");
  });

  it("task_needs_review: places artifacts between the reason and question", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_needs_review",
        body: "Review is needed because the task produced a file.",
        payload: {
          taskId: "t1",
          taskRunId: "r1",
          question: "Does the file look correct?",
          artifacts: [
            {
              title: "Generated report",
              type: "file",
              link: "reports/generated.md",
            },
          ],
        },
      }),
    );

    const reason = screen.getByText("Review is needed because the task produced a file.");
    const artifacts = screen.getByRole("list", { name: "Activity artifacts" });
    const question = screen.getByText("Does the file look correct?");

    expect(
      reason.compareDocumentPosition(artifacts) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      artifacts.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("task_needs_review: shows a reason without a question", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_needs_review",
        body: "Check the generated report.",
        payload: { taskId: "t1", taskRunId: "r1" },
      }),
    );

    expect(screen.getByText("Check the generated report.")).toBeInTheDocument();
  });

  it("task_needs_review: shows a question without a reason", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_needs_review",
        payload: {
          taskId: "t1",
          taskRunId: "r1",
          question: "Should this be published?",
        },
      }),
    );

    expect(screen.getByText("Should this be published?")).toBeInTheDocument();
  });

  it("task_completed: shows artifact titles", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_completed",
        payload: {
          taskId: "t1",
          artifacts: [
            {
              title: "PR #4",
              type: "url",
              link: "https://github.com/RedberryProducts/pest-plugin-evals/pull/4",
            },
          ],
        },
      }),
    );

    const artifacts = screen.getByRole("list", { name: "Activity artifacts" });
    expect(within(artifacts).getByRole("link", { name: "PR #4" })).toHaveAttribute(
      "href",
      "https://github.com/RedberryProducts/pest-plugin-evals/pull/4",
    );
    expect(within(artifacts).queryByRole("link", { name: "4" })).not.toBeInTheDocument();
  });

  it("task_needs_review: shows artifact titles", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_needs_review",
        payload: {
          taskId: "t1",
          artifacts: [
            {
              title: "Review report",
              type: "file",
              link: "reports/review.md",
            },
          ],
        },
      }),
    );

    const artifacts = screen.getByRole("list", { name: "Activity artifacts" });
    const artifactLink = within(artifacts).getByRole("link", { name: "Review report" });
    const params = new URLSearchParams(artifactLink.getAttribute("href")?.replace("/files?", ""));
    expect(params.get("root")).toBe("workspace");
    expect(params.get("path")).toBe("reports");
    expect(params.get("select")).toBe("reports/review.md");
  });

  it("task_needs_review: opens private file artifacts in the specialist workspace", () => {
    const fileManagerPath = "specialists/testing-agent/Documents/references/tools-list.md";
    renderCard(
      activity({
        id: "a1",
        kind: "task_needs_review",
        payload: {
          taskId: "t1",
          taskRunId: "r1",
          artifacts: [
            {
              id: "artifact-1",
              conversationId: "conversation-1",
              title: "Tools List Markdown",
              type: "file",
              link: "Documents/references/tools-list.md",
              fileManagerPath,
              createdAt: "2026-01-01T00:00:00.000Z",
              shareLinks: [],
            },
          ],
        },
      }),
    );

    const artifactLink = screen.getByRole("link", { name: "Tools List Markdown" });
    const params = new URLSearchParams(artifactLink.getAttribute("href")?.replace("/files?", ""));
    const tabs = parseTabsParam(params.get("tabs"));
    const activeKey = makeTabKey("workspace", fileManagerPath);

    expect(params.get("path")).toBe("specialists/testing-agent/Documents/references");
    expect(params.get("select")).toBe(fileManagerPath);
    expect(params.get("active")).toBe(activeKey);
    expect(tabs).toEqual([
      expect.objectContaining({
        key: activeKey,
        path: fileManagerPath,
        root: "workspace",
      }),
    ]);
  });

  it("read-only history renders non-interactive criteria", () => {
    renderCard(activity({ id: "a1", kind: "task_completed", payload: { taskId: "t1" } }), {
      mode: "resolved",
    });

    fireEvent.click(screen.getByRole("button", { name: /Acceptance criteria/ }));

    expect(screen.getByText("Read changelog")).toBeInTheDocument();
    // Read-only criteria render as disabled markers, not toggle buttons.
    expect(screen.queryByRole("button", { name: /Mark "Read changelog"/ })).not.toBeInTheDocument();
  });

  it("compact cards omit criteria to stay condensed", () => {
    renderCard(activity({ id: "a1", kind: "task_completed", payload: { taskId: "t1" } }), {
      mode: "compact",
    });

    expect(screen.queryByText("Read changelog")).not.toBeInTheDocument();
  });

  it("compact cards omit artifacts to stay condensed", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_completed",
        payload: {
          taskId: "t1",
          artifacts: [{ title: "PR #4", type: "url", link: "https://example.com/pull/4" }],
        },
      }),
      { mode: "compact" },
    );

    expect(screen.queryByRole("list", { name: "Activity artifacts" })).not.toBeInTheDocument();
  });

  it("non-outcome kinds do not show criteria", () => {
    renderCard(activity({ id: "a1", kind: "task_run_failed", payload: { taskId: "t1" } }));

    expect(screen.queryByText("Read changelog")).not.toBeInTheDocument();
  });

  it("renders source specialist metadata from the normalized payload", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "specialist_info",
        payload: { sourceSpecialistId: "agent-1" },
      }),
    );

    const source = screen.getByTestId("activity-source");
    expect(within(source).getByText("by")).toBeInTheDocument();
    expect(within(source).getByText("Tonny")).toBeInTheDocument();
  });

  it("constrains the card and swipe wrapper to the feed width", () => {
    renderCard(activity({ id: "a1", kind: "specialist_info" }));

    const card = screen.getByTestId("activity-card-a1");
    expect(card).toHaveClass("w-full", "max-w-full", "min-w-0");
    expect(card.parentElement).toHaveClass("w-full", "max-w-full", "min-w-0");
  });

  it("elevates the mobile fixed footer above scrolling content", () => {
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { mobile: true });

    expect(screen.getByTestId("activity-card-footer")).toHaveClass(
      "bg-surface-elevated",
      "shadow-[var(--shadow-fixed-footer)]",
    );
  });

  it("uses the rounded reference surface and elevated header on mobile", () => {
    renderCard(activity({ id: "a1", kind: "specialist_warning" }), { mobile: true });

    expect(screen.getByTestId("activity-card-a1")).toHaveClass("rounded-xl", "border-l-[3px]");
    expect(screen.getByTestId("activity-card-header")).toHaveClass(
      "shadow-[var(--shadow-fixed-header)]",
    );
  });

  it("places mobile metadata before the title", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "specialist_warning",
        title: "Warning title",
        payload: { sourceSpecialistId: "agent-1" },
      }),
      { mobile: true },
    );

    const source = screen.getByTestId("activity-source");
    const title = screen.getByRole("heading", { name: "Warning title" });
    expect(source.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("reveals structured run output on demand", () => {
    renderCard(
      activity({
        id: "a1",
        kind: "task_completed",
        payload: { runOutput: "outcome: ready_for_review" },
      }),
    );

    expect(screen.queryByText("outcome: ready_for_review")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Run output/ }));
    expect(screen.getByText("outcome: ready_for_review")).toBeInTheDocument();
  });

  it("offers mark unread for resolved cards", () => {
    const onMarkUnread = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info", status: "archived" }), {
      mode: "resolved",
      onMarkUnread,
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark unread" }));

    expect(onMarkUnread).toHaveBeenCalledWith("a1");
  });

  it("uses responsive sizing for the resolved action", () => {
    renderCard(activity({ id: "a1", kind: "specialist_info", status: "archived" }), {
      mode: "resolved",
      onMarkUnread: vi.fn(),
    });

    expect(screen.getByRole("button", { name: "Mark unread" })).toHaveClass(
      "min-h-11",
      "md:min-h-0",
    );
  });

  it("swipes a pending card aside to mark it read", async () => {
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });
    const card = screen.getByTestId("activity-card-a1");

    dispatchPointer(card, "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 40, 24);
    dispatchPointer(card, "pointerup", 40, 24);

    expect(card).toHaveStyle({ transform: "translateX(-110%)" });
    await waitFor(() => expect(onMarkRead).toHaveBeenCalledWith("a1"));
  });

  it("uses the pointer-up displacement before React commits drag state", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });
    const card = screen.getByTestId("activity-card-a1");

    act(() => {
      dispatchPointerEvent(card, "pointerdown", 200, 20);
      dispatchPointerEvent(card, "pointermove", 40, 24);
      dispatchPointerEvent(card, "pointerup", 40, 24);
    });
    void act(() => vi.runAllTimers());

    expect(onMarkRead).toHaveBeenCalledWith("a1");
  });

  it("resets a cancelled swipe without marking the card read", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });
    const card = screen.getByTestId("activity-card-a1");

    dispatchPointer(card, "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 40, 24);
    dispatchPointer(card, "pointercancel", 40, 24);
    void act(() => vi.runAllTimers());

    expect(card).toHaveStyle({ transform: "translateX(0px)" });
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("waits for the exit duration before resolving a clicked card", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });

    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    void act(() => vi.advanceTimersByTime(179));
    expect(onMarkRead).not.toHaveBeenCalled();

    void act(() => vi.advanceTimersByTime(1));
    expect(onMarkRead).toHaveBeenCalledOnce();
  });

  it("resolves immediately when reduced motion is requested", () => {
    vi.useFakeTimers();
    mockReducedMotion(true);
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });

    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    void act(() => vi.runAllTimers());

    expect(onMarkRead).toHaveBeenCalledOnce();
  });

  it("snaps back after a below-threshold swipe", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });
    const card = screen.getByTestId("activity-card-a1");

    dispatchPointer(card, "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 120, 22);
    dispatchPointer(card, "pointerup", 120, 22);
    void act(() => vi.runAllTimers());

    expect(card).toHaveStyle({ transform: "translateX(0px)" });
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("snaps back after a rightward swipe beyond the threshold", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });
    const card = screen.getByTestId("activity-card-a1");

    dispatchPointer(card, "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 340, 22);
    dispatchPointer(card, "pointerup", 340, 22);
    void act(() => vi.runAllTimers());

    expect(card).toHaveStyle({ transform: "translateX(0px)" });
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("ignores a primarily vertical gesture", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });
    const card = screen.getByTestId("activity-card-a1");

    dispatchPointer(card, "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 180, 100);
    dispatchPointer(card, "pointerup", 180, 100);
    void act(() => vi.runAllTimers());

    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("keeps vertical mobile body scrolling separate from swipe-to-read", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info", body: "Scrollable body" }), {
      mobile: true,
      onMarkRead,
    });
    const body = screen.getByText("Scrollable body");
    const card = screen.getByTestId("activity-card-a1");

    dispatchPointer(body, "pointerdown", 200, 20);
    dispatchPointer(body, "pointermove", 20, 22);
    dispatchPointer(body, "pointerup", 20, 22);
    fireEvent.scroll(body);
    void act(() => vi.runAllTimers());

    expect(onMarkRead).not.toHaveBeenCalled();
    expect(card).toHaveStyle({ transform: "translateX(0px)" });
  });

  it("does not submit duplicate mark-read requests while exiting", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });
    const button = screen.getByRole("button", { name: "Mark read" });

    fireEvent.click(button);
    fireEvent.click(button);
    void act(() => vi.runAllTimers());

    expect(onMarkRead).toHaveBeenCalledOnce();
  });

  it("does not submit a second mark-read request from another swipe while exiting", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });
    const card = screen.getByTestId("activity-card-a1");

    dispatchPointer(card, "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 40, 22);
    dispatchPointer(card, "pointerup", 40, 22);
    dispatchPointer(card, "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 40, 22);
    dispatchPointer(card, "pointerup", 40, 22);
    void act(() => vi.runAllTimers());

    expect(onMarkRead).toHaveBeenCalledOnce();
  });

  it.each([
    ["button", () => screen.getByRole("button", { name: "Mark read" })],
    ["link", () => screen.getByRole("link", { name: "Runbook" })],
    ["textarea", () => screen.getByRole("textbox", { name: "Review reply" })],
  ])("does not start a swipe from an interactive %s", (_label, getTarget) => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(
      activity({
        id: "a1",
        kind: "task_needs_review",
        body: "[Runbook](https://example.com/runbook)",
        payload: { taskId: "t1", taskRunId: "run-1", question: "Ship it?" },
      }),
      { onMarkRead },
    );
    const card = screen.getByTestId("activity-card-a1");

    dispatchPointer(getTarget(), "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 20, 22);
    dispatchPointer(card, "pointerup", 20, 22);
    void act(() => vi.runAllTimers());

    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("does not start a swipe from an acceptance-criteria checkbox", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "task_needs_review", payload: { taskId: "t1" } }), {
      onMarkRead,
    });
    fireEvent.click(screen.getByRole("button", { name: /Acceptance criteria/ }));
    const card = screen.getByTestId("activity-card-a1");

    dispatchPointer(screen.getAllByRole("checkbox")[0]!, "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 20, 22);
    dispatchPointer(card, "pointerup", 20, 22);
    void act(() => vi.runAllTimers());

    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("does not start a swipe from a label", () => {
    vi.useFakeTimers();
    const onMarkRead = vi.fn();
    renderCard(activity({ id: "a1", kind: "specialist_info" }), { onMarkRead });
    const card = screen.getByTestId("activity-card-a1");
    const label = document.createElement("label");
    label.textContent = "Future field";
    card.append(label);

    dispatchPointer(label, "pointerdown", 200, 20);
    dispatchPointer(card, "pointermove", 20, 22);
    dispatchPointer(card, "pointerup", 20, 22);
    void act(() => vi.runAllTimers());

    expect(onMarkRead).not.toHaveBeenCalled();
  });
});

function dispatchPointer(element: Element, type: string, clientX: number, clientY: number): void {
  fireEvent(element, createPointerEvent(type, clientX, clientY));
}

function dispatchPointerEvent(
  element: Element,
  type: string,
  clientX: number,
  clientY: number,
): void {
  element.dispatchEvent(createPointerEvent(type, clientX, clientY));
}

function createPointerEvent(type: string, clientX: number, clientY: number): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

function mockReducedMotion(matches: boolean): void {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}
