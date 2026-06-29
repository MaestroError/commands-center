import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Activity, Task } from "@cc/shared/schemas";

import { ActivityCard } from "./ActivityCard";

const { updateMutate } = vi.hoisted(() => ({ updateMutate: vi.fn() }));

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
        <ActivityCard activity={value} onArchive={vi.fn()} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ActivityCard acceptance criteria", () => {
  it("task_completed: shows the task's acceptance criteria", () => {
    renderCard(activity({ id: "a1", kind: "task_completed", payload: { taskId: "t1" } }));

    expect(screen.getByRole("list", { name: "Acceptance criteria" })).toBeInTheDocument();
    expect(screen.getByText("Read changelog")).toBeInTheDocument();
    expect(screen.getByText("Tag the release")).toBeInTheDocument();
  });

  it("task_needs_review: criteria are interactive (operator can toggle)", () => {
    renderCard(activity({ id: "a1", kind: "task_needs_review", payload: { taskId: "t1" } }));

    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("task_needs_review: shows the question instead of the raw reason", () => {
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
    expect(screen.queryByText("Internal reason only.")).not.toBeInTheDocument();
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

  it("read-only history renders non-interactive criteria", () => {
    renderCard(activity({ id: "a1", kind: "task_completed", payload: { taskId: "t1" } }), {
      readOnly: true,
    });

    expect(screen.getByText("Read changelog")).toBeInTheDocument();
    // Read-only criteria render as disabled markers, not toggle buttons.
    expect(screen.queryByRole("button", { name: /Mark "Read changelog"/ })).not.toBeInTheDocument();
  });

  it("compact cards omit criteria to stay condensed", () => {
    renderCard(activity({ id: "a1", kind: "task_completed", payload: { taskId: "t1" } }), {
      compact: true,
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
      { compact: true },
    );

    expect(screen.queryByRole("list", { name: "Activity artifacts" })).not.toBeInTheDocument();
  });

  it("non-outcome kinds do not show criteria", () => {
    renderCard(activity({ id: "a1", kind: "task_run_failed", payload: { taskId: "t1" } }));

    expect(screen.queryByText("Read changelog")).not.toBeInTheDocument();
  });
});
