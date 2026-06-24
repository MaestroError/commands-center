import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "@cc/shared/schemas";

import { ActivityActions } from "./ActivityActions";

import * as api from "@/lib/api";

const { acceptMutate } = vi.hoisted(() => ({ acceptMutate: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fillSecret: vi.fn(),
}));

vi.mock("@/hooks/use-tasks-query", () => ({
  useTaskMutations: () => ({
    accept: { mutate: acceptMutate, isPending: false, isError: false },
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
  // Simulate a successful accept so the onSuccess archive callback fires.
  acceptMutate.mockReset();
  acceptMutate.mockImplementation((_id: string, opts?: { onSuccess?: () => void }) =>
    opts?.onSuccess?.(),
  );
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

    fireEvent.click(screen.getByText("Accept (move to done)"));

    expect(acceptMutate).toHaveBeenCalledWith("t1", expect.objectContaining({}));
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
