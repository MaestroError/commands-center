import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { activityKindSchema, type Activity } from "@cc/shared/schemas";

import { ActivityActions } from "./ActivityActions";

import * as api from "@/lib/api";

const { acceptMutate, createRunFollowupMutateAsync, runTemplateNowMutate } = vi.hoisted(() => ({
  acceptMutate: vi.fn(),
  createRunFollowupMutateAsync: vi.fn(),
  runTemplateNowMutate: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fillSecret: vi.fn(),
}));

vi.mock("@/hooks/use-tasks-query", () => ({
  useTaskMutations: () => ({
    accept: { mutate: acceptMutate, isPending: false, isError: false },
    createRunFollowup: {
      mutateAsync: createRunFollowupMutateAsync,
      isPending: false,
      isError: false,
    },
    runTemplateNow: { mutate: runTemplateNowMutate, isPending: false },
  }),
}));

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistsQuery: () => ({ data: [] }),
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
  // Simulate a successful accept so the onSuccess archive callback fires.
  acceptMutate.mockReset();
  acceptMutate.mockImplementation((_id: string, opts?: { onSuccess?: () => void }) =>
    opts?.onSuccess?.(),
  );
  createRunFollowupMutateAsync.mockReset();
  createRunFollowupMutateAsync.mockResolvedValue(undefined);
  runTemplateNowMutate.mockReset();
});

describe("ActivityActions", () => {
  it.each(activityKindSchema.options)("%s: marks the notification as read", (kind) => {
    const { onArchive } = renderActions(activity({ id: `activity-${kind}`, kind }));

    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));

    expect(onArchive).toHaveBeenCalledWith(`activity-${kind}`);
  });

  it("keeps activity actions at least 44px tall on mobile", () => {
    renderActions(activity({ id: "a1", kind: "specialist_info" }));

    expect(screen.getByRole("button", { name: "Mark read" })).toHaveClass("min-h-11");
  });

  it("expands a lone primary action across the mobile footer", () => {
    renderActions(activity({ id: "a1", kind: "specialist_info" }));

    expect(screen.getByRole("button", { name: "Mark read" })).toHaveClass("flex-1");
  });

  it("keeps a multi-action mobile footer on one row", () => {
    renderActions(activity({ id: "a1", kind: "task_completed", payload: { taskId: "t1" } }));

    expect(screen.getByRole("button", { name: "Accept" }).parentElement).toHaveClass("flex-nowrap");
  });

  it("keeps secondary mobile actions at intrinsic width", () => {
    renderActions(activity({ id: "a1", kind: "task_completed", payload: { taskId: "t1" } }));

    expect(screen.getByRole("button", { name: "Open task" })).toHaveClass("shrink-0");
    expect(screen.getByRole("button", { name: "Mark read" })).toHaveClass("shrink-0");
  });

  it("uses the compact intrinsic button height on desktop", () => {
    renderActions(activity({ id: "a1", kind: "specialist_info" }));

    expect(screen.getByRole("button", { name: "Mark read" })).toHaveClass("md:min-h-0");
  });

  it("restores intrinsic primary action width on desktop", () => {
    renderActions(activity({ id: "a1", kind: "specialist_info" }));

    expect(screen.getByRole("button", { name: "Mark read" })).toHaveClass("md:flex-none");
  });

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
      activity({
        id: "a1",
        kind: "task_completed",
        level: "info",
        payload: { taskId: "t1" },
      }),
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

  it("task_needs_review: replies and archives the card in one action", async () => {
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
    fireEvent.click(screen.getByText("Reply"));

    await waitFor(() => {
      expect(createRunFollowupMutateAsync).toHaveBeenCalledWith({
        taskId: "t1",
        runId: "r1",
        input: { body: "Publish", kind: "review_answer" },
      });
    });
    expect(onArchive).toHaveBeenCalledWith("a1");
  });

  it("subtask_needs_review: replies and archives the card", async () => {
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
    expect(onArchive).toHaveBeenCalledWith("a1");
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
