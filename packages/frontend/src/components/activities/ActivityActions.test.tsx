import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "@cc/shared/schemas";

import { ActivityActions } from "./ActivityActions";

import * as api from "@/lib/api";

const {
  acceptMutate,
  continueRunMutateAsync,
  createRunFollowupMutateAsync,
  deleteRunFollowupMutateAsync,
  pendingFollowups,
  updateRunFollowupMutateAsync,
} = vi.hoisted(() => ({
  acceptMutate: vi.fn(),
  continueRunMutateAsync: vi.fn(),
  createRunFollowupMutateAsync: vi.fn(),
  deleteRunFollowupMutateAsync: vi.fn(),
  pendingFollowups: [] as Array<{
    id: string;
    taskId: string;
    runId: string;
    kind: "operator_reply" | "review_answer";
    status: "pending" | "sent" | "failed";
    body: string;
    createdAt: string;
    sentAt?: string;
  }>,
  updateRunFollowupMutateAsync: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fillSecret: vi.fn(),
}));

vi.mock("@/hooks/use-tasks-query", () => ({
  useTaskRunFollowupsQuery: () => ({ data: pendingFollowups }),
  useTaskMutations: () => ({
    accept: { mutate: acceptMutate, isPending: false, isError: false },
    continueRun: { mutateAsync: continueRunMutateAsync, isPending: false, isError: false },
    createRunFollowup: {
      mutateAsync: createRunFollowupMutateAsync,
      isPending: false,
      isError: false,
    },
    deleteRunFollowup: {
      mutateAsync: deleteRunFollowupMutateAsync,
      isPending: false,
      isError: false,
    },
    updateRunFollowup: {
      mutateAsync: updateRunFollowupMutateAsync,
      isPending: false,
      isError: false,
    },
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

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderActions(value: Activity, onArchive = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ActivityActions activity={value} onArchive={onArchive} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onArchive };
}

beforeEach(() => {
  vi.mocked(api.fillSecret).mockReset();
  pendingFollowups.splice(0, pendingFollowups.length);
  // Simulate a successful accept so the onSuccess archive callback fires.
  acceptMutate.mockReset();
  acceptMutate.mockImplementation((_id: string, opts?: { onSuccess?: () => void }) =>
    opts?.onSuccess?.(),
  );
  continueRunMutateAsync.mockReset();
  continueRunMutateAsync.mockResolvedValue(undefined);
  createRunFollowupMutateAsync.mockReset();
  createRunFollowupMutateAsync.mockResolvedValue(undefined);
  deleteRunFollowupMutateAsync.mockReset();
  deleteRunFollowupMutateAsync.mockResolvedValue(undefined);
  updateRunFollowupMutateAsync.mockReset();
  updateRunFollowupMutateAsync.mockResolvedValue(undefined);
});

describe("ActivityActions", () => {
  it("secret_request: fills the secret value through the form", async () => {
    vi.mocked(api.fillSecret).mockResolvedValue(
      activity({ id: "a1", kind: "secret_request", status: "archived" }),
    );
    renderActions(activity({ id: "a1", kind: "secret_request", payload: { secretKey: "K" } }));

    fireEvent.click(screen.getByText("Fill secret"));
    fireEvent.change(screen.getByLabelText("Secret value"), { target: { value: "s3cret" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(api.fillSecret).toHaveBeenCalledWith("a1", "s3cret");
    });
  });

  it("task_completed: accepts the task then archives the card", () => {
    const { onArchive } = renderActions(
      activity({ id: "a1", kind: "task_completed", payload: { taskId: "t1" } }),
    );

    fireEvent.click(screen.getByText("Accept"));

    expect(acceptMutate).toHaveBeenCalledWith("t1", expect.objectContaining({}));
    expect(onArchive).toHaveBeenCalledWith("a1");
  });

  it("task_needs_review: suggested replies fill the reply box", () => {
    renderActions(
      activity({
        id: "a1",
        kind: "task_needs_review",
        payload: {
          taskId: "t1",
          taskRunId: "r1",
          question: "Publish it?",
          suggestedReplies: ["Publish", "Revise"],
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Use suggested reply: Publish" }));

    expect(screen.getByLabelText("Review reply")).toHaveValue("Publish");
  });

  it("task_needs_review: replies and requeues before archiving the card", async () => {
    const { onArchive } = renderActions(
      activity({
        id: "a1",
        kind: "task_needs_review",
        payload: {
          taskId: "t1",
          taskRunId: "r1",
          question: "Publish it?",
          suggestedReplies: ["Publish"],
        },
      }),
    );

    fireEvent.change(screen.getByLabelText("Review reply"), { target: { value: "Publish" } });
    fireEvent.click(screen.getByText("Reply & requeue"));

    await waitFor(() => {
      expect(createRunFollowupMutateAsync).toHaveBeenCalledWith({
        taskId: "t1",
        runId: "r1",
        input: { body: "Publish", kind: "review_answer" },
      });
    });
    expect(continueRunMutateAsync).toHaveBeenCalledWith({ taskId: "t1", runId: "r1" });
    expect(onArchive).toHaveBeenCalledWith("a1");
  });

  it("subtask_needs_review: saves replies without archiving", async () => {
    const { onArchive } = renderActions(
      activity({
        id: "a1",
        kind: "subtask_needs_review",
        payload: { taskId: "t1", taskRunId: "r1", subtaskId: "s1" },
      }),
    );

    fireEvent.change(screen.getByLabelText("Reply to review request"), {
      target: { value: "Try the smaller patch." },
    });
    fireEvent.click(screen.getByText("Reply"));

    await waitFor(() => {
      expect(createRunFollowupMutateAsync).toHaveBeenCalledWith({
        taskId: "t1",
        runId: "r1",
        input: { body: "Try the smaller patch.", kind: "review_answer" },
      });
    });
    expect(continueRunMutateAsync).not.toHaveBeenCalled();
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("task_needs_review: edits and deletes pending replies inline", async () => {
    pendingFollowups.push({
      id: "f1",
      taskId: "t1",
      runId: "r1",
      kind: "review_answer",
      status: "pending",
      body: "Old reply",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    renderActions(
      activity({
        id: "a1",
        kind: "task_needs_review",
        payload: { taskId: "t1", taskRunId: "r1" },
      }),
    );

    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("Edit pending reply"), {
      target: { value: "Updated reply" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(updateRunFollowupMutateAsync).toHaveBeenCalledWith({
        taskId: "t1",
        runId: "r1",
        followupId: "f1",
        input: { body: "Updated reply" },
      });
    });

    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(deleteRunFollowupMutateAsync).toHaveBeenCalledWith({
        taskId: "t1",
        runId: "r1",
        followupId: "f1",
      });
    });
  });

  it("task_run_failed: opens the task and marks read", () => {
    const { onArchive } = renderActions(
      activity({ id: "a1", kind: "task_run_failed", payload: { taskId: "t1" } }),
    );

    fireEvent.click(screen.getByText("Open task"));
    expect(screen.getByTestId("location")).toHaveTextContent("/tasks?task=t1");

    fireEvent.click(screen.getByText("Mark read"));
    expect(onArchive).toHaveBeenCalledWith("a1");
  });
});
