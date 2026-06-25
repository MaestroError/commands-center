import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
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
  useTaskMutations: () => ({
    accept: { mutate: vi.fn(), isPending: false, isError: false },
    update: { mutate: updateMutate, isPending: false, isError: false },
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

  it("non-outcome kinds do not show criteria", () => {
    renderCard(activity({ id: "a1", kind: "task_run_failed", payload: { taskId: "t1" } }));

    expect(screen.queryByText("Read changelog")).not.toBeInTheDocument();
  });
});
