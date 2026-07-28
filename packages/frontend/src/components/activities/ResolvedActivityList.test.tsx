import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Activity } from "@cc/shared/schemas";

import { ResolvedActivityList } from "./ResolvedActivityList";

import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  getActivities: vi.fn(),
  archiveActivity: vi.fn(),
  fillSecret: vi.fn(),
}));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function activity(overrides: Partial<Activity> & { id: string; title: string }): Activity {
  return {
    kind: "task_completed",
    level: "action_required",
    status: "archived",
    body: null,
    payload: { taskId: "t1" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(api.getActivities).mockReset();
});

describe("ResolvedActivityList", () => {
  it("renders resolved cards read-only (no action buttons)", async () => {
    vi.mocked(api.getActivities).mockResolvedValue({
      activities: [activity({ id: "a1", title: "Task completed: Report" })],
      actionRequiredCount: 0,
    });

    render(<ResolvedActivityList />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Task completed: Report")).toBeInTheDocument();
    });
    expect(api.getActivities).toHaveBeenCalledWith("archived");
    // Read-only: no action buttons.
    expect(screen.queryByText("Accept")).not.toBeInTheDocument();
    expect(screen.queryByText("Open task")).not.toBeInTheDocument();
    expect(screen.queryByText("Mark read")).not.toBeInTheDocument();
  });

  it("shows an empty state when there is no history", async () => {
    vi.mocked(api.getActivities).mockResolvedValue({ activities: [], actionRequiredCount: 0 });

    render(<ResolvedActivityList />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByText("No resolved activity yet")).toBeInTheDocument();
    });
  });
});
